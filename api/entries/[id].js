'use strict';

const { del } = require('@vercel/blob');
const { updateEntry, deleteEntry } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { entryUpdate } = require('../_lib/validate');
const { ok, fail, serverError } = require('../_lib/respond');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function removeBlobs(pathnames) {
  if (!pathnames || pathnames.length === 0) return;
  await Promise.allSettled(pathnames.map((pathname) => del(pathname)));
}

module.exports = async function handler(req, res) {
  try {
    const { id } = req.query;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return fail(res, 400, 'invalid_id');
    }

    if (req.method === 'PATCH') {
      if (!requireAuth(req, res)) return;
      const parsed = entryUpdate.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, 'invalid_input');
      const result = await updateEntry(id, parsed.data);
      if (!result) return fail(res, 404, 'not_found');
      await removeBlobs(result.removedPathnames);
      return ok(res, { entry: result.entry });
    }

    if (req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;
      const result = await deleteEntry(id);
      if (!result) return fail(res, 404, 'not_found');
      await removeBlobs(result.removedPathnames);
      return ok(res, { id });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    return serverError(res, err);
  }
};
