import assert from "node:assert/strict";
import test from "node:test";

import { errorHandler } from "../src/middleware/error-handler.js";
import HttpError from "../src/utils/http-error.js";

const createMockResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

test("error handler keeps trusted HttpError codes while hiding details on 5xx", async () => {
  const res = createMockResponse();
  const error = new HttpError(503, "Service temporairement indisponible.", {
    code: "upstream_temporarily_unavailable",
    details: { internal: true },
  });

  errorHandler(error, {}, res, () => {});

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.message, "Service temporairement indisponible.");
  assert.equal(res.payload.code, "upstream_temporarily_unavailable");
  assert.equal(res.payload.details, undefined);
});

test("error handler does not leak implementation details for unexpected 500 errors", async () => {
  const res = createMockResponse();
  const error = new Error("sensitive failure");
  error.code = "ECONNRESET";
  error.details = { secret: true };

  errorHandler(error, {}, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.message, "Une erreur interne est survenue.");
  assert.equal(res.payload.code, undefined);
  assert.equal(res.payload.details, undefined);
});
