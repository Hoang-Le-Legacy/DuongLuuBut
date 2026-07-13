'use strict';

const { listEntries, createEntry } = require('../_lib/db');
const { verifyToken, requireAuth } = require('../_lib/auth');
const { entryInput } = require('../_lib/validate');
const { ok, fail, serverError } = require('../_lib/respond');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const unlocked = verifyToken(req);
      const entries = await listEntries(unlocked);
      return ok(res, { entries, unlocked });
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return;
      const parsed = entryInput.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, 'invalid_input');
      const entry = await createEntry(parsed.data);
      return ok(res, { entry }, 201);
    }

    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    return serverError(res, err);
  }
};
