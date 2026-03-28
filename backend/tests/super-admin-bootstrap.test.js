import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcryptjs";

import env from "../src/config/env.js";
import { query } from "../src/config/db.js";
import { ensureSuperAdminAccount } from "../src/services/auth.service.js";

test("ensureSuperAdminAccount rotates the configured super admin password when it changes", async () => {
  const previousPassword = env.lokifySuperAdminPassword;
  const nextPassword = "SuperAdminRotation123!";

  try {
    env.lokifySuperAdminPassword = nextPassword;
    await ensureSuperAdminAccount();

    const { rows } = await query(
      "SELECT password_hash FROM users WHERE email = $1 LIMIT 1",
      [env.lokifySuperAdminEmail]
    );

    assert.ok(rows[0]);
    assert.equal(await bcrypt.compare(nextPassword, rows[0].password_hash), true);
    assert.equal(await bcrypt.compare("admin", rows[0].password_hash), false);
  } finally {
    env.lokifySuperAdminPassword = previousPassword;
    await ensureSuperAdminAccount();
  }
});
