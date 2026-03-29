"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import AppShell from "../../../components/app-shell";
import MetricCard from "../../../components/metric-card";
import Panel from "../../../components/panel";
import StatusPill from "../../../components/status-pill";
import useSiretVerification from "../../../hooks/use-siret-verification";
import { apiRequest } from "../../../lib/api";
import { formatCurrency } from "../../../lib/date";
import {
  formatAdminDate,
  formatAdminDateTime,
  formatBooleanLabel,
  formatProviderAddress,
  getPaymentStatusMeta,
  getProviderStatusMeta,
  getStripeStatusMeta,
  getSubscriptionStatusMeta,
} from "../../../lib/provider-admin";
import { isValidSiret } from "../../../lib/siret";

const createProviderForm = (provider) => ({
  company_name: provider?.company_name || provider?.full_name || "",
  siret: provider?.siret || "",
  siren: provider?.siren || "",
  commercial_name: provider?.commercial_name || "",
  ape_code: provider?.ape_code || "",
  first_name: provider?.first_name || "",
  last_name: provider?.last_name || "",
  email: provider?.email || "",
  phone: provider?.phone || "",
  address: provider?.address || "",
  postal_code: provider?.postal_code || "",
  city: provider?.city || "",
  country: provider?.country || "",
});

const preferVerifiedValue = (currentValue, originalValue, verifiedValue) => {
  if (!verifiedValue) {
    return currentValue;
  }

  return !currentValue || currentValue === originalValue ? verifiedValue : currentValue;
};

function ProviderDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const providerId = params?.providerId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [provider, setProvider] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(createProviderForm(null));
  const [feedback, setFeedback] = useState(null);
  const [resetFeedback, setResetFeedback] = useState(null);
  const applyCompanyLookupToEditForm = (company) => {
    if (!company) {
      return;
    }

    setForm((current) => ({
      ...current,
      company_name: preferVerifiedValue(
        current.company_name,
        provider?.company_name || provider?.full_name || "",
        company.legalName
      ),
      commercial_name: preferVerifiedValue(
        current.commercial_name,
        provider?.commercial_name || "",
        company.commercialName
      ),
      address: preferVerifiedValue(current.address, provider?.address || "", company.address),
      postal_code: preferVerifiedValue(
        current.postal_code,
        provider?.postal_code || "",
        company.postalCode
      ),
      city: preferVerifiedValue(current.city, provider?.city || "", company.city),
      ape_code: preferVerifiedValue(current.ape_code, provider?.ape_code || "", company.apeCode),
      siren: preferVerifiedValue(current.siren, provider?.siren || "", company.siren),
    }));
  };
  const { verification: siretVerification, verifyNow: verifyProviderSiret } =
    useSiretVerification({
      value: editing ? form.siret : "",
      enabled: editing,
      onCompanyResolved: applyCompanyLookupToEditForm,
    });

  const loadProvider = async () => {
    setLoading(true);

    try {
      const response = await apiRequest(`/admin/providers/${providerId}`);
      setProvider(response.provider);
      setForm(createProviderForm(response.provider));
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!providerId) {
      return;
    }

    loadProvider();
  }, [providerId]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      if (!isValidSiret(form.siret)) {
        throw new Error("Le numero de SIRET est invalide.");
      }

      const verificationResult = await verifyProviderSiret(form.siret);
      if (["invalid", "not_found", "closed"].includes(verificationResult?.status)) {
        throw new Error(verificationResult.message);
      }

      await apiRequest(`/admin/providers/${providerId}`, {
        method: "PUT",
        body: form,
      });

      await loadProvider();
      setEditing(false);
      setFeedback({
        type: "success",
        message: "La fiche prestataire a ete mise a jour.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleInvitation = async () => {
    setSendingReset(true);
    setResetFeedback(null);

    try {
      const response = await apiRequest(`/admin/providers/${providerId}/invitation`, {
        method: "POST",
      });

      setResetFeedback({
        type: response.deliveryMode === "smtp" ? "success" : "info",
        message: response.message,
      });
      await loadProvider();
    } catch (error) {
      setResetFeedback({ type: "error", message: error.message });
    } finally {
      setSendingReset(false);
    }
  };

  const cancelEdition = () => {
    setEditing(false);
    setForm(createProviderForm(provider));
  };

  const providerStatusMeta = getProviderStatusMeta(provider?.provider_status);
  const subscriptionStatusMeta = getSubscriptionStatusMeta(
    provider?.subscription?.lokifySubscriptionStatus
  );
  const paymentStatusMeta = getPaymentStatusMeta(provider?.payments?.customerPaymentStatus);
  const stripeStatusMeta = getStripeStatusMeta(provider?.payments?.customerStripeAccountStatus);
  const isInvitationPending = provider?.provider_status === "invited";
  const isNewlyCreated = searchParams.get("created") === "1";
  const origin = searchParams.get("from");
  const backHref =
    origin === "subscriptions" ? "/abonnements" : origin === "dashboard" ? "/dashboard" : "/prestataires";
  const backLabel =
    origin === "subscriptions"
      ? "Retour aux abonnements"
      : origin === "dashboard"
        ? "Retour au dashboard"
        : "Retour aux prestataires";

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Fiche prestataire detaillee</h3>
            <p>
              Vue claire du compte, de son activite et de son abonnement Lokify, avec verification
              SIRET uniforme et activation securisee.
            </p>
          </div>
          <div className="page-header-actions">
            <Link href={backHref} className="button ghost">
              {backLabel}
            </Link>
          </div>
        </div>

        {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}

        {isNewlyCreated ? (
          <p className="feedback info">
            Le compte a ete cree en statut invite. Vous pouvez maintenant envoyer le lien
            d&apos;activation au prestataire.
          </p>
        ) : null}

        {loading && !provider ? (
          <Panel title="Chargement de la fiche" description="Lecture des donnees prestataire en cours.">
            <div className="empty-state">
              <strong>Preparation de la fiche detaillee</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading && provider ? (
          <>
            <Panel
              title={provider.company_name || provider.full_name}
              description={`${provider.email} - compte cree le ${formatAdminDate(provider.created_at)}`}
              actions={
                <div className="row-actions">
                  <StatusPill tone={providerStatusMeta.tone}>{providerStatusMeta.label}</StatusPill>
                  <StatusPill tone={subscriptionStatusMeta.tone}>
                    {subscriptionStatusMeta.label}
                  </StatusPill>
                  <StatusPill tone={paymentStatusMeta.tone}>{paymentStatusMeta.label}</StatusPill>
                </div>
              }
            >
              <section className="metric-grid">
                <MetricCard
                  icon="bill"
                  label="Formule actuelle"
                  value={provider.subscription?.lokifyPlanName || "Aucune"}
                  helper={`Echeance ${formatAdminDate(provider.subscription?.nextRenewalAt)}`}
                  tone="success"
                />
                <MetricCard
                  icon="mail"
                  label="Etat du paiement"
                  value={paymentStatusMeta.label}
                  helper={`Dernier paiement ${formatAdminDate(provider.payments?.customerLastPaymentAt)}`}
                  tone={paymentStatusMeta.tone === "warning" ? "warning" : "info"}
                />
                <MetricCard
                  icon="settings"
                  label="Stripe client"
                  value={stripeStatusMeta.label}
                  helper={provider.payments?.customerStripeAccountId || "Aucun compte connecte"}
                  tone={stripeStatusMeta.tone === "success" ? "success" : "info"}
                />
                <MetricCard
                  icon="users"
                  label="Activite"
                  value={`${provider.metrics?.totalClients || 0} clients`}
                  helper={`${provider.metrics?.totalReservations || 0} reservations rattachees`}
                  tone="info"
                />
              </section>
            </Panel>

            <Panel
              title="Performance prestataire"
              description="Lecture seule de l'activite du prestataire pour piloter rapidement sa performance sans modifier ses donnees."
            >
              <section className="metric-grid">
                <MetricCard
                  icon="chart"
                  label="CA mensuel prestataire"
                  value={formatCurrency(provider.business?.monthlyRevenue || 0)}
                  helper="Reservations confirmees ou terminees sur le mois en cours."
                  tone="success"
                />
                <MetricCard
                  icon="bill"
                  label="CA total prestataire"
                  value={formatCurrency(provider.business?.totalRevenue || 0)}
                  helper="Cumul confirme sur l'historique disponible."
                  tone="info"
                />
                <MetricCard
                  icon="calendar"
                  label="Reservations"
                  value={provider.business?.totalReservations || 0}
                  helper={`Dont ${provider.business?.confirmedReservations || 0} a impact chiffre d'affaires.`}
                  tone="info"
                />
              </section>
            </Panel>

            <section className="split-layout split-1-1">
              <Panel
                title="Informations du compte"
                description="Coordonnees administratives et contact principal du prestataire."
                actions={
                  !editing ? (
                    <button type="button" className="button ghost" onClick={() => setEditing(true)}>
                      Modifier
                    </button>
                  ) : null
                }
              >
                {editing ? (
                  <form className="form-grid two-columns" onSubmit={handleSave}>
                    <div className="field">
                      <label htmlFor="provider-company-name">Nom de la societe</label>
                      <input
                        id="provider-company-name"
                        value={form.company_name}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, company_name: event.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-siret">SIRET</label>
                      <input
                        id="provider-siret"
                        value={form.siret}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, siret: event.target.value }))
                        }
                        inputMode="numeric"
                        required
                      />
                      {siretVerification.status !== "idle" ? (
                        <p className={`siret-feedback ${siretVerification.status}`}>
                          {siretVerification.message}
                        </p>
                      ) : null}
                      <p className="field-helper">
                        La verification demarre automatiquement a 14 chiffres et actualise les
                        informations societaires reconnues.
                      </p>
                    </div>

                    <div className="field">
                      <label htmlFor="provider-email">Email</label>
                      <input
                        id="provider-email"
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, email: event.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-phone">Telephone</label>
                      <input
                        id="provider-phone"
                        value={form.phone}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-first-name">Prenom</label>
                      <input
                        id="provider-first-name"
                        value={form.first_name}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, first_name: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-last-name">Nom</label>
                      <input
                        id="provider-last-name"
                        value={form.last_name}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, last_name: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-commercial-name">Nom commercial</label>
                      <input
                        id="provider-commercial-name"
                        value={form.commercial_name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            commercial_name: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-siren">SIREN</label>
                      <input
                        id="provider-siren"
                        value={form.siren}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, siren: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-ape-code">Code APE / NAF</label>
                      <input
                        id="provider-ape-code"
                        value={form.ape_code}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, ape_code: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-country">Pays</label>
                      <input
                        id="provider-country"
                        value={form.country}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, country: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field field-span-2">
                      <label htmlFor="provider-address">Adresse</label>
                      <input
                        id="provider-address"
                        value={form.address}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, address: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-postal-code">Code postal</label>
                      <input
                        id="provider-postal-code"
                        value={form.postal_code}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            postal_code: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-city">Ville</label>
                      <input
                        id="provider-city"
                        value={form.city}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, city: event.target.value }))
                        }
                      />
                    </div>

                    <div className="row-actions field-span-2">
                      <button type="submit" className="button primary" disabled={saving}>
                        {saving ? "Enregistrement..." : "Enregistrer"}
                      </button>
                      <button type="button" className="button ghost" onClick={cancelEdition}>
                        Annuler
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="detail-grid">
                    <article className="detail-card">
                      <strong>Nom de la societe</strong>
                      <span className="muted-text">
                        {provider.company_name || provider.full_name || "Non renseigne"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>SIRET</strong>
                      <span className="muted-text">{provider.siret || "Non renseigne"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>SIREN</strong>
                      <span className="muted-text">{provider.siren || "Non renseigne"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Nom commercial</strong>
                      <span className="muted-text">
                        {provider.commercial_name || "Non renseigne"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Code APE / NAF</strong>
                      <span className="muted-text">{provider.ape_code || "Non renseigne"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Prenom / nom</strong>
                      <span className="muted-text">
                        {[provider.first_name, provider.last_name].filter(Boolean).join(" ") ||
                          "Non renseigne"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Email</strong>
                      <span className="muted-text">{provider.email}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Telephone</strong>
                      <span className="muted-text">{provider.phone || "Non renseigne"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Pays</strong>
                      <span className="muted-text">{provider.country || "Non renseigne"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Adresse</strong>
                      <span className="muted-text">{formatProviderAddress(provider)}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Date de creation du compte</strong>
                      <span className="muted-text">{formatAdminDateTime(provider.created_at)}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Identifiant interne</strong>
                      <span className="muted-text">{provider.internal_id}</span>
                    </article>
                  </div>
                )}
              </Panel>

              <Panel
                title="Invitation / activation"
                description="Le mot de passe n'est jamais defini par le super admin. Le prestataire active lui-meme son compte via un lien securise."
              >
                {resetFeedback ? (
                  <p className={`feedback ${resetFeedback.type}`}>{resetFeedback.message}</p>
                ) : null}

                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Email de connexion</strong>
                    <span className="muted-text">{provider.security?.loginEmail}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Statut du compte</strong>
                    <span className="muted-text">
                      {isInvitationPending
                        ? "Invite - en attente d'activation"
                        : provider.security?.accountActivationStatus === "blocked"
                          ? "Bloque"
                          : "Actif"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Dernier envoi de lien</strong>
                    <span className="muted-text">
                      {formatAdminDateTime(provider.security?.lastInvitationSentAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Mot de passe</strong>
                    <span className="muted-text">Defini uniquement par le prestataire.</span>
                  </article>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleInvitation}
                    disabled={sendingReset}
                  >
                    {sendingReset
                      ? "Envoi en cours..."
                      : isInvitationPending
                        ? "Envoyer l'invitation"
                        : "Envoyer l'email de confirmation"}
                  </button>
                </div>
              </Panel>
            </section>

            <section className="split-layout split-1-1">
              <Panel
                title="Abonnement"
                description="Etat actuel de l'abonnement Lokify et jalons disponibles."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Formule actuelle</strong>
                    <span className="muted-text">
                      {provider.subscription?.lokifyPlanName || "Aucune"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Statut</strong>
                    <StatusPill tone={subscriptionStatusMeta.tone}>
                      {subscriptionStatusMeta.label}
                    </StatusPill>
                  </article>
                  <article className="detail-card">
                    <strong>Date de debut</strong>
                    <span className="muted-text">
                      {formatAdminDate(provider.subscription?.lokifySubscriptionStartAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Date de fin</strong>
                    <span className="muted-text">
                      {formatAdminDate(provider.subscription?.lokifySubscriptionEndAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Renouvellement automatique</strong>
                    <span className="muted-text">
                      {formatBooleanLabel(!provider.subscription?.cancelAtPeriodEnd)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Prochaine echeance</strong>
                    <span className="muted-text">
                      {formatAdminDate(provider.subscription?.nextRenewalAt)}
                    </span>
                  </article>
                </div>

                <div className="stack">
                  {(provider.subscription?.history || []).length ? (
                    provider.subscription.history.map((item) => (
                      <article key={item.id} className="detail-card">
                        <strong>{item.label}</strong>
                        <span className="muted-text">{formatAdminDateTime(item.at)}</span>
                        <span className="muted-text">{item.description}</span>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <strong>Aucun historique exploitable</strong>
                      <span>La structure est prete pour accueillir davantage d'evenements.</span>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title="Paiement"
                description="Etat de facturation SaaS et informations Stripe disponibles."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Etat du paiement</strong>
                    <StatusPill tone={paymentStatusMeta.tone}>{paymentStatusMeta.label}</StatusPill>
                  </article>
                  <article className="detail-card">
                    <strong>Stripe connecte</strong>
                    <StatusPill tone={stripeStatusMeta.tone}>{stripeStatusMeta.label}</StatusPill>
                  </article>
                  <article className="detail-card">
                    <strong>ID client Stripe</strong>
                    <span className="muted-text">
                      {provider.subscription?.lokifyStripeCustomerId || "Non disponible"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Compte Stripe prestataire</strong>
                    <span className="muted-text">
                      {provider.payments?.customerStripeAccountId || "Non disponible"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Dernier paiement</strong>
                    <span className="muted-text">
                      {formatAdminDateTime(provider.payments?.customerLastPaymentAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Prochaine echeance de paiement</strong>
                    <span className="muted-text">
                      {formatAdminDate(provider.payments?.customerNextPaymentDueAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Moyen de paiement enregistre</strong>
                    <span className="muted-text">
                      {provider.payments?.customerPaymentMethodLabel || "Non disponible"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Statut general</strong>
                    <span className="muted-text">
                      {paymentStatusMeta.label} - {stripeStatusMeta.label.toLowerCase()}
                    </span>
                  </article>
                </div>
              </Panel>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function ProviderDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="page-stack" />
        </AppShell>
      }
    >
      <ProviderDetailPageContent />
    </Suspense>
  );
}
