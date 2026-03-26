import { getSessionToken } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export const apiRequest = async (
  path,
  { method = "GET", body, headers = {}, token, auth = true } = {}
) => {
  const requestHeaders = { ...headers };
  const sessionToken = token ?? (auth ? getSessionToken() : null);

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (sessionToken) {
    requestHeaders.Authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Une erreur est survenue.");
  }

  return data;
};

