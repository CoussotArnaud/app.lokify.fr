"use client";

import Link from "next/link";
import { useState } from "react";

import BrandLogo from "../../components/brand-logo";
import { apiRequest } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    setError("");

    try {
      const response = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setFeedback(response.message);
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
          <p className="eyebrow">Assistance connexion</p>
          <h1>Reinitialisez l&apos;acces sans exposer vos donnees.</h1>
          <p>
            Entrez votre email de connexion Lokify. Un lien securise sera prepare pour choisir un
            nouveau mot de passe.
          </p>
        </div>
      </section>

      <section className="login-card">
        <div className="login-brand login-brand-card">
          <BrandLogo className="brand-logo-login-main" />
        </div>
        <p className="eyebrow">Mot de passe oublie</p>
        <h2>Recevoir un lien de reinitialisation</h2>
        <p className="muted-text">
          Si un compte existe pour cet email, un lien de reinitialisation sera envoye.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="team@lokify.fr"
              required
            />
          </div>

          <button type="submit" className="button primary" disabled={loading}>
            {loading ? "Preparation..." : "Envoyer le lien"}
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
