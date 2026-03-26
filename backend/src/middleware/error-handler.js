export const errorHandler = (error, _req, res, _next) => {
  if (error.code === "23505") {
    return res.status(409).json({ message: "Cette ressource existe deja." });
  }

  if (error.code === "23503") {
    return res.status(400).json({ message: "Reference invalide pour cette action." });
  }

  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    message: error.message || "Une erreur interne est survenue.",
  });
};

