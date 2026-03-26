"use client";

import Link from "next/link";

import StatusPill from "./status-pill";

const subscriptionStatusMeta = {
  inactive: { label: "Inactive", tone: "danger" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "En retard", tone: "warning" },
  canceled: { label: "Annule", tone: "neutral" },
  trial: { label: "Essai", tone: "info" },
};

const formatValue = (value, fallback = "A definir") => value || fallback;

export default function SubscriptionRequiredState({ user }) {
  const billing = user?.lokifyBilling || {};
  const status =
    subscriptionStatusMeta[billing.lokifySubscriptionStatus] ||
    subscriptionStatusMeta.inactive;
  const accessMode =
    user?.provider_status === "blocked"
      ? "Compte prestataire bloque"
      : billing.cancelAtPeriodEnd
        ? "Renouvellement annule a echeance"
        : "Prestataire standard";

  return (
    <div className="subscription-required-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Abonnement requis</p>
          <h3>Les modules principaux restent verrouilles tant que l&apos;abonnement Lokify n&apos;est pas actif.</h3>
          <p>
            Vous gardez l&apos;acces a votre compte, aux parametres utiles et a la zone
            Facturation &amp; abonnement pour souscrire proprement.
          </p>
        </div>
      </div>

      <section className="panel subscription-required-panel">
        <div className="panel-body">
          <div className="detail-grid">
            <article className="detail-card">
              <strong>Statut de l&apos;abonnement</strong>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </article>
            <article className="detail-card">
              <strong>Formule actuelle</strong>
              <span className="muted-text">
                {formatValue(billing.lokifyPlanName, "Aucun abonnement actif")}
              </span>
            </article>
            <article className="detail-card">
              <strong>Acces au logiciel</strong>
              <span className="muted-text">
                {billing.accessRestrictedBySubscription
                  ? "Restreint jusqu'a activation"
                  : "Disponible"}
              </span>
            </article>
            <article className="detail-card">
              <strong>Mode de session</strong>
              <span className="muted-text">{accessMode}</span>
            </article>
          </div>

          <div className="row-actions subscription-required-actions">
            <Link href="/abonnement" className="button primary">
              Ouvrir Facturation & abonnement
            </Link>
            <Link href="/parametres" className="button ghost">
              Ouvrir Parametres
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
