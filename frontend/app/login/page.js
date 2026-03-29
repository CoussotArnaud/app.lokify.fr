"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "../../components/brand-logo";
import { useAuth } from "../../components/auth-provider";
import useSiretVerification from "../../hooks/use-siret-verification";
import { getWorkspaceHomePath } from "../../lib/access";
import { isValidSiret } from "../../lib/siret";

const initialRegister = {
  first_name: "",
  last_name: "",
  company_name: "",
  siret: "",
  commercial_name: "",
  address: "",
  postal_code: "",
  city: "",
  ape_code: "",
  siren: "",
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

  const updateRegisterField = (field, value) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyCompanyLookupToForm = (company) => {
    if (!company) {
      return;
    }

    setRegisterForm((current) => ({
      ...current,
      company_name: company.legalName || current.company_name,
      commercial_name: company.commercialName || current.commercial_name,
      address: company.address || current.address,
      postal_code: company.postalCode || current.postal_code,
      city: company.city || current.city,
      ape_code: company.apeCode || current.ape_code,
      siren: company.siren || current.siren,
    }));
  };
  const { verification: siretVerification, verifyNow: verifySiret } = useSiretVerification({
    value: registerForm.siret,
    enabled: mode === "register",
    onCompanyResolved: applyCompanyLookupToForm,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      let response;
      if (mode === "login") {
        response = await login(loginForm);
      } else {
        if (!isValidSiret(registerForm.siret)) {
          throw new Error("Le numero de SIRET est invalide.");
        }

        const verificationResult = await verifySiret(registerForm.siret);
        if (["invalid", "not_found", "closed"].includes(verificationResult?.status)) {
          throw new Error(verificationResult.message);
        }

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
          <p className="eyebrow">Location professionnelle</p>
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
            <strong>Pilotage</strong>
            <span>Outils centralises pour votre activite.</span>
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
          Connectez-vous a votre espace Lokify ou creez votre compte prestataire.
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

        <form className={`form-grid ${mode === "register" ? "two-columns" : ""}`} onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <div className="field">
                <label htmlFor="first_name">Prenom</label>
                <input
                  id="first_name"
                  value={registerForm.first_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      first_name: event.target.value,
                    }))
                  }
                  placeholder="Ex. Marie"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="last_name">Nom</label>
                <input
                  id="last_name"
                  value={registerForm.last_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      last_name: event.target.value,
                    }))
                  }
                  placeholder="Ex. Dupont"
                  required
                />
              </div>

              <div className="field field-span-2">
                <label htmlFor="company_name">Nom de la societe</label>
                <input
                  id="company_name"
                  value={registerForm.company_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      company_name: event.target.value,
                    }))
                  }
                  placeholder="Ex. Studio Horizon"
                  required
                />
              </div>

              <div className="field field-span-2">
                <label htmlFor="siret">Numero de SIRET</label>
                <input
                  id="siret"
                  value={registerForm.siret}
                  onChange={(event) => updateRegisterField("siret", event.target.value)}
                  placeholder="123 456 789 00012"
                  inputMode="numeric"
                  required
                />
                {siretVerification.status !== "idle" ? (
                  <p className={`siret-feedback ${siretVerification.status}`}>
                    {siretVerification.message}
                  </p>
                ) : null}
                <p className="field-helper">
                  La verification se lance automatiquement des que les 14 chiffres sont saisis.
                </p>
              </div>

              <div className="field field-span-2">
                <label htmlFor="commercial_name">Nom commercial</label>
                <input
                  id="commercial_name"
                  value={registerForm.commercial_name}
                  onChange={(event) =>
                    updateRegisterField("commercial_name", event.target.value)
                  }
                  placeholder="Optionnel"
                />
              </div>

              <div className="field field-span-2">
                <label htmlFor="address">Adresse</label>
                <input
                  id="address"
                  value={registerForm.address}
                  onChange={(event) => updateRegisterField("address", event.target.value)}
                  placeholder="Ex. 18 avenue des Arts"
                />
              </div>

              <div className="field">
                <label htmlFor="postal_code">Code postal</label>
                <input
                  id="postal_code"
                  value={registerForm.postal_code}
                  onChange={(event) =>
                    updateRegisterField("postal_code", event.target.value)
                  }
                  placeholder="69006"
                />
              </div>

              <div className="field">
                <label htmlFor="city">Ville</label>
                <input
                  id="city"
                  value={registerForm.city}
                  onChange={(event) => updateRegisterField("city", event.target.value)}
                  placeholder="Lyon"
                />
              </div>

              <div className="field">
                <label htmlFor="ape_code">Code APE / NAF</label>
                <input
                  id="ape_code"
                  value={registerForm.ape_code}
                  onChange={(event) => updateRegisterField("ape_code", event.target.value)}
                  placeholder="7729Z"
                />
              </div>

              <div className="field">
                <label htmlFor="siren">SIREN</label>
                <input
                  id="siren"
                  value={registerForm.siren}
                  onChange={(event) => updateRegisterField("siren", event.target.value)}
                  placeholder="123456789"
                />
              </div>
            </>
          ) : null}

          <div className={`field ${mode === "register" ? "field-span-2" : ""}`}>
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
              placeholder="vous@exemple.fr"
              required
            />
          </div>

          <div className={`field ${mode === "register" ? "field-span-2" : ""}`}>
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

          {mode === "register" ? (
            <p className="muted-text field-span-2 login-register-note">
              L&apos;inscription est reservee aux professionnels. Le SIRET est verifie
              automatiquement et peut preremplir les informations de l&apos;entreprise.
            </p>
          ) : null}

          <button
            type="submit"
            className={`button primary ${mode === "register" ? "field-span-2" : ""}`}
            disabled={loading}
          >
            {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Creer mon compte"}
          </button>
        </form>

        {mode === "login" ? (
          <p className="login-footnote">
            <Link href="/mot-de-passe-oublie">Mot de passe oublie ?</Link>
          </p>
        ) : null}

        {error ? <p className="feedback error">{error}</p> : null}
      </section>
    </main>
  );
}
