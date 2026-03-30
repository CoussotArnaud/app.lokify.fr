export const errorHandler = (error, _req, res, _next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message: "Le fichier ou les donnees envoyees depassent la taille maximale autorisee.",
      code: "request_entity_too_large",
    });
  }

  if (error.code === "23505") {
    return res.status(409).json({ message: "Cette ressource existe deja." });
  }

  if (error.code === "23503") {
    return res.status(400).json({ message: "Reference invalide pour cette action." });
  }

  const statusCode = error.statusCode || 500;
  const isTrustedHttpError = error?.name === "HttpError";

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500 && !isTrustedHttpError
        ? "Une erreur interne est survenue."
        : error.message || "Une erreur interne est survenue.",
    code: isTrustedHttpError ? error.code || undefined : undefined,
    details: isTrustedHttpError && statusCode < 500 ? error.details || undefined : undefined,
  });
};
