import { getSessionToken } from "./session";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, "");
export const API_URL = /\/api$/i.test(normalizedApiUrl)
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;

const normalizePath = (path) => (String(path || "").startsWith("/") ? path : `/${path}`);

export const apiRequest = async (
  path,
  { method = "GET", body, headers = {}, token, auth = true } = {}
) => {
  const requestHeaders = { ...headers };
  const sessionToken = token ?? (auth ? getSessionToken() : null);
  const isFormDataBody =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormDataBody) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (sessionToken) {
    requestHeaders.Authorization = `Bearer ${sessionToken}`;
  }

  let response;

  try {
    response = await fetch(`${API_URL}${normalizePath(path)}`, {
      method,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : isFormDataBody
            ? body
            : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (requestError) {
    const error = new Error(
      "Le serveur n'a pas pu etre joint. Reessayez dans quelques instants."
    );
    error.code = "network_error";
    error.cause = requestError;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Une erreur est survenue.");
    error.statusCode = response.status;
    error.code = data.code || null;
    error.details = data.details || null;
    throw error;
  }

  return data;
};
