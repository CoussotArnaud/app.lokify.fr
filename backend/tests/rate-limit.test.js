import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimitMiddleware } from "../src/middleware/rate-limit.js";

const createMockResponse = () => {
  const headers = new Map();

  return {
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
};

test("rate limiter allows requests within the configured budget", async () => {
  const middleware = createRateLimitMiddleware({
    keyPrefix: "test-allow",
    max: 2,
    windowMs: 60_000,
  });
  const req = {
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  };

  let forwardedError = null;
  middleware(req, createMockResponse(), (error) => {
    forwardedError = error || null;
  });

  assert.equal(forwardedError, null);
});

test("rate limiter blocks requests once the threshold is exceeded", async () => {
  const middleware = createRateLimitMiddleware({
    keyPrefix: "test-block",
    max: 1,
    windowMs: 60_000,
    code: "custom_rate_limit",
  });
  const req = {
    headers: {
      "x-forwarded-for": "203.0.113.20",
    },
  };

  middleware(req, createMockResponse(), () => {});

  let forwardedError = null;
  const res = createMockResponse();
  middleware(req, res, (error) => {
    forwardedError = error || null;
  });

  assert.ok(forwardedError);
  assert.equal(forwardedError.statusCode, 429);
  assert.equal(forwardedError.code, "custom_rate_limit");
  assert.match(forwardedError.message, /trop de requetes/i);
  assert.ok(res.headers.has("Retry-After"));
});
