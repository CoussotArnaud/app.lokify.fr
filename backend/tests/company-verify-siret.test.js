import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import app from "../src/app.js";
import env from "../src/config/env.js";
import { resetInseeSireneTokenCacheForTests } from "../src/services/insee-sirene.service.js";

const originalFetch = global.fetch;
const originalInseeApiKey = env.inseeApiKey;
const originalInseeClientId = env.inseeClientId;
const originalInseeClientSecret = env.inseeClientSecret;
const originalInseeApiBaseUrl = env.inseeApiBaseUrl;
const originalInseeTokenUrl = env.inseeTokenUrl;
const originalInseeTimeoutMs = env.inseeTimeoutMs;

const createValidSiret = (seed) => {
  const base = String(seed || "")
    .replace(/\D/g, "")
    .padEnd(13, "0")
    .slice(0, 13);

  for (let lastDigit = 0; lastDigit <= 9; lastDigit += 1) {
    const candidate = `${base}${lastDigit}`;
    let sum = 0;
    let shouldDouble = false;

    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      let digit = Number(candidate[index]);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    if (sum % 10 === 0) {
      return candidate;
    }
  }

  throw new Error("Impossible de generer un SIRET de test.");
};

const configureInseeEnvForTests = () => {
  env.inseeApiKey = "insee-api-key";
  env.inseeClientId = "";
  env.inseeClientSecret = "";
  env.inseeApiBaseUrl = "https://api.insee.test/api-sirene/3.11";
  env.inseeTokenUrl = "https://api.insee.test/token";
  env.inseeTimeoutMs = 1000;
  resetInseeSireneTokenCacheForTests();
};

const restoreInseeEnv = () => {
  env.inseeApiKey = originalInseeApiKey;
  env.inseeClientId = originalInseeClientId;
  env.inseeClientSecret = originalInseeClientSecret;
  env.inseeApiBaseUrl = originalInseeApiBaseUrl;
  env.inseeTokenUrl = originalInseeTokenUrl;
  env.inseeTimeoutMs = originalInseeTimeoutMs;
  global.fetch = originalFetch;
  resetInseeSireneTokenCacheForTests();
};

const createFetchSequence = (...responses) => {
  let index = 0;

  global.fetch = async () => {
    const nextResponse = responses[index];
    index += 1;
    return nextResponse;
  };
};

const jsonResponse = (payload, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const startServer = async () =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

test("POST /api/company/verify-siret returns normalized company data", async () => {
  configureInseeEnvForTests();
  createFetchSequence(
    jsonResponse({
      etablissement: {
        siren: "623456789",
        numeroVoieEtablissement: "4",
        typeVoieEtablissement: "rue",
        libelleVoieEtablissement: "des Tests",
        codePostalEtablissement: "75001",
        libelleCommuneEtablissement: "Paris",
        activitePrincipaleEtablissement: "7729Z",
        etatAdministratifEtablissement: "A",
        uniteLegale: {
          denominationUniteLegale: "Studio Test",
        },
      },
    })
  );

  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await originalFetch(`${baseUrl}/api/company/verify-siret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siret: createValidSiret("6234567890000"),
      }),
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.lookupStatus, "active");
    assert.equal(payload.company.legalName, "Studio Test");
    assert.equal(payload.company.city, "Paris");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreInseeEnv();
  }
});

test("POST /api/company/verify-siret returns a clear validation error on malformed siret", async () => {
  configureInseeEnvForTests();
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await originalFetch(`${baseUrl}/api/company/verify-siret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siret: "123",
      }),
    });

    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, "siret_invalid");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreInseeEnv();
  }
});
