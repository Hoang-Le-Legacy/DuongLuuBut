'use strict';

const { getSetting } = require('./_lib/db');
const { verifyPassword, issueToken } = require('./_lib/auth');
const { unlockInput } = require('./_lib/validate');
const { ok, fail, serverError } = require('./_lib/respond');

const MIN_RESPONSE_MS = 300; // blunt brute-force timing/rate a little

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return fail(res, 405, 'method_not_allowed');
    }

    const parsed = unlockInput.safeParse(req.body);
    if (!parsed.success) {
      await delay(MIN_RESPONSE_MS);
      return fail(res, 400, 'invalid_input');
    }

    const hash = await getSetting('admin_password_hash');
    const valid = hash ? verifyPassword(parsed.data.password, hash) : false;

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) await delay(MIN_RESPONSE_MS - elapsed);

    if (!valid) return fail(res, 401, 'invalid_credentials');

    return ok(res, { token: issueToken() });
  } catch (err) {
    return serverError(res, err);
  }
};
