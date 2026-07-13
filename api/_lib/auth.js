/**
 * Password hashing (scrypt) + signed unlock tokens (HMAC, no session table).
 *
 * Dương is the only writer: the single password hash lives in `settings`,
 * and `verifyToken` is the gate every mutating endpoint calls before doing
 * anything else. There is no per-user identity — the token just proves
 * "this request presented the correct password within the last N hours".
 */
'use strict';

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

/** Issues a bearer token that proves the caller unlocked with the correct password. */
function issueToken() {
  const payload = base64url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** Extracts and validates the bearer token from a request. Returns true/false. */
function verifyToken(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

/** Guard for mutating endpoints. Sends 401 and returns false when unauthorized. */
function requireAuth(req, res) {
  if (verifyToken(req)) return true;
  res.status(401).json({ success: false, error: 'unauthorized' });
  return false;
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, requireAuth };
