'use strict';

const crypto = require('node:crypto');
const { put } = require('@vercel/blob');
const { requireAuth } = require('./_lib/auth');
const { uploadInput, ALLOWED_IMAGE_MIME } = require('./_lib/validate');
const { ok, fail, serverError } = require('./_lib/respond');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return fail(res, 405, 'method_not_allowed');
    }
    if (!requireAuth(req, res)) return;

    const parsed = uploadInput.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input');

    const match = ALLOWED_IMAGE_MIME.exec(parsed.data.image);
    const subtype = match[1] === 'jpg' ? 'jpeg' : match[1];
    const mime = `image/${subtype}`;
    const base64 = parsed.data.image.slice(match[0].length);
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return fail(res, 400, 'image_too_large');
    }

    const ext = EXT_BY_MIME[mime] || 'jpg';
    const pathname = `entries/${crypto.randomUUID()}.${ext}`;

    const blob = await put(pathname, buffer, {
      access: 'private',
      contentType: mime,
      addRandomSuffix: false
    });

    // The store is private, so `blob.url` needs an Authorization header to
    // read — useless in a plain <img src>. Point the DB at our own proxy
    // instead (see api/photo.js), which holds that credential server-side.
    const url = `/api/photo?p=${encodeURIComponent(blob.pathname)}`;
    return ok(res, { url, pathname: blob.pathname }, 201);
  } catch (err) {
    return serverError(res, err);
  }
};
