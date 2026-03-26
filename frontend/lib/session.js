const TOKEN_KEY = "lokify_token";
const USER_KEY = "lokify_user";

const isBrowser = () => typeof window !== "undefined";

export const loadSession = () => {
  if (!isBrowser()) {
    return { token: null, user: null };
  }

  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const serializedUser = window.localStorage.getItem(USER_KEY);

    return {
      token,
      user: serializedUser ? JSON.parse(serializedUser) : null,
    };
  } catch {
    return { token: null, user: null };
  }
};

export const saveSession = ({ token, user }) => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};

export const getSessionToken = () => loadSession().token;

