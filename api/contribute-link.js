'use strict';

const { requireAuth } = require('./_lib/auth');
const { getContributeToken, createContributeToken, revokeContributeToken } = require('./_lib/shareToken');
const { ok, fail, serverError } = require('./_lib/respond');

module.exports = async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method === 'GET') {
      const token = await getContributeToken();
      return ok(res, { token });
    }

    if (req.method === 'POST') {
      const token = await createContributeToken();
      return ok(res, { token }, 201);
    }

    if (req.method === 'DELETE') {
      await revokeContributeToken();
      return ok(res, {});
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return fail(res, 405, 'method_not_allowed');
  } catch (err) {
    return serverError(res, err);
  }
};
