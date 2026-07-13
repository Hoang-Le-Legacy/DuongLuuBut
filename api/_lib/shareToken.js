/**
 * The "contribute link" token — a high-entropy random string (not a
 * human-chosen password), so it's stored as plaintext in `settings`
 * (Dương needs to read it back to copy/share the URL, unlike the admin
 * password which is only ever compared, never displayed). Still compared
 * with `timingSafeEqual` out of habit / defense in depth.
 */
'use strict';

const crypto = require('node:crypto');
const { getSetting, setSetting } = require('./db');

const SETTING_KEY = 'contribute_token';

function generateToken() {
  return crypto.randomBytes(24).toString('base64url'); // 192 bits
}

async function getContributeToken() {
  const value = await getSetting(SETTING_KEY);
  return value || null; // '' (revoked) and missing both mean "no active link"
}

async function createContributeToken() {
  const token = generateToken();
  await setSetting(SETTING_KEY, token);
  return token;
}

async function revokeContributeToken() {
  await setSetting(SETTING_KEY, '');
}

async function verifyContributeToken(candidate) {
  if (typeof candidate !== 'string' || !candidate) return false;
  const stored = await getContributeToken();
  if (!stored) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { getContributeToken, createContributeToken, revokeContributeToken, verifyContributeToken };
