import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import jwt from "jsonwebtoken";

import env from "../src/config/env.js";
import { authMiddleware } from "../src/middleware/auth.js";

test("authMiddleware converts a stale memory-session token into a clean 401", async () => {
  const token = jwt.sign(
    {
      sub: crypto.randomUUID(),
      sessionProfile: "standard",
      displayEmail: "obsolete-session@lokify.fr",
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };

  let forwardedError = null;

  await authMiddleware(req, {}, (error) => {
    forwardedError = error || null;
  });

  assert.ok(forwardedError);
  assert.equal(forwardedError.statusCode, 401);
  assert.match(forwardedError.message, /session invalide/i);
});
