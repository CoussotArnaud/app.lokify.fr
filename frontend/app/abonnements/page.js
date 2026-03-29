"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "../../components/app-shell";
import MetricCard from "../../components/metric-card";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";
import {
  formatAdminDate,
  getPaymentStatusMeta,
  getRenewalStatusMeta,
  getStripeStatusMeta,
  getSubscriptionStatusMeta,
} from "../../lib/provider-admin";

export default function SubscriptionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const loadOverview = async () => {
    setLoading(true);

    try {
      const response = await apiRequest("/admin/overview");
      setOverview(response);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const providers = overview?.providers || [];
  const filteredProviders = providers.filter((provider) => {
    if (!deferredSearch) {
      return true;
    }

    return [
      provider.company_name,
      provider.full_name,
      provider.email,
      provider.siret,
      provider.commercial_name,
      provider.phone,
      provider.subscription?.lokifyPlanName,
      provider.subscription?.lokifySubscriptionStatus,
      provider.payments?.customerPaymentStatus,
      provider.payments?.customerStripeAccountStatus,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Gestion des abonnements prestataires.</h3>
            <p>
              Cette page reste dédiée au suivi des formules Lokify, des paiements et des
              renouvellements, sans mélanger le pilotage global du SaaS.
            </p>
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        <section className="metric-grid">
          <MetricCard
            icon="shield"
            label="Abonnements actifs"
            value={overview?.metrics?.activeSubscriptions || 0}
            helper="Prestataires actuellement en période active Lokify."
            tone="info"
          />
          <MetricCard
            icon="mail"
            label="Alertes paiement"
            value={overview?.metrics?.paymentAlerts || 0}
            helper="Prestataires en retard, impayés ou expirés."
            tone="warning"
          />
          <MetricCard
            icon="users"
            label="Prestataires à jour"
            value={overview?.metrics?.providersUpToDate || 0}
            helper="Dossiers avec paiement sain ou en essai."
            tone="success"
          />
          <MetricCard
            icon="settings"
            label="Stripe configuré"
            value={overview?.metrics?.providerStripeConfigured || 0}
            helper="Comptes prestataires avec paramètres Stripe disponibles."
            tone="info"
          />
        </section>

        <Panel
          title="Abonnements prestataires"
          description="Vue d’ensemble des statuts, des paiements et des renouvellements, avec accès direct à la fiche complète du prestataire."
          actions={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un prestataire, un e-mail, un SIRET ou un statut"
            />
          }
        >
          <div className="table-wrap">
            <table className="data-table admin-pilot-table">
              <thead>
                <tr>
                  <th>Prestataire</th>
                  <th>Formule</th>
                  <th>Abonnement</th>
                  <th>Paiement</th>
                  <th>Renouvellement</th>
                  <th>Stripe client</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProviders.length ? (
                  filteredProviders.map((provider) => {
                    const subscriptionMeta = getSubscriptionStatusMeta(
                      provider.subscription?.lokifySubscriptionStatus
                    );
                    const paymentMeta = getPaymentStatusMeta(
                      provider.payments?.customerPaymentStatus
                    );
                    const renewalMeta = getRenewalStatusMeta(
                      provider.subscription?.cancelAtPeriodEnd
                    );
                    const stripeMeta = getStripeStatusMeta(
                      provider.payments?.customerStripeAccountStatus
                    );

                    return (
                      <tr
                        key={provider.id}
                        className="interactive-table-row"
                        tabIndex={0}
                        onClick={() =>
                          router.push(`/prestataires/${provider.id}?from=subscriptions`)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/prestataires/${provider.id}?from=subscriptions`);
                          }
                        }}
                      >
                        <td>
                          <div className="table-title">
                            <strong>{provider.full_name}</strong>
                            <small>{provider.email}</small>
                            <small>{provider.phone || "Téléphone non renseigné"}</small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <strong>{provider.subscription?.lokifyPlanName || "Aucune"}</strong>
                            <small>
                              {provider.subscription?.lokifyPlanPrice
                                ? `${provider.subscription.lokifyPlanPrice} € / ${provider.subscription.lokifyPlanInterval === "year" ? "an" : "mois"}`
                                : "Tarif non renseigné"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={subscriptionMeta.tone}>
                              {subscriptionMeta.label}
                            </StatusPill>
                            <small>
                              Début {formatAdminDate(provider.subscription?.lokifySubscriptionStartAt)}
                            </small>
                            <small>
                              Fin {formatAdminDate(provider.subscription?.lokifySubscriptionEndAt)}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={paymentMeta.tone}>{paymentMeta.label}</StatusPill>
                            <small>
                              Dernier paiement{" "}
                              {formatAdminDate(provider.payments?.customerLastPaymentAt)}
                            </small>
                            <small>
                              Prochaine échéance{" "}
                              {formatAdminDate(provider.payments?.customerNextPaymentDueAt)}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={renewalMeta.tone}>{renewalMeta.label}</StatusPill>
                            <small>
                              {provider.subscription?.cancelAtPeriodEnd
                                ? "Arrêt à la fin de la période en cours"
                                : "Reconduction automatique active"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={stripeMeta.tone}>{stripeMeta.label}</StatusPill>
                            <small>
                              {provider.payments?.customerStripeAccountId || "Aucun identifiant Stripe"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="row-actions table-actions-compact">
                            <button
                              type="button"
                              className="button ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(
                                  `/prestataires/${provider.id}?from=subscriptions&edit=1`
                                );
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="button ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/prestataires/${provider.id}?from=subscriptions`);
                              }}
                            >
                              Fiche
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {loading
                        ? "Chargement des abonnements..."
                        : "Aucun abonnement prestataire à afficher."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
