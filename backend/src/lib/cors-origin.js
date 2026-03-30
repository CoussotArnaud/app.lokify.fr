const toNormalizedList = (entries = []) =>
  entries
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

const toRegexList = (patterns = []) =>
  patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);

const isLocalhostHostname = (hostname) => {
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1"
  );
};

const isAllowedLocalDevelopmentOrigin = (origin, { allowLocalDevelopmentOrigins = false } = {}) => {
  if (!allowLocalDevelopmentOrigins || !origin) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "http:" && isLocalhostHostname(hostname);
  } catch (_error) {
    return false;
  }
};

export const isVercelPreviewOriginAllowed = (
  origin,
  {
    allowVercelPreviewOrigins = false,
    vercelEnv = "",
    vercelFrontendProjectName = "",
  } = {}
) => {
  const previewRuntime = String(vercelEnv || "").trim().toLowerCase() === "preview";
  const previewOriginsEnabled = allowVercelPreviewOrigins || previewRuntime;

  if (!previewOriginsEnabled || !origin) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    const normalizedHostname = String(hostname || "").trim().toLowerCase();
    const expectedProjectName = String(vercelFrontendProjectName || "")
      .trim()
      .toLowerCase();

    if (protocol !== "https:" || !normalizedHostname.endsWith(".vercel.app")) {
      return false;
    }

    // On preview deployments, allow Vercel preview origins even if the generated
    // hostname does not strictly start with the project name.
    if (previewRuntime) {
      return true;
    }

    if (!expectedProjectName) {
      return true;
    }

    return normalizedHostname.startsWith(expectedProjectName);
  } catch (_error) {
    return false;
  }
};

export const buildCorsOriginChecker = ({
  clientUrls = [],
  clientUrlPatterns = [],
  allowLocalDevelopmentOrigins = false,
  allowVercelPreviewOrigins = false,
  vercelEnv = "",
  vercelFrontendProjectName = "",
} = {}) => {
  const exactAllowedOrigins = new Set(toNormalizedList(clientUrls));
  const allowedOriginPatterns = toRegexList(clientUrlPatterns);

  return (origin) => {
    if (!origin) {
      return true;
    }

    if (exactAllowedOrigins.has(origin)) {
      return true;
    }

    if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
      return true;
    }

    if (isAllowedLocalDevelopmentOrigin(origin, { allowLocalDevelopmentOrigins })) {
      return true;
    }

    return isVercelPreviewOriginAllowed(origin, {
      allowVercelPreviewOrigins,
      vercelEnv,
      vercelFrontendProjectName,
    });
  };
};
