"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "../../components/brand-logo";
import { useAuth } from "../../components/auth-provider";
import { getWorkspaceHomePath } from "../../lib/access";

const initialRegister = {
  full_name: "",
  email: "",
  password: "",
};

const initialLogin = {
  email: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();
  const { ready, isAuthenticated, login, register, user } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && isAuthenticated) {
      router.replace(getWorkspaceHomePath(user));
    }
  }, [ready, isAuthenticated, router, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      let response;
      if (mode === "login") {
        response = await login(loginForm);
      } else {
        response = await register(registerForm);
      }

      router.replace(getWorkspaceHomePath(response.user));
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero">
        <div>
          <p className="eyebrow">SaaS de location</p>
          <h1>Prenez le controle de votre parc materiel.</h1>
          <p>
            LOKIFY regroupe la reservation, le suivi client, le planning et les indicateurs
            essentiels dans une interface claire et rapide.
          </p>
        </div>

        <div className="hero-grid">
          <div className="hero-stat">
            <strong>Dashboard</strong>
            <span>Pilotage reservation & revenu.</span>
          </div>
          <div className="hero-stat">
            <strong>Planning</strong>
            <span>Vue jour et semaine.</span>
          </div>
          <div className="hero-stat">
            <strong>API REST</strong>
            <span>Architecture prete a evoluer.</span>
          </div>
        </div>
      </section>

      <section className="login-card">
        <div className="login-brand login-brand-card">
          <BrandLogo className="brand-logo-login-main" />
        </div>
        <p className="eyebrow">Acces plateforme</p>
        <h2>{mode === "login" ? "Connexion" : "Creer un compte"}</h2>
        <p className="muted-text">
          Connectez-vous en super admin ou creez votre espace prestataire LOKIFY.
        </p>

        <div className="tabs" role="tablist" aria-label="Choisir le mode">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Connexion
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Inscription
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="full_name">Nom complet</label>
              <input
                id="full_name"
                value={registerForm.full_name}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, full_name: event.target.value }))
                }
                placeholder="Ex. Marie Dupont"
                required
              />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={mode === "login" ? loginForm.email : registerForm.email}
              onChange={(event) =>
                mode === "login"
                  ? setLoginForm((current) => ({ ...current, email: event.target.value }))
                  : setRegisterForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="team@lokify.fr"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={mode === "login" ? loginForm.password : registerForm.password}
              onChange={(event) =>
                mode === "login"
                  ? setLoginForm((current) => ({ ...current, password: event.target.value }))
                  : setRegisterForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="Mot de passe"
              required
            />
          </div>

          <button type="submit" className="button primary" disabled={loading}>
            {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Creer mon compte"}
          </button>
        </form>

        {mode === "login" ? (
          <p className="login-footnote">
            <Link href="/mot-de-passe-oublie">Mot de passe oublie ?</Link>
          </p>
        ) : null}

        {error ? <p className="feedback error">{error}</p> : null}

        <p className="login-footnote">
          Super admin: team@lokify.fr / admin. Prestataire demo: presta@lokify.fr / presta.
        </p>
      </section>
    </main>
  );
}
