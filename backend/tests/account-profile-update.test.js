import assert from "node:assert/strict";
import test from "node:test";

import env from "../src/config/env.js";
import { loginUser } from "../src/services/auth.service.js";
import { updateCurrentUserProfile } from "../src/services/current-user.service.js";

test("super admin can update the display name used in the dashboard", async () => {
  const login = await loginUser({
    email: env.lokifySuperAdminEmail,
    password: env.lokifySuperAdminPassword,
  });

  const updatedProfile = await updateCurrentUserProfile(
    login.user.id,
    {
      full_name: "Arnau Lokify",
      first_name: "Arnau",
      last_name: "Lokify",
      phone: "06 12 34 56 78",
    },
    {
      sessionProfile: "standard",
      displayEmail: login.user.email,
    }
  );

  assert.equal(updatedProfile.full_name, "Arnau Lokify");
  assert.equal(updatedProfile.first_name, "Arnau");
  assert.equal(updatedProfile.last_name, "Lokify");
  assert.equal(updatedProfile.phone, "06 12 34 56 78");
});

test("profile update requires a non-empty display name", async () => {
  const login = await loginUser({
    email: env.lokifySuperAdminEmail,
    password: env.lokifySuperAdminPassword,
  });

  await assert.rejects(
    () =>
      updateCurrentUserProfile(
        login.user.id,
        {
          full_name: "   ",
          first_name: "",
          last_name: "",
        },
        {
          sessionProfile: "standard",
          displayEmail: login.user.email,
        }
      ),
    /nom affiche est obligatoire/i
  );
});
