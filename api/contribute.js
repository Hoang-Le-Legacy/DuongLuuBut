'use strict';

const { createEntry } = require('./_lib/db');
const { verifyContributeToken } = require('./_lib/shareToken');
const { contributeInput } = require('./_lib/validate');
const { ok, fail, serverError } = require('./_lib/respond');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const valid = await verifyContributeToken(req.query.token);
      return ok(res, { valid });
    }

    if (req.method === 'POST') {
      const parsed = contributeInput.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, 'invalid_input');

      const validToken = await verifyContributeToken(parsed.data.token);
      if (!validToken) return fail(res, 401, 'invalid_link');

      const { token, ...data } = parsed.data;
      await createEntry({ ...data, isPrivate: true, contributed: true });
      // The guest doesn't need the entry back — keep the response minimal.
      return ok(res, {}, 201);
    }

    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    return serverError(res, err);
  }
};
