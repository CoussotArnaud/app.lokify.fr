"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";

const emptyProviderForm = {
  full_name: "",
  email: "",
  password: "",
  provider_status: "active",
  billing: {
    planId: "essential",
    subscriptionStatus: "inactive",
    subscriptionStartAt: "",
    subscriptionEndAt: "",
    cancelAtPeriodEnd: false,
  },
};

const providerStatusTone = {
  active: "success",
  blocked: "danger",
};

const subscriptionStatusTone = {
  inactive: "neutral",
  active: "success",
  trial: "info",
  past_due: "warning",
  canceled: "neutral",
};

const toDateInputValue = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
};

export default function ProvidersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [form, setForm] = useState(emptyProviderForm);
  const [feedback, setFeedback] = useState(null);

  const loadProviders = async () => {
    setLoading(true);

    try {
      const response = await apiRequest("/admin/overview");
      setProviders(response.providers || []);
      setMetrics(response.metrics || null);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const updateBillingField = (field, value) => {
    setForm((current) => ({
      ...current,
      billing: {
        ...current.billing,
        [field]: value,
      },
    }));
  };

  const resetForm = () => {
    setEditingProviderId(null);
    setForm(emptyProviderForm);
  };

  const startEditing = (provider) => {
    setEditingProviderId(provider.id);
    setForm({
      full_name: provider.full_name,
      email: provider.email,
      password: "",
      provider_status: provider.provider_status,
      billing: {
        planId: provider.subscription?.lokifyPlanId || "essential",
        subscriptionStatus: provider.subscription?.lokifySubscriptionStatus || "inactive",
        subscriptionStartAt: toDateInputValue(provider.subscription?.lokifySubscriptionStartAt),
        subscriptionEndAt: toDateInputValue(provider.subscription?.lokifySubscriptionEndAt),
        cancelAtPeriodEnd: Boolean(provider.subscription?.cancelAtPeriodEnd),
      },
    });
    setFeedback(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      if (editingProviderId) {
        await apiRequest(`/admin/providers/${editingProviderId}`, {
          method: "PUT",
          body: form,
        });
      } else {
        await apiRequest("/admin/providers", {
          method: "POST",
          body: form,
        });
      }

      await loadProviders();
      resetForm();
      setFeedback({
        type: "success",
        message: editingProviderId
          ? "Le prestataire a ete mis a jour."
          : "Le prestataire a ete cree.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId) => {
    const confirmed = typeof window === "undefined" ? true : window.confirm("Supprimer ce prestataire et ses donnees ?");

    if (!confirmed) {
      return;
    }

    setFeedback(null);

    try {
      await apiRequest(`/admin/providers/${providerId}`, {
        method: "DELETE",
      });
      await loadProviders();

      if (editingProviderId === providerId) {
        resetForm();
      }

      setFeedback({
        type: "success",
        message: "Le prestataire a ete supprime.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Super admin</p>
            <h3>Gestion des prestataires, de leurs acces et de leurs abonnements Lokify.</h3>
            <p>
              Chaque prestataire reste strictement isole. Les clients finaux et reservations
              restent attaches a leur espace respectif.
            </p>
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        <section className="detail-grid">
          <article className="detail-card">
            <strong>{metrics?.totalProviders || 0}</strong>
            <span className="muted-text">prestataire(s)</span>
          </article>
          <article className="detail-card">
            <strong>{metrics?.activeProviders || 0}</strong>
            <span className="muted-text">compte(s) actifs</span>
          </article>
          <article className="detail-card">
            <strong>{metrics?.activeSubscriptions || 0}</strong>
            <span className="muted-text">abonnement(s) actifs</span>
          </article>
          <article className="detail-card">
            <strong>{metrics?.providerStripeConfigured || 0}</strong>
            <span className="muted-text">Stripe prestataire configure</span>
          </article>
        </section>

        <section className="split-layout split-2-1">
          <Panel
            title="Prestataires"
            description="Vue globale des comptes SaaS, de leur statut et de leur volume de donnees."
          >
            <DataTable
              rows={providers}
              emptyMessage={loading ? "Chargement..." : "Aucun prestataire."}
              columns={[
                {
                  key: "identity",
                  label: "Prestataire",
                  render: (row) => (
                    <div className="table-title">
                      <strong>{row.full_name}</strong>
                      <small>{row.email}</small>
                    </div>
                  ),
                },
                {
                  key: "provider_status",
                  label: "Compte",
                  render: (row) => (
                    <StatusPill tone={providerStatusTone[row.provider_status] || "neutral"}>
                      {row.provider_status}
                    </StatusPill>
                  ),
                },
                {
                  key: "subscription",
                  label: "Abonnement",
                  render: (row) => (
                    <div className="table-title">
                      <strong>{row.subscription?.lokifyPlanName || "Aucun"}</strong>
                      <small>{row.subscription?.lokifySubscriptionStatus || "inactive"}</small>
                    </div>
                  ),
                },
                {
                  key: "metrics",
                  label: "Donnees",
                  render: (row) =>
                    `${row.metrics?.totalClients || 0} clients / ${row.metrics?.totalReservations || 0} reservations`,
                },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="row-actions">
                      <button type="button" className="button ghost" onClick={() => startEditing(row)}>
                        Modifier
                      </button>
                      <button type="button" className="button ghost" onClick={() => handleDelete(row.id)}>
                        Supprimer
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </Panel>

          <Panel
            title={editingProviderId ? "Modifier un prestataire" : "Creer un prestataire"}
            description="Le mot de passe est obligatoire a la creation. Laissez-le vide en edition pour le conserver."
          >
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="provider-name">Nom</label>
                <input
                  id="provider-name"
                  value={form.full_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Ex. Studio Event"
                  required
                />
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
                  placeholder="contact@studio-event.fr"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="provider-password">Mot de passe</label>
                <input
                  id="provider-password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder={editingProviderId ? "Laisser vide pour conserver" : "Mot de passe"}
                />
              </div>

              <div className="field">
                <label htmlFor="provider-status">Statut compte</label>
                <select
                  id="provider-status"
                  value={form.provider_status}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, provider_status: event.target.value }))
                  }
                >
                  <option value="active">Actif</option>
                  <option value="blocked">Bloque</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="provider-plan">Formule</label>
                <select
                  id="provider-plan"
                  value={form.billing.planId}
                  onChange={(event) => updateBillingField("planId", event.target.value)}
                >
                  <option value="essential">Essentiel</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="provider-subscription-status">Statut abonnement</label>
                <select
                  id="provider-subscription-status"
                  value={form.billing.subscriptionStatus}
                  onChange={(event) => updateBillingField("subscriptionStatus", event.target.value)}
                >
                  <option value="inactive">Inactive</option>
                  <option value="trial">Essai</option>
                  <option value="active">Active</option>
                  <option value="past_due">En retard</option>
                  <option value="canceled">Annulee</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="provider-start">Debut abonnement</label>
                <input
                  id="provider-start"
                  type="date"
                  value={form.billing.subscriptionStartAt}
                  onChange={(event) => updateBillingField("subscriptionStartAt", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="provider-end">Fin abonnement</label>
                <input
                  id="provider-end"
                  type="date"
                  value={form.billing.subscriptionEndAt}
                  onChange={(event) => updateBillingField("subscriptionEndAt", event.target.value)}
                />
              </div>

              <label className="detail-card">
                <strong>Annuler le renouvellement a echeance</strong>
                <div className="row-actions">
                  <input
                    type="checkbox"
                    checked={form.billing.cancelAtPeriodEnd}
                    onChange={(event) =>
                      updateBillingField("cancelAtPeriodEnd", event.target.checked)
                    }
                  />
                  <span className="muted-text">
                    L'acces est maintenu jusqu'a la fin de la periode payee.
                  </span>
                </div>
              </label>

              <div className="row-actions">
                <button type="submit" className="button primary" disabled={saving}>
                  {saving
                    ? "Enregistrement..."
                    : editingProviderId
                      ? "Mettre a jour"
                      : "Creer le prestataire"}
                </button>
                {editingProviderId ? (
                  <button type="button" className="button ghost" onClick={resetForm}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}
