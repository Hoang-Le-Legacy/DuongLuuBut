'use strict';

const { getSetting, setSetting } = require('./_lib/db');
const { verifyPassword, hashPassword, requireAuth } = require('./_lib/auth');
const { passwordChangeInput } = require('./_lib/validate');
const { ok, fail, serverError } = require('./_lib/respond');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return fail(res, 405, 'method_not_allowed');
    }
    if (!requireAuth(req, res)) return;

    const parsed = passwordChangeInput.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input');

    const hash = await getSetting('admin_password_hash');
    const valid = hash ? verifyPassword(parsed.data.currentPassword, hash) : false;
    if (!valid) return fail(res, 401, 'invalid_credentials');

    await setSetting('admin_password_hash', hashPassword(parsed.data.newPassword));
    return ok(res, { changed: true });
  } catch (err) {
    return serverError(res, err);
  }
};
