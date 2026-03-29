import HttpError from "../utils/http-error.js";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 20;

const normalizeIp = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "unknown";
  }

  const forwardedIp = normalizedValue.split(",")[0]?.trim();
  return forwardedIp || "unknown";
};

const getRequestIp = (req) =>
  normalizeIp(req.headers?.["x-forwarded-for"] || req.ip || req.socket?.remoteAddress);

export const createRateLimitMiddleware = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  message = "Trop de requetes sur ce point d'entree. Merci de reessayer plus tard.",
  code = "rate_limit_exceeded",
  keyPrefix = "global",
} = {}) => {
  const hits = new Map();
  let cleanupRuns = 0;

  const cleanupExpiredEntries = (now) => {
    cleanupRuns += 1;

    if (cleanupRuns % 50 !== 0 && hits.size < 500) {
      return;
    }

    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredEntries(now);

    const identifier = `${keyPrefix}:${getRequestIp(req)}`;
    const currentEntry = hits.get(identifier);
    const entry =
      currentEntry && currentEntry.resetAt > now
        ? currentEntry
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    entry.count += 1;
    hits.set(identifier, entry);

    const remaining = Math.max(max - entry.count, 0);
    const retryAfterSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return next(new HttpError(429, message, { code }));
    }

    return next();
  };
};
