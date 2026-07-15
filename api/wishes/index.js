'use strict';

const { listWishes, createWish } = require('../_lib/db');
const { verifyContributeToken } = require('../_lib/shareToken');
const { wishInput } = require('../_lib/validate');
const { ok, fail, serverError } = require('../_lib/respond');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Always public — no auth check, no private variant (unlike /api/entries).
      const wishes = await listWishes();
      return ok(res, { wishes });
    }

    if (req.method === 'POST') {
      const parsed = wishInput.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, 'invalid_input');

      const validToken = await verifyContributeToken(parsed.data.token);
      if (!validToken) return fail(res, 401, 'invalid_link');

      const { token, ...data } = parsed.data;
      await createWish(data);
      return ok(res, {}, 201);
    }

    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    return serverError(res, err);
  }
};
