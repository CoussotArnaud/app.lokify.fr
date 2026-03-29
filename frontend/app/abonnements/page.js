"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "../../components/app-shell";
import MetricCard from "../../components/metric-card";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";
import { formatCurrency } from "../../lib/date";
import {
  formatAdminDate,
  getPaymentStatusMeta,
  getRenewalStatusMeta,
  getStripeStatusMeta,
  getSubscriptionStatusMeta,
} from "../../lib/provider-admin";

const createQuickEditForm = () => ({
  full_name: "",
  email: "",
  phone: "",
});

export default function SubscriptionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [quickEditProvider, setQuickEditProvider] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState(createQuickEditForm);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
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
      provider.full_name,
      provider.email,
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

  const openQuickEdit = (provider) => {
    setQuickEditProvider(provider);
    setQuickEditForm({
      full_name: provider.full_name || "",
      email: provider.email || "",
      phone: provider.phone || "",
    });
    setFeedback(null);
  };

  const closeQuickEdit = () => {
    setQuickEditProvider(null);
    setQuickEditForm(createQuickEditForm());
  };

  const handleQuickEditSubmit = async (event) => {
    event.preventDefault();
    setQuickEditSaving(true);
    setFeedback(null);

    try {
      await apiRequest(`/admin/providers/${quickEditProvider.id}`, {
        method: "PUT",
        body: quickEditForm,
      });

      await loadOverview();
      closeQuickEdit();
      setFeedback({
        type: "success",
        message: "Les coordonnees principales du prestataire ont ete mises a jour.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setQuickEditSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Pilotage centralise des comptes prestataires, abonnements et paiements.</h3>
            <p>
              Cette vue permet de lire la situation de chaque prestataire en un coup d&apos;oeil,
              d&apos;agir rapidement sur ses coordonnees et d&apos;ouvrir sa fiche detaillee.
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
            icon="bill"
            label="CA mensuel Lokify"
            value={formatCurrency(overview?.metrics?.lokifyMonthlyRevenue || 0)}
            helper="Base recurrente des abonnements plateforme actifs."
            tone="success"
          />
          <MetricCard
            icon="chart"
            label="CA annuel Lokify"
            value={formatCurrency(overview?.metrics?.lokifyAnnualRevenue || 0)}
            helper="Projection annuelle des revenus plateforme en cours."
            tone="info"
          />
          <MetricCard
            icon="users"
            label="Prestataires actifs"
            value={overview?.metrics?.activeProvidersCurrently || 0}
            helper="Comptes actives pouvant exploiter Lokify actuellement."
            tone="success"
          />
          <MetricCard
            icon="shield"
            label="Abonnements actifs"
            value={overview?.metrics?.activeSubscriptions || 0}
            helper="Prestataires actuellement en periode active."
            tone="info"
          />
          <MetricCard
            icon="mail"
            label="Alertes paiement"
            value={overview?.metrics?.paymentAlerts || 0}
            helper="Prestataires en retard, impayes ou expires."
            tone="warning"
          />
        </section>

        <Panel
          title="Abonnements prestataires"
          description="Vue d'ensemble des statuts, des paiements et des acces avec modification rapide et acces a la fiche detaillee."
          actions={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un prestataire, un email ou un statut"
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
                        onClick={() => router.push(`/abonnements/${provider.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/abonnements/${provider.id}`);
                          }
                        }}
                      >
                        <td>
                          <div className="table-title">
                            <strong>{provider.full_name}</strong>
                            <small>{provider.email}</small>
                            <small>{provider.phone || "Telephone non renseigne"}</small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <strong>{provider.subscription?.lokifyPlanName || "Aucune"}</strong>
                            <small>
                              {provider.subscription?.lokifyPlanPrice
                                ? `${provider.subscription.lokifyPlanPrice} EUR / ${provider.subscription.lokifyPlanInterval === "year" ? "an" : "mois"}`
                                : "Tarif non renseigne"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={subscriptionMeta.tone}>
                              {subscriptionMeta.label}
                            </StatusPill>
                            <small>
                              Debut {formatAdminDate(provider.subscription?.lokifySubscriptionStartAt)}
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
                              Prochaine echeance{" "}
                              {formatAdminDate(provider.payments?.customerNextPaymentDueAt)}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="table-title">
                            <StatusPill tone={renewalMeta.tone}>{renewalMeta.label}</StatusPill>
                            <small>
                              {provider.subscription?.cancelAtPeriodEnd
                                ? "Arret a la fin de la periode en cours"
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
                                openQuickEdit(provider);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="button ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/abonnements/${provider.id}`);
                              }}
                            >
                              Voir
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
                        : "Aucun abonnement prestataire a afficher."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <ModalShell
          open={Boolean(quickEditProvider)}
          title={
            quickEditProvider
              ? `Edition rapide - ${quickEditProvider.full_name}`
              : "Edition rapide"
          }
          description="Mise a jour rapide des coordonnees principales sans quitter la liste."
          onClose={closeQuickEdit}
        >
          <form className="form-grid" onSubmit={handleQuickEditSubmit}>
            <div className="field">
              <label htmlFor="quick-provider-name">Nom / raison sociale</label>
              <input
                id="quick-provider-name"
                value={quickEditForm.full_name}
                onChange={(event) =>
                  setQuickEditForm((current) => ({
                    ...current,
                    full_name: event.target.value,
                  }))
                }
                placeholder="Nom du prestataire"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="quick-provider-email">Email</label>
              <input
                id="quick-provider-email"
                type="email"
                value={quickEditForm.email}
                onChange={(event) =>
                  setQuickEditForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="contact@prestataire.fr"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="quick-provider-phone">Telephone</label>
              <input
                id="quick-provider-phone"
                value={quickEditForm.phone}
                onChange={(event) =>
                  setQuickEditForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="06 00 00 00 00"
              />
            </div>

            <div className="row-actions">
              <button type="submit" className="button primary" disabled={quickEditSaving}>
                {quickEditSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" className="button ghost" onClick={closeQuickEdit}>
                Annuler
              </button>
            </div>
          </form>
        </ModalShell>
      </div>
    </AppShell>
  );
}
