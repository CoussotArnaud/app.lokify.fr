import env from "../config/env.js";
import HttpError from "../utils/http-error.js";
import { isValidSiret, normalizeSiret } from "../utils/siret.js";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const SSL_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
  pendingPromise: null,
};

const toTrimmedString = (value) => String(value || "").trim();

const getExplicitInseeApiKey = () => toTrimmedString(env.inseeApiKey);

const getLegacyOAuthClientId = () => toTrimmedString(env.inseeClientId);

const getLegacyOAuthClientSecret = () => toTrimmedString(env.inseeClientSecret);

const hasLegacyOAuthCredentials = () =>
  Boolean(getLegacyOAuthClientId() && getLegacyOAuthClientSecret());

const getApiKeyCandidates = () => {
  const explicitApiKey = getExplicitInseeApiKey();

  if (explicitApiKey) {
    return [explicitApiKey];
  }

  return Array.from(
    new Set([getLegacyOAuthClientId(), getLegacyOAuthClientSecret()].filter(Boolean))
  );
};

const firstNonEmpty = (...values) =>
  values
    .flat()
    .map((value) => String(value || "").trim())
    .find(Boolean) || null;

const joinAddressParts = (...parts) =>
  firstNonEmpty(
    parts
      .flat()
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  );

const maskSiretForLogs = (value) => {
  const normalized = normalizeSiret(value);

  if (normalized.length <= 4) {
    return normalized;
  }

  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};

const buildNetworkHttpError = (error, fallbackCode = "sirene_api_error") => {
  const technicalCode = String(error?.cause?.code || error?.code || "").trim();
  const technicalMessage = String(error?.cause?.message || error?.message || "").trim();
  const combinedMessage = `${technicalCode} ${technicalMessage}`.trim();

  if (error?.name === "AbortError") {
    return new HttpError(504, "Le service SIRENE ne repond pas pour le moment.", {
      code: "sirene_timeout",
    });
  }

  if (
    SSL_ERROR_CODES.has(technicalCode) ||
    /certificate|certificat|tls|ssl/i.test(combinedMessage)
  ) {
    return new HttpError(
      503,
      "La verification SIRENE est temporairement indisponible (certificat ou TLS).",
      {
        code: "sirene_ssl_error",
      }
    );
  }

  return new HttpError(503, "Le service SIRENE est temporairement indisponible.", {
    code: fallbackCode,
  });
};

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const fetchWithTimeout = async (url, options = {}, fallbackCode = "sirene_api_error") => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.inseeTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    throw buildNetworkHttpError(error, fallbackCode);
  } finally {
    clearTimeout(timeout);
  }
};

const buildAuthorizationHeader = () =>
  `Basic ${Buffer.from(
    `${getLegacyOAuthClientId()}:${getLegacyOAuthClientSecret()}`
  ).toString("base64")}`;

const buildApiKeyHeaders = (apiKey) => ({
  "X-INSEE-Api-Key-Integration": apiKey,
  Accept: "application/json",
});

const normalizeSireneCompanyPayload = (etablissement, normalizedSiret) => {
  const unit = etablissement?.uniteLegale || {};
  const addressNode = etablissement?.adresseEtablissement || {};
  const legalName =
    firstNonEmpty(
      unit.denominationUniteLegale,
      unit.denominationUsuelle1UniteLegale,
      unit.denominationUsuelle2UniteLegale,
      unit.denominationUsuelle3UniteLegale,
      etablissement?.denominationUsuelleEtablissement
    ) ||
    joinAddressParts(unit.prenom1UniteLegale, unit.nomUniteLegale);

  const commercialName = firstNonEmpty(
    etablissement?.enseigne1Etablissement,
    etablissement?.enseigne2Etablissement,
    etablissement?.enseigne3Etablissement,
    etablissement?.denominationUsuelleEtablissement,
    unit.sigleUniteLegale
  );

  const address = joinAddressParts(
    firstNonEmpty(
      etablissement?.numeroVoieEtablissement,
      addressNode.numeroVoieEtablissement,
      addressNode.numeroVoie
    ),
    firstNonEmpty(
      etablissement?.indiceRepetitionEtablissement,
      addressNode.indiceRepetitionEtablissement,
      addressNode.indiceRepetition
    ),
    firstNonEmpty(
      etablissement?.typeVoieEtablissement,
      addressNode.typeVoieEtablissement,
      addressNode.typeVoie
    ),
    firstNonEmpty(
      etablissement?.libelleVoieEtablissement,
      addressNode.libelleVoieEtablissement,
      addressNode.libelleVoie
    ),
    firstNonEmpty(
      etablissement?.complementAdresseEtablissement,
      addressNode.complementAdresseEtablissement,
      addressNode.complementAdresse
    )
  );

  const postalCode = firstNonEmpty(
    etablissement?.codePostalEtablissement,
    addressNode.codePostalEtablissement,
    addressNode.codePostal
  );
  const city = firstNonEmpty(
    etablissement?.libelleCommuneEtablissement,
    addressNode.libelleCommuneEtablissement,
    addressNode.libelleCommune
  );
  const apeCode = firstNonEmpty(
    etablissement?.activitePrincipaleEtablissement,
    unit.activitePrincipaleUniteLegale
  );
  const establishmentStatus = firstNonEmpty(etablissement?.etatAdministratifEtablissement);
  const lookupStatus =
    establishmentStatus && establishmentStatus.toUpperCase() === "F" ? "closed" : "active";

  return {
    siret: normalizedSiret,
    siren: firstNonEmpty(etablissement?.siren),
    legalName,
    commercialName,
    address,
    postalCode,
    city,
    apeCode,
    establishmentStatus,
    lookupStatus,
  };
};

export const hasInseeSireneCredentials = () =>
  Boolean(getApiKeyCandidates().length || hasLegacyOAuthCredentials());

export const resetInseeSireneTokenCache = () => {
  tokenCache = {
    accessToken: null,
    expiresAt: 0,
    pendingPromise: null,
  };
};

export const resetInseeSireneTokenCacheForTests = () => resetInseeSireneTokenCache();

const getInseeAccessToken = async ({ forceRefresh = false } = {}) => {
  if (!hasInseeSireneCredentials()) {
    throw new HttpError(
      503,
      "La verification SIRENE n'est pas configuree sur cet environnement.",
      {
        code: "sirene_not_configured",
      }
    );
  }

  if (
    !forceRefresh &&
    tokenCache.accessToken &&
    Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS
  ) {
    return tokenCache.accessToken;
  }

  if (tokenCache.pendingPromise) {
    return tokenCache.pendingPromise;
  }

  tokenCache.pendingPromise = (async () => {
    let response;

    try {
      response = await fetchWithTimeout(
        env.inseeTokenUrl,
        {
          method: "POST",
          headers: {
            Authorization: buildAuthorizationHeader(),
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
          }),
        },
        "sirene_auth_error"
      );
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(
        502,
        "L'authentification au service SIRENE a echoue pour le moment.",
        {
          code: "sirene_auth_error",
        }
      );
    }

    if (!response.ok) {
      console.error("SIRENE token request failed", {
        status: response.status,
      });

      if (response.status === 404) {
        throw new HttpError(
          502,
          "La configuration SIRENE de cet environnement utilise un mode d'authentification obsolete.",
          {
            code: "sirene_legacy_auth_deprecated",
          }
        );
      }

      throw new HttpError(
        502,
        "L'authentification au service SIRENE a echoue pour le moment.",
        {
          code: "sirene_auth_error",
        }
      );
    }

    const payload = await readJsonSafely(response);
    const accessToken = String(payload?.access_token || "").trim();
    const expiresIn = Number(payload?.expires_in || 3600);

    if (!accessToken) {
      throw new HttpError(
        502,
        "Le service SIRENE n'a pas fourni de jeton exploitable.",
        {
          code: "sirene_auth_error",
        }
      );
    }

    tokenCache.accessToken = accessToken;
    tokenCache.expiresAt = Date.now() + Math.max(300, expiresIn) * 1000;
    return tokenCache.accessToken;
  })();

  try {
    return await tokenCache.pendingPromise;
  } finally {
    tokenCache.pendingPromise = null;
  }
};

const executeAuthenticatedLookupResponse = async (response, normalizedSiret) => {
  if (response.status === 404) {
    console.warn("SIRENE lookup did not find a matching SIRET", {
      siret: maskSiretForLogs(normalizedSiret),
    });

    throw new HttpError(404, "Ce numero de SIRET est introuvable.", {
      code: "siret_not_found",
    });
  }

  if (response.status === 400) {
    throw new HttpError(400, "Le numero de SIRET est invalide.", {
      code: "siret_invalid",
    });
  }

  if (!response.ok) {
    console.error("SIRENE lookup failed", {
      status: response.status,
      siret: maskSiretForLogs(normalizedSiret),
    });

    throw new HttpError(
      503,
      "Le service SIRENE est temporairement indisponible. Merci de reessayer.",
      {
        code: "sirene_api_error",
      }
    );
  }

  return response;
};

const executeSiretLookupWithApiKey = async (normalizedSiret) => {
  let hadUnauthorizedCandidate = false;

  for (const apiKey of getApiKeyCandidates()) {
    const response = await fetchWithTimeout(
      `${String(env.inseeApiBaseUrl || "").replace(/\/$/, "")}/siret/${normalizedSiret}`,
      {
        method: "GET",
        headers: buildApiKeyHeaders(apiKey),
      }
    );

    if (response.status === 401 || response.status === 403) {
      hadUnauthorizedCandidate = true;
      continue;
    }

    return executeAuthenticatedLookupResponse(response, normalizedSiret);
  }

  if (hadUnauthorizedCandidate) {
    throw new HttpError(
      502,
      "La cle d'API SIRENE est invalide ou non autorisee sur cet environnement.",
      {
        code: "sirene_auth_error",
      }
    );
  }

  throw new HttpError(
    503,
    "La verification SIRENE n'est pas configuree sur cet environnement.",
    {
      code: "sirene_not_configured",
    }
  );
};

const executeSiretLookup = async (normalizedSiret, { forceRefreshToken = false } = {}) => {
  try {
    return await executeSiretLookupWithApiKey(normalizedSiret);
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw error;
    }

    const shouldFallbackToLegacyOAuth =
      !getExplicitInseeApiKey() &&
      hasLegacyOAuthCredentials() &&
      (error.code === "sirene_auth_error" || error.code === "sirene_not_configured");

    if (!shouldFallbackToLegacyOAuth) {
      throw error;
    }
  }

  const accessToken = await getInseeAccessToken({ forceRefresh: forceRefreshToken });
  const response = await fetchWithTimeout(
    `${String(env.inseeApiBaseUrl || "").replace(/\/$/, "")}/siret/${normalizedSiret}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  if (response.status === 401 && !forceRefreshToken) {
    resetInseeSireneTokenCache();
    return executeSiretLookup(normalizedSiret, { forceRefreshToken: true });
  }

  return executeAuthenticatedLookupResponse(response, normalizedSiret);
};

export const verifySiretWithSirene = async (siret) => {
  const normalizedSiret = normalizeSiret(siret);

  if (!normalizedSiret) {
    throw new HttpError(400, "Le numero de SIRET est obligatoire.", {
      code: "siret_required",
    });
  }

  if (!isValidSiret(normalizedSiret)) {
    throw new HttpError(400, "Le numero de SIRET est invalide.", {
      code: "siret_invalid",
    });
  }

  const response = await executeSiretLookup(normalizedSiret);
  const payload = await readJsonSafely(response);
  const company = normalizeSireneCompanyPayload(payload?.etablissement, normalizedSiret);
  const checkedAt = new Date().toISOString();
  const isClosed = company.lookupStatus === "closed";

  return {
    siret: normalizedSiret,
    lookupStatus: company.lookupStatus,
    checkedAt,
    company: {
      legalName: company.legalName,
      commercialName: company.commercialName,
      siren: company.siren,
      address: company.address,
      postalCode: company.postalCode,
      city: company.city,
      apeCode: company.apeCode,
      establishmentStatus: company.establishmentStatus,
    },
    message: isClosed
      ? "Le SIRET existe mais l'etablissement est ferme."
      : "SIRET valide et etablissement actif.",
  };
};

export const previewSiretVerification = async (siret) => {
  const normalizedSiret = normalizeSiret(siret);

  if (!normalizedSiret) {
    throw new HttpError(400, "Le numero de SIRET est obligatoire.", {
      code: "siret_required",
    });
  }

  if (!isValidSiret(normalizedSiret)) {
    throw new HttpError(400, "Le numero de SIRET est invalide.", {
      code: "siret_invalid",
    });
  }

  if (!hasInseeSireneCredentials()) {
    return {
      siret: normalizedSiret,
      lookupStatus: "format_validated",
      checkedAt: new Date().toISOString(),
      company: null,
      message: "Numéro de SIRET valide.",
    };
  }

  return verifySiretWithSirene(normalizedSiret);
};

export const getVerifiedCompanyIdentity = async (siret) => {
  if (!hasInseeSireneCredentials()) {
    return {
      verificationStatus: "format_validated",
      verifiedAt: null,
      checkedAt: new Date().toISOString(),
      company: null,
    };
  }

  const verification = await verifySiretWithSirene(siret);

  if (verification.lookupStatus === "closed") {
    throw new HttpError(409, "Le SIRET existe mais l'etablissement est ferme.", {
      code: "siret_closed",
    });
  }

  return {
    verificationStatus: "verified",
    verifiedAt: verification.checkedAt,
    checkedAt: verification.checkedAt,
    company: verification.company,
  };
};
