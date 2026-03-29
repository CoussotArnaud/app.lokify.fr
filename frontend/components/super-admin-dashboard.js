"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import AppShell from "./app-shell";
import MetricCard from "./metric-card";
import Panel from "./panel";
import SearchInput from "./search-input";
import StatusPill from "./status-pill";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/date";
import {
  formatAdminDateTime,
  getPaymentStatusMeta,
  getProviderStatusMeta,
  getSubscriptionStatusMeta,
} from "../lib/provider-admin";

const matchesProviderQuery = (provider, query) =>
  [
    provider.company_name,
    provider.full_name,
    provider.email,
    provider.siret,
    provider.commercial_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [overview, setOverview] = useState(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);

      try {
        const response = await apiRequest("/admin/overview");
        setOverview(response);
        setFeedback(null);
      } catch (error) {
        setFeedback({ type: "error", message: error.message });
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, []);

  const providers = overview?.providers || [];
  const highlightedProviders = deferredSearch
    ? providers.filter((provider) => matchesProviderQuery(provider, deferredSearch)).slice(0, 6)
    : providers.slice(0, 5);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Dashboard Lokify</h3>
            <p>
              Vue de pilotage globale de la plateforme, avec les revenus Lokify, l&apos;état du parc
              de prestataires et un raccourci direct vers chaque fiche.
            </p>
          </div>
          <div className="page-header-actions">
            <Link href="/prestataires" className="button ghost">
              Gérer les prestataires
            </Link>
            <Link href="/abonnements" className="button ghost">
              Gérer les abonnements
            </Link>
          </div>
        </div>

        {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}

        <section className="metric-grid">
          <MetricCard
            icon="bill"
            label="CA mensuel Lokify"
            value={formatCurrency(overview?.metrics?.lokifyMonthlyRevenue || 0)}
            helper="Revenu plateforme mensuel basé sur les abonnements actifs."
            tone="success"
          />
          <MetricCard
            icon="chart"
            label="CA annuel Lokify"
            value={formatCurrency(overview?.metrics?.lokifyAnnualRevenue || 0)}
            helper="Projection annuelle des revenus Lokify actuellement engagés."
            tone="info"
          />
          <MetricCard
            icon="users"
            label="Prestataires actifs"
            value={overview?.metrics?.activeProvidersCurrently || 0}
            helper="Comptes prestataires actifs et exploitables à date."
            tone="success"
          />
        </section>

        <section className="split-layout split-1-1">
          <Panel
            title="Recherche rapide prestataire"
            description="Raccourci express par nom, e-mail, SIRET ou société pour ouvrir la bonne fiche sans quitter le dashboard."
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Rechercher un prestataire, un e-mail ou un SIRET"
              />
            }
          >
            <div className="card-list">
              {highlightedProviders.map((provider) => {
                const providerStatusMeta = getProviderStatusMeta(provider.provider_status);
                const subscriptionMeta = getSubscriptionStatusMeta(
                  provider.subscription?.lokifySubscriptionStatus
                );

                return (
                  <Link
                    key={provider.id}
                    href={`/prestataires/${provider.id}${deferredSearch ? "?from=dashboard" : ""}`}
                    className="detail-card"
                  >
                    <div className="row-actions">
                      <div className="stack">
                        <strong>{provider.company_name || provider.full_name}</strong>
                        <span className="muted-text">{provider.email}</span>
                        <span className="muted-text">
                          {provider.siret || "SIRET non renseigné"}
                        </span>
                      </div>
                      <div className="row-actions">
                        <StatusPill tone={providerStatusMeta.tone}>
                          {providerStatusMeta.label}
                        </StatusPill>
                        <StatusPill tone={subscriptionMeta.tone}>
                          {subscriptionMeta.label}
                        </StatusPill>
                      </div>
                    </div>
                    <span className="muted-text">
                      {provider.security?.lastInvitationSentAt
                        ? `Dernier lien ${formatAdminDateTime(provider.security.lastInvitationSentAt)}`
                        : "Aucun envoi récent"}
                    </span>
                  </Link>
                );
              })}

              {!highlightedProviders.length ? (
                <div className="empty-state">
                  <strong>
                    {loading ? "Chargement des prestataires..." : "Aucun résultat sur cette recherche"}
                  </strong>
                  <span>
                    {loading
                      ? "Le dashboard récupère les comptes et leurs statuts."
                      : "Essayez un autre nom, e-mail, SIRET ou revenez sur la page Prestataires."}
                  </span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Points de pilotage"
            description="Les signaux utiles à garder sous les yeux pour suivre l'activité SaaS."
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Invitations en attente</strong>
                <span className="muted-text">
                  {overview?.metrics?.invitedProviders || 0} compte(s) non activés.
                </span>
              </article>
              <article className="detail-card">
                <strong>Abonnements actifs</strong>
                <span className="muted-text">
                  {overview?.metrics?.activeSubscriptions || 0} formule(s) en cours.
                </span>
              </article>
              <article className="detail-card">
                <strong>Alertes paiement</strong>
                <span className="muted-text">
                  {overview?.metrics?.paymentAlerts || 0} dossier(s) à surveiller.
                </span>
              </article>
              <article className="detail-card">
                <strong>Stripe prestataire configuré</strong>
                <span className="muted-text">
                  {overview?.metrics?.providerStripeConfigured || 0} compte(s) connectés.
                </span>
              </article>
            </div>

            <div className="card-list">
              {providers.slice(0, 3).map((provider) => {
                const paymentMeta = getPaymentStatusMeta(
                  provider.payments?.customerPaymentStatus
                );

                return (
                  <article key={provider.id} className="detail-card">
                    <div className="row-actions">
                      <div className="stack">
                        <strong>{provider.company_name || provider.full_name}</strong>
                        <span className="muted-text">
                          {provider.subscription?.lokifyPlanName || "Aucune formule active"}
                        </span>
                      </div>
                      <StatusPill tone={paymentMeta.tone}>{paymentMeta.label}</StatusPill>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}
