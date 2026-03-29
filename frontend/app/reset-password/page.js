"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import BrandLogo from "../../components/brand-logo";
import { apiRequest } from "../../lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    setError("");

    if (!token) {
      setLoading(false);
      setError("Le lien de reinitialisation est incomplet.");
      return;
    }

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      const response = await apiRequest("/auth/reset-password", {
        method: "POST",
        body: {
          token,
          password,
        },
        auth: false,
      });
      setFeedback(response.message);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero">
        <div>
          <p className="eyebrow">Acces securise</p>
          <h1>Definissez votre mot de passe Lokify.</h1>
          <p>
            Ce lien securise vous permet soit d&apos;activer votre compte, soit de renouveler vos
            acces sans jamais exposer l&apos;ancien mot de passe.
          </p>
        </div>
      </section>

      <section className="login-card">
        <div className="login-brand login-brand-card">
          <BrandLogo className="brand-logo-login-main" />
        </div>
        <p className="eyebrow">Mot de passe</p>
        <h2>Finaliser mes acces</h2>
        <p className="muted-text">
          Renseignez un mot de passe d&apos;au moins 6 caracteres pour activer ou mettre a jour
          vos acces.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="reset-password">Nouveau mot de passe</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nouveau mot de passe"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="reset-confirm-password">Confirmation</label>
            <input
              id="reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmer le mot de passe"
              required
            />
          </div>

          <button type="submit" className="button primary" disabled={loading}>
            {loading ? "Mise a jour..." : "Enregistrer le nouveau mot de passe"}
          </button>
        </form>

        {feedback ? <p className="feedback success">{feedback}</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}

        <p className="login-footnote">
          <Link href="/login">Retour a la connexion</Link>
        </p>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="login-page" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
