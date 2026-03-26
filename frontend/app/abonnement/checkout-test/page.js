"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../components/app-shell";
import Panel from "../../../components/panel";
import StatusPill from "../../../components/status-pill";
import { useAuth } from "../../../components/auth-provider";
import { apiRequest } from "../../../lib/api";
import { formatCurrency, formatDateTime } from "../../../lib/date";

function BillingCheckoutFallback() {
  return (
    <AppShell>
      <div className="page-stack">
        <Panel
          title="Chargement du checkout test"
          description="Lecture de la session de souscription en cours."
        >
          <div className="empty-state">
            <strong>Preparation du paiement test</strong>
            <span>La session locale est en cours de chargement.</span>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function BillingCheckoutTestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState("");
  const [feedback, setFeedback] = useState("");

  const sessionId = searchParams.get("sessionId");

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setFeedback("Session de checkout test introuvable.");
      return;
    }

    const loadSession = async () => {
      setLoading(true);

      try {
        const response = await apiRequest(`/lokify-billing/checkout-sessions/${sessionId}`);
        setCheckoutSession(response.checkoutSession);
      } catch (error) {
        setFeedback(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [sessionId]);

  const handleValidate = async () => {
    if (!sessionId) {
      return;
    }

    setSubmitting("confirm");
    setFeedback("");

    try {
      await apiRequest(
        `/lokify-billing/checkout-sessions/${sessionId}/complete-simulation`,
        {
          method: "POST",
        }
      );
      await refreshUser();
      router.replace(`/abonnement?checkout=success&session_id=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSubmitting("");
    }
  };

  const handleCancel = async () => {
    if (!sessionId) {
      router.replace("/abonnement?checkout=cancel");
      return;
    }

    setSubmitting("cancel");
    setFeedback("");

    try {
      await apiRequest(`/lokify-billing/checkout-sessions/${sessionId}/cancel`, {
        method: "POST",
      });
      router.replace("/abonnement?checkout=cancel");
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSubmitting("");
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Checkout test local</p>
            <h3>Simulation locale du paiement d&apos;abonnement Lokify.</h3>
            <p>
              Cette etape prepare le futur parcours Stripe Checkout sans exposer de secret et sans
              activer le flux de paiements clients du prestataire.
            </p>
          </div>
        </div>

        {feedback ? <p className="feedback error">{feedback}</p> : null}

        {loading ? (
          <Panel title="Chargement du checkout test" description="Lecture de la session de souscription en cours.">
            <div className="empty-state">
              <strong>Preparation du paiement test</strong>
              <span>La session locale est en cours de chargement.</span>
            </div>
          </Panel>
        ) : checkoutSession ? (
          <Panel
            title="Recapitulatif de la session"
            description="Validation locale uniquement, compatible avec la future branche Stripe test."
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Formule</strong>
                <span className="muted-text">{checkoutSession.plan.name}</span>
              </article>
              <article className="detail-card">
                <strong>Montant</strong>
                <span className="muted-text">{formatCurrency(checkoutSession.plan.price)}</span>
              </article>
              <article className="detail-card">
                <strong>Etat</strong>
                <StatusPill tone={checkoutSession.checkoutState === "completed" ? "success" : "warning"}>
                  {checkoutSession.checkoutState === "completed" ? "Complete" : "En attente"}
                </StatusPill>
              </article>
              <article className="detail-card">
                <strong>Expiration</strong>
                <span className="muted-text">
                  {checkoutSession.expiresAt ? formatDateTime(checkoutSession.expiresAt) : "A definir"}
                </span>
              </article>
            </div>

            <div className="empty-state billing-inline-state">
              <strong>Mode simulation locale</strong>
              <span>
                Aucun secret Stripe n&apos;est expose et aucune carte reelle n&apos;est necessaire.
                Le bouton ci-dessous met a jour le statut d&apos;abonnement local pour les tests.
              </span>
            </div>

            <div className="row-actions subscription-required-actions">
              <button
                type="button"
                className="button primary"
                onClick={handleValidate}
                disabled={submitting === "confirm"}
              >
                {submitting === "confirm" ? "Validation..." : "Valider le paiement test"}
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={handleCancel}
                disabled={submitting === "cancel"}
              >
                {submitting === "cancel" ? "Annulation..." : "Annuler"}
              </button>
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function BillingCheckoutTestPage() {
  return (
    <Suspense fallback={<BillingCheckoutFallback />}>
      <BillingCheckoutTestPageContent />
    </Suspense>
  );
}
