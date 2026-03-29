import assert from "node:assert/strict";
import test from "node:test";

import { previewSiretVerification } from "../src/services/insee-sirene.service.js";

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

test("previewSiretVerification gracefully falls back to format validation locally", async () => {
  const response = await previewSiretVerification(createValidSiret("8234567890000"));

  assert.equal(response.lookupStatus, "format_validated");
  assert.equal(response.company, null);
  assert.match(response.message, /verification insee detaillee indisponible/i);
});
