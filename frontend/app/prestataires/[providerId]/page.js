"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../components/app-shell";
import DataTable from "../../../components/data-table";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerId = params?.providerId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
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

  useEffect(() => {
    if (provider && searchParams.get("edit") === "1") {
      setEditing(true);
    }
  }, [provider, searchParams]);

  const removeEditFlagFromUrl = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("edit");
    router.replace(
      nextSearchParams.toString()
        ? `/prestataires/${providerId}?${nextSearchParams.toString()}`
        : `/prestataires/${providerId}`
    );
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      if (!isValidSiret(form.siret)) {
        throw new Error("Le numéro de SIRET est invalide.");
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
      removeEditFlagFromUrl();
      setFeedback({
        type: "success",
        message: "La fiche prestataire a été mise à jour.",
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
    removeEditFlagFromUrl();
  };

  const archiveAwareProviderStatusMeta = getProviderStatusMeta(
    provider?.archive?.isArchived ? "archived" : provider?.provider_status
  );
  const subscriptionStatusMeta = getSubscriptionStatusMeta(
    provider?.subscription?.lokifySubscriptionStatus
  );
  const paymentStatusMeta = getPaymentStatusMeta(provider?.payments?.customerPaymentStatus);
  const stripeStatusMeta = getStripeStatusMeta(provider?.payments?.customerStripeAccountStatus);
  const isInvitationPending = provider?.provider_status === "invited";
  const isArchived = Boolean(provider?.archive?.isArchived);
  const isNewlyCreated = searchParams.get("created") === "1";
  const origin = searchParams.get("from");
  const scope = searchParams.get("scope");
  const backHref =
    scope === "archived"
      ? "/prestataires?scope=archived"
      : origin === "subscriptions"
        ? "/abonnements"
        : origin === "dashboard"
          ? "/dashboard"
          : "/prestataires";
  const backLabel =
    scope === "archived"
      ? "Retour aux archives"
      : origin === "subscriptions"
      ? "Retour aux abonnements"
      : origin === "dashboard"
        ? "Retour au dashboard"
        : "Retour aux prestataires";

  const handleArchive = async () => {
    if (!providerId || !window.confirm("Archiver ce prestataire ? Aucune donnée ne sera supprimée.")) {
      return;
    }

    setArchiving(true);
    setFeedback(null);

    try {
      await apiRequest(`/admin/providers/${providerId}/archive`, {
        method: "POST",
      });
      await loadProvider();
      setFeedback({
        type: "success",
        message: "Le prestataire a été archivé. Toutes les données restent conservées.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    if (!providerId || !window.confirm("Restaurer ce prestataire archivé ?")) {
      return;
    }

    setRestoring(true);
    setFeedback(null);

    try {
      await apiRequest(`/admin/providers/${providerId}/restore`, {
        method: "POST",
      });
      await loadProvider();
      setFeedback({
        type: "success",
        message: "Le prestataire a été restauré.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Fiche prestataire détaillée</h3>
            <p>
              Vue claire du compte, de son activité et de son abonnement Lokify, avec vérification
              SIRET uniforme et activation sécurisée.
            </p>
          </div>
          <div className="page-header-actions">
            <Link href={backHref} className="button ghost">
              {backLabel}
            </Link>
            {provider ? (
              isArchived ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleRestore}
                  disabled={restoring}
                >
                  {restoring ? "Restauration..." : "Restaurer"}
                </button>
              ) : (
                <button
                  type="button"
                  className="button ghost"
                  onClick={handleArchive}
                  disabled={archiving}
                >
                  {archiving ? "Archivage..." : "Archiver"}
                </button>
              )
            ) : null}
          </div>
        </div>

        {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}

        {isNewlyCreated ? (
          <p className="feedback info">
            Le compte a été créé en statut invité. Vous pouvez maintenant envoyer le lien
            d&apos;activation au prestataire.
          </p>
        ) : null}

        {loading && !provider ? (
          <Panel title="Chargement de la fiche" description="Lecture des données prestataire en cours.">
            <div className="empty-state">
              <strong>Préparation de la fiche détaillée</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading && provider ? (
          <>
            <Panel
              title={provider.company_name || provider.full_name}
              description={`${provider.email} - compte créé le ${formatAdminDate(provider.created_at)}`}
              actions={
                <div className="row-actions">
                  <StatusPill tone={archiveAwareProviderStatusMeta.tone}>
                    {archiveAwareProviderStatusMeta.label}
                  </StatusPill>
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
                  helper={`Échéance ${formatAdminDate(provider.subscription?.nextRenewalAt)}`}
                  tone="success"
                />
                <MetricCard
                  icon="mail"
                  label="État du paiement"
                  value={paymentStatusMeta.label}
                  helper={`Dernier paiement ${formatAdminDate(provider.payments?.customerLastPaymentAt)}`}
                  tone={paymentStatusMeta.tone === "warning" ? "warning" : "info"}
                />
                <MetricCard
                  icon="settings"
                  label="Stripe client"
                  value={stripeStatusMeta.label}
                  helper={provider.payments?.customerStripeAccountId || "Aucun compte connecté"}
                  tone={stripeStatusMeta.tone === "success" ? "success" : "info"}
                />
                <MetricCard
                  icon="users"
                  label="Activité"
                  value={`${provider.metrics?.totalClients || 0} clients`}
                  helper={`${provider.metrics?.totalReservations || 0} réservations rattachées`}
                  tone="info"
                />
              </section>
            </Panel>

            {isArchived ? (
              <Panel
                title="Prestataire archivé"
                description="Le dossier reste consultable en détail et peut être restauré sans perte de données."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Archivé le</strong>
                    <span className="muted-text">{formatAdminDateTime(provider.archive?.archivedAt)}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Purge définitive planifiée</strong>
                    <span className="muted-text">{formatAdminDateTime(provider.archive?.scheduledPurgeAt)}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Motif</strong>
                    <span className="muted-text">{provider.archive?.archiveReason || "Non renseigné"}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Dernière restauration</strong>
                    <span className="muted-text">{formatAdminDateTime(provider.archive?.restoredAt)}</span>
                  </article>
                </div>
              </Panel>
            ) : null}

            <Panel
              title="Performance prestataire"
               description="Lecture seule de l'activité du prestataire pour piloter rapidement sa performance sans modifier ses données."
            >
              <section className="metric-grid">
                <MetricCard
                  icon="chart"
                  label="CA mensuel prestataire"
                  value={formatCurrency(provider.business?.monthlyRevenue || 0)}
                  helper="Réservations confirmées ou terminées sur le mois en cours."
                  tone="success"
                />
                <MetricCard
                  icon="bill"
                  label="CA total prestataire"
                  value={formatCurrency(provider.business?.totalRevenue || 0)}
                  helper="Cumul confirmé sur l'historique disponible."
                  tone="info"
                />
                <MetricCard
                  icon="calendar"
                  label="Réservations"
                  value={provider.business?.totalReservations || 0}
                  helper={`Dont ${provider.business?.confirmedReservations || 0} à impact chiffre d'affaires.`}
                  tone="info"
                />
              </section>
            </Panel>

            <section className="split-layout split-1-1">
              <Panel
                title="Informations du compte"
                description="Coordonnées administratives et contact principal du prestataire."
                actions={
                  !editing && !isArchived ? (
                    <button type="button" className="button ghost" onClick={() => setEditing(true)}>
                      Modifier
                    </button>
                  ) : null
                }
              >
                {editing ? (
                  <form className="form-grid two-columns" onSubmit={handleSave}>
                    <div className="field">
                      <label htmlFor="provider-company-name">Nom de la société</label>
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
                        La vérification démarre automatiquement à 14 chiffres et actualise les
                        informations d&apos;entreprise reconnues.
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
                      <label htmlFor="provider-phone">Téléphone</label>
                      <input
                        id="provider-phone"
                        value={form.phone}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="provider-first-name">Prénom</label>
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
                      <strong>Nom de la société</strong>
                      <span className="muted-text">
                        {provider.company_name || provider.full_name || "Non renseigné"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>SIRET</strong>
                      <span className="muted-text">{provider.siret || "Non renseigné"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>SIREN</strong>
                      <span className="muted-text">{provider.siren || "Non renseigné"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Nom commercial</strong>
                      <span className="muted-text">
                        {provider.commercial_name || "Non renseigné"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Code APE / NAF</strong>
                      <span className="muted-text">{provider.ape_code || "Non renseigné"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Prénom / nom</strong>
                      <span className="muted-text">
                        {[provider.first_name, provider.last_name].filter(Boolean).join(" ") ||
                          "Non renseigné"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Email</strong>
                      <span className="muted-text">{provider.email}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Téléphone</strong>
                      <span className="muted-text">{provider.phone || "Non renseigné"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Pays</strong>
                      <span className="muted-text">{provider.country || "Non renseigné"}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Adresse</strong>
                      <span className="muted-text">{formatProviderAddress(provider)}</span>
                    </article>
                    <article className="detail-card">
                      <strong>Date de création du compte</strong>
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
                description={
                  isArchived
                    ? "Le compte est archivé. Les envois d'invitation et de réinitialisation sont bloqués jusqu'à restauration."
                    : "Le mot de passe n'est jamais défini par le super admin. Le prestataire active lui-même son compte via un lien sécurisé."
                }
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
                      {isArchived
                        ? "Archivé"
                        : isInvitationPending
                        ? "Invité - en attente d'activation"
                        : provider.security?.accountActivationStatus === "blocked"
                          ? "Bloqué"
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
                    <span className="muted-text">Défini uniquement par le prestataire.</span>
                  </article>
                </div>

                {!isArchived ? (
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
                        : "Envoyer l'e-mail de confirmation"}
                    </button>
                  </div>
                ) : null}
              </Panel>
            </section>

            <section className="split-layout split-1-1">
              <Panel
                title="Abonnement"
                description="État actuel de l'abonnement Lokify et jalons disponibles."
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
                    <strong>Date de début</strong>
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
                    <strong>Prochaine échéance</strong>
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
                      <span>La structure est prête pour accueillir davantage d'événements.</span>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title="Paiement"
                description="État de facturation SaaS et informations Stripe disponibles."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>État du paiement</strong>
                    <StatusPill tone={paymentStatusMeta.tone}>{paymentStatusMeta.label}</StatusPill>
                  </article>
                  <article className="detail-card">
                    <strong>Stripe connecté</strong>
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
                    <strong>Prochaine échéance de paiement</strong>
                    <span className="muted-text">
                      {formatAdminDate(provider.payments?.customerNextPaymentDueAt)}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Moyen de paiement enregistré</strong>
                    <span className="muted-text">
                      {provider.payments?.customerPaymentMethodLabel || "Non disponible"}
                    </span>
                  </article>
                  <article className="detail-card">
                    <strong>Statut général</strong>
                    <span className="muted-text">
                      {paymentStatusMeta.label} - {stripeStatusMeta.label.toLowerCase()}
                    </span>
                  </article>
                </div>
              </Panel>
            </section>

            <section className="split-layout split-1-1">
              <Panel
                title="Clients liés"
                description="Dossiers clients encore actifs ou déjà archivés chez ce prestataire."
              >
                <DataTable
                  rows={provider.linked_clients || []}
                  emptyMessage="Aucun client lié."
                  columns={[
                    {
                      key: "full_name",
                      label: "Client",
                      render: (row) => (
                        <div className="table-title">
                          <strong>{row.full_name || "Client sans nom"}</strong>
                          <small>{row.email || "Email non renseigné"}</small>
                        </div>
                      ),
                    },
                    {
                      key: "status",
                        label: "État",
                      render: (row) => (
                        <StatusPill tone={row.archive?.isArchived ? "warning" : "success"}>
                          {row.archive?.isArchived ? "Archivé" : "Actif"}
                        </StatusPill>
                      ),
                    },
                    {
                      key: "metrics",
                      label: "Historique",
                      render: (row) => (
                        <div className="table-title">
                          <strong>{row.metrics?.reservationCount || 0} réservations</strong>
                          <small>{formatCurrency(row.metrics?.totalRevenue || 0)}</small>
                        </div>
                      ),
                    },
                  ]}
                />
              </Panel>

              <Panel
                title="Réservations récentes"
                description="Historique récent des dossiers liés au prestataire."
              >
                <DataTable
                  rows={provider.linked_reservations || []}
                  emptyMessage="Aucune réservation récente."
                  columns={[
                    {
                      key: "reference",
                      label: "Référence",
                      render: (row) => row.reference || row.id,
                    },
                    {
                      key: "client_name",
                      label: "Client",
                      render: (row) => row.client_name || "Client indisponible",
                    },
                    {
                      key: "period",
                      label: "Début",
                      render: (row) => formatAdminDateTime(row.start_date),
                    },
                    {
                      key: "amount",
                      label: "Montant",
                      render: (row) => formatCurrency(row.total_amount || 0),
                    },
                    {
                      key: "status",
                      label: "Statut",
                      render: (row) => <StatusPill tone="info">{row.status}</StatusPill>,
                    },
                  ]}
                />
              </Panel>
            </section>

            <section className="split-layout split-1-1">
              <Panel
                title="Catalogue / prestations"
                description="Produits et prestations conservés dans le dossier du prestataire."
              >
                <DataTable
                  rows={provider.linked_catalog_items || []}
                  emptyMessage="Aucun produit ou service remonté."
                  columns={[
                    { key: "name", label: "Nom" },
                    { key: "category", label: "Catégorie" },
                    {
                      key: "price",
                      label: "Prix",
                      render: (row) => formatCurrency(row.price || 0),
                    },
                    {
                      key: "stock",
                      label: "Stock",
                      render: (row) => row.stock || 0,
                    },
                    {
                      key: "status",
                      label: "État",
                      render: (row) => <StatusPill tone={row.status === "inactive" ? "neutral" : "success"}>{row.status}</StatusPill>,
                    },
                  ]}
                />
              </Panel>

              <Panel
                title="Historique récent"
                description="Événements métier et traces récentes du dossier prestataire."
                >
                <DataTable
                  rows={provider.history || []}
                  emptyMessage="Aucun événement récent."
                  columns={[
                    { key: "event_type", label: "Événement" },
                    { key: "aggregate_type", label: "Objet" },
                    {
                      key: "actor",
                      label: "Auteur",
                      render: (row) => row.actor?.full_name || row.actor?.email || "Système",
                    },
                    {
                      key: "occurred_at",
                      label: "Date",
                      render: (row) => formatAdminDateTime(row.occurred_at),
                    },
                    {
                      key: "event_status",
                      label: "Statut",
                      render: (row) => <StatusPill tone="info">{row.event_status}</StatusPill>,
                    },
                  ]}
                />
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
