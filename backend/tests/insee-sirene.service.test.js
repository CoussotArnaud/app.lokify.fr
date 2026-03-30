import assert from "node:assert/strict";
import test from "node:test";

import env from "../src/config/env.js";
import {
  resetInseeSireneTokenCacheForTests,
  verifySiretWithSirene,
} from "../src/services/insee-sirene.service.js";

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

const configureInseeEnvForTests = ({ mode = "api-key" } = {}) => {
  env.inseeApiKey = mode === "api-key" ? "insee-api-key" : "";
  env.inseeClientId = mode === "legacy-oauth" ? "insee-client-id" : "";
  env.inseeClientSecret = mode === "legacy-oauth" ? "insee-client-secret" : "";
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

    if (nextResponse instanceof Error) {
      throw nextResponse;
    }

    return nextResponse;
  };
};

const jsonResponse = (payload, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

test("verifySiretWithSirene rejects a malformed siret before calling Insee", async () => {
  configureInseeEnvForTests();
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };

  try {
    await assert.rejects(
      () => verifySiretWithSirene("123"),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, "siret_invalid");
        return true;
      }
    );
    assert.equal(called, false);
  } finally {
    restoreInseeEnv();
  }
});

test("verifySiretWithSirene returns normalized company data for an active establishment", async () => {
  configureInseeEnvForTests();
  createFetchSequence(
    jsonResponse({
      etablissement: {
        siren: "623456789",
        numeroVoieEtablissement: "18",
        typeVoieEtablissement: "avenue",
        libelleVoieEtablissement: "des Arts",
        codePostalEtablissement: "69006",
        libelleCommuneEtablissement: "Lyon",
        activitePrincipaleEtablissement: "7729Z",
        etatAdministratifEtablissement: "A",
        enseigne1Etablissement: "Lokify Studio",
        uniteLegale: {
          denominationUniteLegale: "Atelier Horizon",
        },
      },
    })
  );

  try {
    const response = await verifySiretWithSirene(createValidSiret("6234567890000"));

    assert.equal(response.lookupStatus, "active");
    assert.equal(response.company.legalName, "Atelier Horizon");
    assert.equal(response.company.commercialName, "Lokify Studio");
    assert.equal(response.company.address, "18 avenue des Arts");
    assert.equal(response.company.postalCode, "69006");
    assert.equal(response.company.city, "Lyon");
    assert.equal(response.company.apeCode, "7729Z");
    assert.equal(response.company.siren, "623456789");
  } finally {
    restoreInseeEnv();
  }
});

test("verifySiretWithSirene reports an unknown siret", async () => {
  configureInseeEnvForTests();
  createFetchSequence(
    jsonResponse({}, { status: 404 })
  );

  try {
    await assert.rejects(
      () => verifySiretWithSirene(createValidSiret("7234567890000")),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.code, "siret_not_found");
        return true;
      }
    );
  } finally {
    restoreInseeEnv();
  }
});

test("verifySiretWithSirene reports a closed establishment", async () => {
  configureInseeEnvForTests();
  createFetchSequence(
    jsonResponse({
      etablissement: {
        siren: "823456789",
        codePostalEtablissement: "33000",
        libelleCommuneEtablissement: "Bordeaux",
        etatAdministratifEtablissement: "F",
        uniteLegale: {
          denominationUniteLegale: "SAS Fermee",
        },
      },
    })
  );

  try {
    const response = await verifySiretWithSirene(createValidSiret("8234567890000"));

    assert.equal(response.lookupStatus, "closed");
    assert.match(response.message, /ferme/i);
  } finally {
    restoreInseeEnv();
  }
});

test("verifySiretWithSirene surfaces upstream API errors cleanly", async () => {
  configureInseeEnvForTests();
  createFetchSequence(
    jsonResponse({}, { status: 503 })
  );

  try {
    await assert.rejects(
      () => verifySiretWithSirene(createValidSiret("9234567890000")),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, "sirene_api_error");
        return true;
      }
    );
  } finally {
    restoreInseeEnv();
  }
});

test("verifySiretWithSirene reports a deprecated legacy OAuth configuration cleanly", async () => {
  configureInseeEnvForTests({ mode: "legacy-oauth" });
  createFetchSequence(
    jsonResponse({}, { status: 401 }),
    jsonResponse({}, { status: 401 }),
    jsonResponse({}, { status: 404 })
  );

  try {
    await assert.rejects(
      () => verifySiretWithSirene(createValidSiret("1234567890000")),
      (error) => {
        assert.equal(error.statusCode, 502);
        assert.equal(error.code, "sirene_legacy_auth_deprecated");
        return true;
      }
    );
  } finally {
    restoreInseeEnv();
  }
});
