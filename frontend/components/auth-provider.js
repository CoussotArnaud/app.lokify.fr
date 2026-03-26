"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "../lib/api";
import { clearSession, loadSession, saveSession } from "../lib/session";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const refreshUser = async (sessionToken) => {
    const response = await apiRequest("/auth/me", { token: sessionToken });

    setUser(response.user);
    saveSession({ token: sessionToken, user: response.user });
    return response.user;
  };

  useEffect(() => {
    const session = loadSession();

    if (!session.token) {
      setReady(true);
      return;
    }

    setToken(session.token);
    setUser(session.user);

    refreshUser(session.token)
      .catch(() => {
        clearSession();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  const authenticate = async (endpoint, payload) => {
    const response = await apiRequest(endpoint, {
      method: "POST",
      body: payload,
      auth: false,
    });

    saveSession({ token: response.token, user: response.user });
    setToken(response.token);
    setUser(response.user);
    return response;
  };

  const logout = () => {
    clearSession();
    setToken(null);
    setUser(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        token,
        user,
        isAuthenticated: Boolean(token),
        login: (payload) => authenticate("/auth/login", payload),
        register: (payload) => authenticate("/auth/register", payload),
        refreshUser: () => refreshUser(token),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
