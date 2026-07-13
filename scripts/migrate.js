#!/usr/bin/env node
/**
 * Runs db/schema.sql against DATABASE_URL and seeds the admin password hash
 * (from ADMIN_PASSWORD, default "DuongDomino") if one isn't set yet.
 *
 * Usage:
 *   npm run migrate
 *
 * Reads a local `.env` file (if present) so you don't have to export vars
 * by hand; real deploys get env vars from Vercel directly.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('@neondatabase/serverless');
const { hashPassword } = require('../api/_lib/auth');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set (add it to .env or export it before running).');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    console.log('Applying db/schema.sql…');
    await pool.query(schemaSql);
    console.log('Schema OK: entries, entry_images, settings.');

    const existing = await pool.query('select value from settings where key = $1', [
      'admin_password_hash'
    ]);

    if (existing.rows.length === 0) {
      const initialPassword = process.env.ADMIN_PASSWORD || 'DuongDomino';
      const hash = hashPassword(initialPassword);
      await pool.query(
        `insert into settings (key, value) values ($1, $2)
         on conflict (key) do nothing`,
        ['admin_password_hash', hash]
      );
      console.log('Seeded admin_password_hash from ADMIN_PASSWORD.');
    } else {
      console.log('admin_password_hash already set — left untouched.');
    }

    console.log('Migration complete.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
