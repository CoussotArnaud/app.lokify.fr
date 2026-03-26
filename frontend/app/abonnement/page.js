"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { canAccessOperationalModules, getWorkspaceHomePath } from "../../lib/access";
import { formatCurrency, formatDate } from "../../lib/date";

const subscriptionStatusMeta = {
  inactive: { label: "Inactive", tone: "danger" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "En retard", tone: "warning" },
  canceled: { label: "Annule", tone: "neutral" },
  trial: { label: "Essai", tone: "info" },
};

const formatDateValue = (value) => (value ? formatDate(value) : "A definir");

function BillingPageFallback() {
  return (
    <AppShell>
      <div className="page-stack">
        <Panel
          title="Chargement de la facturation"
          description="LOKIFY prepare la zone abonnement et la configuration SaaS."
        >
          <div className="empty-state">
            <strong>Preparation de la zone abonnement</strong>
            <span>Les informations arrivent dans quelques instants.</span>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [overview, setOverview] = useState(null);
  const [customerSettings, setCustomerSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState("");
  const [cancelingRenewal, setCancelingRenewal] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const returnKeyRef = useRef("");

  const loadBillingState = async () => {
    setLoading(true);

    try {
      const [billingResponse, customerPaymentsResponse] = await Promise.all([
        apiRequest("/lokify-billing/overview"),
        apiRequest("/customer-payments/settings"),
      ]);

      setOverview(billingResponse);
      setCustomerSettings(customerPaymentsResponse);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingState();
  }, []);

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    const returnKey = `${checkoutState || "none"}:${sessionId || "none"}`;

    if (returnKeyRef.current === returnKey) {
      return;
    }

    if (checkoutState === "cancel") {
      returnKeyRef.current = returnKey;
      setFeedback({
        type: "error",
        message: "Le parcours de souscription a ete annule avant validation.",
      });
      return;
    }

    if (checkoutState !== "success" || !sessionId) {
      return;
    }

    returnKeyRef.current = returnKey;

    const finalizeCheckout = async () => {
      try {
        const response = await apiRequest(
          `/lokify-billing/checkout-sessions/${sessionId}/finalize`,
          {
            method: "POST",
          }
        );

        setOverview((current) => ({
          ...(current || {}),
          currentUser: response.currentUser,
          lokifySubscription: response.currentUser?.lokifyBilling,
        }));
        await refreshUser();
        await loadBillingState();
        setFeedback({
          type: "success",
          message: "La souscription a bien ete prise en compte.",
        });
      } catch (error) {
        setFeedback({ type: "error", message: error.message });
      }
    };

    finalizeCheckout();
  }, [refreshUser, searchParams]);

  const handlePlanCheckout = async (planId) => {
    setSubmittingPlanId(planId);
    setFeedback(null);

    try {
      const response = await apiRequest("/lokify-billing/checkout-session", {
        method: "POST",
        body: { planId },
      });

      if (response.provider === "stripe" && response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
        return;
      }

      router.push(response.redirectPath || "/abonnement");
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmittingPlanId("");
    }
  };

  const handleCancelRenewal = async () => {
    setCancelingRenewal(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/lokify-billing/subscription/cancel-renewal", {
        method: "POST",
      });

      setOverview((current) => ({
        ...(current || {}),
        currentUser: response.currentUser,
        lokifySubscription: response.currentUser?.lokifyBilling,
      }));
      await refreshUser();
      await loadBillingState();
      setFeedback({
        type: "success",
        message:
          "Le renouvellement automatique est annule. Votre acces reste actif jusqu'a la fin de la periode payee.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setCancelingRenewal(false);
    }
  };

  const currentUser = overview?.currentUser || user;
  const lokifySubscription = overview?.lokifySubscription || user?.lokifyBilling || {};
  const plans = overview?.plans || [];
  const statusMeta =
    subscriptionStatusMeta[lokifySubscription.lokifySubscriptionStatus] ||
    subscriptionStatusMeta.inactive;
  const hasOperationalAccess = canAccessOperationalModules(currentUser);
  const canCancelRenewal =
    ["active", "trial"].includes(lokifySubscription.lokifySubscriptionStatus) &&
    !lokifySubscription.cancelAtPeriodEnd;

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Facturation & abonnement</p>
            <h3>Pilotez l'abonnement SaaS du prestataire sans melanger les encaissements clients.</h3>
            <p>
              Cette zone gere uniquement l'abonnement Lokify facture par le super admin.
              Les paiements clients du prestataire restent separes.
            </p>
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        {loading ? (
          <Panel
            title="Chargement de la facturation"
            description="LOKIFY consolide le statut de l'abonnement et la configuration de paiement."
          >
            <div className="empty-state">
              <strong>Preparation de la zone abonnement</strong>
              <span>Les informations arrivent dans quelques instants.</span>
            </div>
          </Panel>
        ) : (
          <>
            <Panel
              title="Statut actuel"
              description="Une lecture claire de la formule active, de l'echeance et du niveau d'acces."
              actions={
                hasOperationalAccess ? (
                  <Link href={getWorkspaceHomePath(currentUser)} className="button ghost">
                    Acceder au logiciel
                  </Link>
                ) : null
              }
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Formule actuelle</strong>
                  <span className="muted-text">
                    {lokifySubscription.lokifyPlanName || "Aucun abonnement actif"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Statut</strong>
                  <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Date de debut</strong>
                  <span className="muted-text">
                    {formatDateValue(lokifySubscription.lokifySubscriptionStartAt)}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Fin / prochaine echeance</strong>
                  <span className="muted-text">
                    {formatDateValue(lokifySubscription.lokifySubscriptionEndAt)}
                  </span>
                </article>
              </div>

              <div className="row-actions billing-status-actions">
                <StatusPill tone={lokifySubscription.subscriptionLocked ? "warning" : "success"}>
                  {lokifySubscription.subscriptionLocked
                    ? "Acces logiciel restreint"
                    : "Acces logiciel debloque"}
                </StatusPill>
                <StatusPill tone="info">
                  Environnement {lokifySubscription.billingEnvironment || "test"}
                </StatusPill>
                {lokifySubscription.cancelAtPeriodEnd ? (
                  <StatusPill tone="warning">Renouvellement annule a echeance</StatusPill>
                ) : null}
              </div>

              <div className="row-actions billing-status-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={handleCancelRenewal}
                  disabled={!canCancelRenewal || cancelingRenewal}
                >
                  {cancelingRenewal
                    ? "Annulation..."
                    : canCancelRenewal
                      ? "Annuler le renouvellement automatique"
                      : "Renouvellement deja annule ou abonnement inactif"}
                </button>
              </div>

              {!hasOperationalAccess ? (
                <div className="empty-state billing-inline-state">
                  <strong>Abonnement requis</strong>
                  <span>
                    Tant que le statut Lokify n'est pas actif, les modules principaux du logiciel
                    restent verrouilles.
                  </span>
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Formules Lokify"
              description="Choisissez la formule SaaS du prestataire. Le paiement Stripe super admin est totalement separe du Stripe client."
            >
              <div className="plan-choice-grid">
                {plans.map((plan) => {
                  const isCurrentPlan = lokifySubscription.lokifyPlanId === plan.id;
                  const isBusy = submittingPlanId === plan.id;

                  return (
                    <article
                      key={plan.id}
                      className={`plan-choice-card ${isCurrentPlan ? "active" : ""}`.trim()}
                    >
                      <div className="row-actions">
                        <strong>{plan.name}</strong>
                        {isCurrentPlan ? (
                          <StatusPill tone="success">Formule actuelle</StatusPill>
                        ) : null}
                      </div>
                      <div className="plan-choice-price">
                        <strong>{formatCurrency(plan.price)}</strong>
                        <span className="muted-text">
                          {" "}
                          / {plan.interval === "month" ? "mois" : plan.interval}
                        </span>
                      </div>
                      <p className="muted-text">{plan.description}</p>
                      <div className="tag-list">
                        {plan.highlights.map((highlight) => (
                          <span key={highlight} className="tag-chip">
                            {highlight}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={`button ${isCurrentPlan ? "ghost" : "primary"}`}
                        onClick={() => handlePlanCheckout(plan.id)}
                        disabled={isBusy}
                      >
                        {isBusy
                          ? "Preparation..."
                          : isCurrentPlan
                            ? "Relancer la souscription"
                            : "Choisir cette formule"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </Panel>

            <Panel
              title="Paiements clients du prestataire"
              description="Rappel de la configuration Stripe locale du prestataire pour encaisser ses propres clients."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Module actif</strong>
                  <StatusPill tone={customerSettings?.customerPayments?.customerPaymentsEnabled ? "success" : "neutral"}>
                    {customerSettings?.customerPayments?.customerPaymentsEnabled ? "Oui" : "Non"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Mode Stripe</strong>
                  <span className="muted-text">
                    {customerSettings?.customerPayments?.customerStripeMode || "test"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Compte Stripe</strong>
                  <span className="muted-text">
                    {customerSettings?.customerPayments?.customerStripeAccountStatus ||
                      "not_configured"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Secret key cote front</strong>
                  <span className="muted-text">Jamais exposee</span>
                </article>
              </div>

              <p className="muted-text">
                {customerSettings?.message ||
                  "La configuration Stripe client du prestataire reste isolee et geree dans Parametres."}
              </p>

              <Link href="/parametres" className="button ghost">
                Ouvrir les reglages Stripe prestataire
              </Link>
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageFallback />}>
      <BillingPageContent />
    </Suspense>
  );
}
