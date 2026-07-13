'use strict';

const { Readable } = require('node:stream');
const { get } = require('@vercel/blob');
const { fail, serverError } = require('./_lib/respond');

/**
 * Streams a photo out of the (private) Blob store.
 *
 * Why no bearer-token auth here: a plain `<img src="...">` can't attach an
 * `Authorization` header, so this route can't gate on the unlock token the
 * way every other mutating endpoint does. That's fine — the thing that
 * actually needs gating is *who receives a pathname in the first place*,
 * and that's already handled by GET /api/entries (private entries, and
 * therefore their photo pathnames, are never sent to a client without a
 * valid token). Once a client legitimately has a pathname, serving the
 * bytes back to it is equivalent to what a "public" Blob store would do
 * for free — we're just proxying because the store itself is private.
 */
const PATHNAME_RE = /^entries\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return fail(res, 405, 'method_not_allowed');
    }

    const pathname = req.query.p;
    if (typeof pathname !== 'string' || !PATHNAME_RE.test(pathname)) {
      return fail(res, 400, 'invalid_pathname');
    }

    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return fail(res, 404, 'not_found');
    }

    res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Pathnames embed a fresh UUID per upload and are never overwritten, so
    // this is safe to cache hard at both the browser and any edge/CDN layer.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (req.method === 'HEAD') return res.status(200).end();

    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    return serverError(res, err);
  }
};
