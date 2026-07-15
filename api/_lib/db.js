/**
 * Neon (Postgres) data access — one place for every query in the app.
 * Uses the HTTP driver (`neon()`), parameterized tagged-template queries only.
 */
'use strict';

const crypto = require('node:crypto');
const { neon } = require('@neondatabase/serverless');

let cachedSql = null;
function sql(...args) {
  if (!cachedSql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    cachedSql = neon(process.env.DATABASE_URL);
  }
  return cachedSql(...args);
}
function getSqlClient() {
  if (!cachedSql) sql(); // ensure initialized
  return cachedSql;
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toImageDTO(row) {
  return { url: row.url, pathname: row.pathname, position: row.position };
}

/**
 * `redact: true` produces a teaser DTO for a private entry viewed without
 * the unlock token: the page still shows up in the flip sequence (so its
 * existence is visible and its position holds), but the message, sender,
 * date, and photos are withheld — only Dương's unlock reveals them.
 */
function toEntryDTO(row, images, { redact = false } = {}) {
  if (redact && row.is_private) {
    return {
      id: row.id,
      sender: null,
      message: null,
      date: null,
      isPrivate: true,
      locked: true,
      contributed: row.contributed,
      images: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  return {
    id: row.id,
    sender: row.sender,
    message: row.message,
    date: toIsoDate(row.entry_date),
    isPrivate: row.is_private,
    locked: false,
    contributed: row.contributed,
    images: (images || []).map(toImageDTO),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listEntries(includePrivate) {
  const rows = await sql`select * from entries order by position asc, created_at asc`;

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const images = await sql`
    select * from entry_images where entry_id = any(${ids}) order by entry_id, position asc
  `;
  const imagesByEntry = new Map();
  for (const img of images) {
    if (!imagesByEntry.has(img.entry_id)) imagesByEntry.set(img.entry_id, []);
    imagesByEntry.get(img.entry_id).push(img);
  }
  const redact = !includePrivate;
  return rows.map((r) => toEntryDTO(r, imagesByEntry.get(r.id), { redact }));
}

async function getEntry(id, includePrivate) {
  const rows = includePrivate
    ? await sql`select * from entries where id = ${id}`
    : await sql`select * from entries where id = ${id} and is_private = false`;
  const row = rows[0];
  if (!row) return null;
  const images = await sql`select * from entry_images where entry_id = ${id} order by position asc`;
  return toEntryDTO(row, images);
}

async function createEntry(data) {
  const id = crypto.randomUUID();
  const images = data.images || [];

  const queries = [
    sql`insert into entries (id, sender, message, entry_date, is_private, contributed)
        values (${id}, ${data.sender}, ${data.message}, ${data.date ?? null}, ${data.isPrivate ?? false}, ${data.contributed ?? false})`
  ];
  images.forEach((img) => {
    queries.push(sql`
      insert into entry_images (entry_id, url, pathname, position)
      values (${id}, ${img.url}, ${img.pathname}, ${img.position})
    `);
  });

  await getSqlClient().transaction(queries);
  return getEntry(id, true);
}

/**
 * Updates an entry's fields and (optionally) replaces its image set.
 * Returns `{ entry, removedPathnames }` — the caller must `del()` the
 * removed pathnames from Vercel Blob after the DB write succeeds.
 */
async function updateEntry(id, data) {
  const existingRows = await sql`select * from entries where id = ${id}`;
  const existing = existingRows[0];
  if (!existing) return null;

  // The HTTP driver has no fragment composition for dynamic SET lists, so
  // merge onto the current row and write every column with concrete values.
  const merged = {
    sender: data.sender !== undefined ? data.sender : existing.sender,
    message: data.message !== undefined ? data.message : existing.message,
    date: data.date !== undefined ? data.date : toIsoDate(existing.entry_date),
    isPrivate: data.isPrivate !== undefined ? data.isPrivate : existing.is_private
  };

  let removedPathnames = [];
  const queries = [sql`
    update entries set
      sender = ${merged.sender},
      message = ${merged.message},
      entry_date = ${merged.date},
      is_private = ${merged.isPrivate},
      updated_at = now()
    where id = ${id}
  `];

  if (data.images !== undefined) {
    const currentImages = await sql`select pathname from entry_images where entry_id = ${id}`;
    const keepPathnames = new Set(data.images.map((img) => img.pathname));
    removedPathnames = currentImages
      .map((r) => r.pathname)
      .filter((pathname) => !keepPathnames.has(pathname));

    queries.push(sql`delete from entry_images where entry_id = ${id}`);
    data.images.forEach((img) => {
      queries.push(sql`
        insert into entry_images (entry_id, url, pathname, position)
        values (${id}, ${img.url}, ${img.pathname}, ${img.position})
      `);
    });
  }

  await getSqlClient().transaction(queries);

  const entry = await getEntry(id, true);
  return { entry, removedPathnames };
}

/** Deletes an entry and returns the Blob pathnames that must be `del()`-ed. */
async function deleteEntry(id) {
  const images = await sql`select pathname from entry_images where entry_id = ${id}`;
  const result = await sql`delete from entries where id = ${id} returning id`;
  if (result.length === 0) return null;
  return { removedPathnames: images.map((r) => r.pathname) };
}

function toWishDTO(row) {
  return { id: row.id, sender: row.sender, text: row.text, createdAt: row.created_at };
}

async function listWishes() {
  const rows = await sql`select * from wishes order by position asc, created_at asc`;
  return rows.map(toWishDTO);
}

async function createWish(data) {
  const id = crypto.randomUUID();
  await sql`insert into wishes (id, sender, text) values (${id}, ${data.sender}, ${data.text})`;
  return { id };
}

async function getSetting(key) {
  const rows = await sql`select value from settings where key = ${key}`;
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await sql`
    insert into settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value
  `;
}

module.exports = {
  sql,
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  listWishes,
  createWish,
  getSetting,
  setSetting
};
