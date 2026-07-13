/** Consistent `{ success, data? , error? }` response envelope for every endpoint. */
'use strict';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function fail(res, status, error) {
  res.status(status).json({ success: false, error });
}

/** Generic 500 for unexpected errors; never leaks internals to the client. */
function serverError(res, err) {
  console.error(err);
  fail(res, 500, 'internal_error');
}

module.exports = { ok, fail, serverError };
