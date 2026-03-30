import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCorsOriginChecker,
  isVercelPreviewOriginAllowed,
} from "../src/lib/cors-origin.js";

test("preview runtime accepts preview frontend origins even if hostname prefix differs", () => {
  const isAllowed = isVercelPreviewOriginAllowed(
    "https://app-lokify-5fh249ef1-arnauds-projects-7eaef039.vercel.app",
    {
      allowVercelPreviewOrigins: false,
      vercelEnv: "preview",
      vercelFrontendProjectName: "app-lokify-fr",
    }
  );

  assert.equal(isAllowed, true);
});

test("non-preview runtime still enforces configured project name when provided", () => {
  const isAllowed = isVercelPreviewOriginAllowed(
    "https://other-preview-arnauds-projects-7eaef039.vercel.app",
    {
      allowVercelPreviewOrigins: true,
      vercelEnv: "production",
      vercelFrontendProjectName: "app-lokify-fr",
    }
  );

  assert.equal(isAllowed, false);
});

test("cors checker keeps direct client url allowlist working", () => {
  const isAllowedOrigin = buildCorsOriginChecker({
    clientUrls: ["https://app.lokify.fr"],
  });

  assert.equal(isAllowedOrigin("https://app.lokify.fr"), true);
  assert.equal(isAllowedOrigin("https://forbidden.example.com"), false);
});

test("cors checker accepts localhost preview ports during local development", () => {
  const isAllowedOrigin = buildCorsOriginChecker({
    clientUrls: ["http://localhost:3001"],
    allowLocalDevelopmentOrigins: true,
  });

  assert.equal(isAllowedOrigin("http://localhost:3002"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:3010"), true);
  assert.equal(isAllowedOrigin("https://localhost:3002"), false);
});

test("cors checker does not open localhost origins when local development allowance is disabled", () => {
  const isAllowedOrigin = buildCorsOriginChecker({
    clientUrls: ["http://localhost:3001"],
    allowLocalDevelopmentOrigins: false,
  });

  assert.equal(isAllowedOrigin("http://localhost:3002"), false);
});
