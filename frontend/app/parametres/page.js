"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { isSuperAdmin } from "../../lib/access";
import { defaultReservationStatuses } from "../../lib/lokify-data";

const initialPlatformForm = {
  publishableKey: "",
  secretKey: "",
  webhookSecret: "",
  priceIds: {
    essential: "",
    pro: "",
    premium: "",
  },
};

const initialProviderForm = {
  customerPaymentsEnabled: false,
  stripeMode: "test",
  publishableKey: "",
  secretKey: "",
  webhookSecret: "",
  accountId: "",
};

const initialLocalPreferences = {
  store_active: true,
  delivery_mode: true,
  customer_notifications: true,
  accounting_export: false,
};

const formatStripeModeLabel = (value) =>
  String(value || "test").trim().toLowerCase() === "live" ? "Production" : "Configuration";

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [platformSettings, setPlatformSettings] = useState(null);
  const [providerSettings, setProviderSettings] = useState(null);
  const [platformForm, setPlatformForm] = useState(initialPlatformForm);
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [localPreferences, setLocalPreferences] = useState(initialLocalPreferences);
  const [reservationStatuses, setReservationStatuses] = useState(defaultReservationStatuses);
  const [savingStatuses, setSavingStatuses] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (isSuperAdmin(user)) {
        const response = await apiRequest("/admin/stripe/settings");
        setPlatformSettings(response.stripeSettings);
      } else {
        const [response, statusesResponse] = await Promise.all([
          apiRequest("/customer-payments/settings"),
          apiRequest("/reservations/statuses"),
        ]);
        setProviderSettings(response.customerPayments);
        setReservationStatuses(statusesResponse.statuses || defaultReservationStatuses);
        setProviderForm((current) => ({
          ...current,
          customerPaymentsEnabled: Boolean(response.customerPayments?.customerPaymentsEnabled),
          stripeMode: response.customerPayments?.customerStripeMode || "test",
          accountId: response.customerPayments?.customerStripeAccountId || "",
        }));
      }
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    loadSettings();
  }, [user]);

  const togglePreference = (key) => {
    setLocalPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const updatePlatformPriceId = (planId, value) => {
    setPlatformForm((current) => ({
      ...current,
      priceIds: {
        ...current.priceIds,
        [planId]: value,
      },
    }));
  };

  const updateReservationStatusForm = (code, field, value) => {
    setReservationStatuses((current) =>
      current.map((status) => (status.code === code ? { ...status, [field]: value } : status))
    );
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      if (isSuperAdmin(user)) {
        const response = await apiRequest("/admin/stripe/settings", {
          method: "PUT",
          body: platformForm,
        });
        setPlatformSettings(response.stripeSettings);
        setPlatformForm(initialPlatformForm);
      } else {
        const response = await apiRequest("/customer-payments/settings", {
          method: "PUT",
          body: providerForm,
        });
        setProviderSettings(response.customerPayments);
        setProviderForm((current) => ({
          ...initialProviderForm,
          customerPaymentsEnabled: current.customerPaymentsEnabled,
          stripeMode: current.stripeMode,
          accountId: current.accountId,
        }));
      }

      setFeedback({
        type: "success",
        message: "Les reglages ont ete enregistres avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusSave = async (event) => {
    event.preventDefault();
    setSavingStatuses(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/reservations/statuses", {
        method: "PUT",
        body: {
          statuses: reservationStatuses.map((status, index) => ({
            code: status.code,
            label: status.label,
            color: status.color,
            position: index,
          })),
        },
      });
      setReservationStatuses(response.statuses || reservationStatuses);
      setFeedback({
        type: "success",
        message: "Les statuts personnalises ont ete enregistres avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingStatuses(false);
    }
  };

  const isPlatformMode = isSuperAdmin(user);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Paramètres</p>
            <h3>
              {isPlatformMode
                ? "Configuration des paiements de la plateforme."
                : "Configuration de vos encaissements clients."}
            </h3>
            <p>
              {isPlatformMode
                ? "Les informations de paiement restent sécurisées et uniquement visibles dans cet espace."
                : "Vos informations de paiement sont masquées, stockées côté serveur et réservées à votre espace."}
            </p>
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        {loading ? (
          <Panel title="Chargement des réglages" description="Préparation de la configuration de paiement.">
            <div className="empty-state">
              <strong>Lecture des réglages</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading && isPlatformMode ? (
          <Panel
            title="Paiements plateforme"
            description="Utilisé pour gérer les abonnements des prestataires."
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Cle publique</strong>
                <span className="muted-text">
                  {platformSettings?.stripePublishableKeyPreview || "Non configurée"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Cle secrete</strong>
                <span className="muted-text">
                  {platformSettings?.stripeSecretKeyPreview || "Non configurée"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Webhook secret</strong>
                <span className="muted-text">
                  {platformSettings?.stripeWebhookSecretPreview || "Non configuré"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Dernière mise à jour</strong>
                <span className="muted-text">
                  {platformSettings?.updatedBy || "Pas encore de mise à jour"}
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="platform-publishable">Clé publique Stripe</label>
                <input
                  id="platform-publishable"
                  value={platformForm.publishableKey}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      publishableKey: event.target.value,
                    }))
                  }
                  placeholder="pk_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-secret">Clé privée Stripe</label>
                <input
                  id="platform-secret"
                  type="password"
                  value={platformForm.secretKey}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      secretKey: event.target.value,
                    }))
                  }
                  placeholder="sk_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-webhook">Secret de notification</label>
                <input
                  id="platform-webhook"
                  type="password"
                  value={platformForm.webhookSecret}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      webhookSecret: event.target.value,
                    }))
                  }
                  placeholder="whsec_..."
                />
              </div>

              {["essential", "pro", "premium"].map((planId) => (
                <div key={planId} className="field">
                  <label htmlFor={`price-${planId}`}>Référence tarifaire {planId}</label>
                  <input
                    id={`price-${planId}`}
                    value={platformForm.priceIds[planId]}
                    onChange={(event) => updatePlatformPriceId(planId, event.target.value)}
                    placeholder="price_..."
                  />
                  <small className="muted-text">
                    Enregistré: {platformSettings?.subscriptionPriceIds?.[planId]?.preview || "non configuré"}
                  </small>
                </div>
              ))}

              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer la configuration de paiement"}
              </button>
            </form>
          </Panel>
        ) : null}

        {!loading && !isPlatformMode ? (
          <>
            <Panel
              title="Statuts réservations"
              description="Les 5 statuts restent simples, lisibles et personnalisables par prestataire."
            >
              <form className="form-grid" onSubmit={handleStatusSave}>
                <div className="card-list">
                  {reservationStatuses.map((status) => (
                    <article key={status.code} className="detail-card">
                      <div className="row-actions">
                        <strong>{status.code}</strong>
                        <StatusPill tone="neutral" color={status.color}>
                          {status.label}
                        </StatusPill>
                      </div>

                      <div className="form-grid two-columns">
                        <div className="field">
                          <label htmlFor={`status-label-${status.code}`}>Nom</label>
                          <input
                            id={`status-label-${status.code}`}
                            value={status.label}
                            onChange={(event) =>
                              updateReservationStatusForm(status.code, "label", event.target.value)
                            }
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`status-color-${status.code}`}>Couleur</label>
                          <input
                            id={`status-color-${status.code}`}
                            type="color"
                            value={status.color}
                            onChange={(event) =>
                              updateReservationStatusForm(status.code, "color", event.target.value)
                            }
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <button type="submit" className="button primary" disabled={savingStatuses}>
                  {savingStatuses ? "Enregistrement..." : "Enregistrer les statuts"}
                </button>
              </form>
            </Panel>

            <Panel
              title="Paiements clients"
              description="Connectez votre compte de paiement pour encaisser vos clients."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Encaissements clients</strong>
                  <StatusPill tone={providerSettings?.customerPaymentsEnabled ? "success" : "neutral"}>
                    {providerSettings?.customerPaymentsEnabled ? "Actifs" : "Désactivés"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Environnement</strong>
                  <span className="muted-text">
                    {formatStripeModeLabel(providerSettings?.customerStripeMode)}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Cle publique</strong>
                  <span className="muted-text">
                  {providerSettings?.customerStripePublishableKeyPreview || "Non configurée"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Cle secrete</strong>
                  <span className="muted-text">
                  {providerSettings?.customerStripeSecretKeyPreview || "Non configurée"}
                  </span>
                </article>
              </div>

              <form className="form-grid" onSubmit={handleSave}>
                <label className="detail-card">
                  <strong>Activer les paiements clients</strong>
                  <div className="row-actions">
                    <input
                      type="checkbox"
                      checked={providerForm.customerPaymentsEnabled}
                      onChange={(event) =>
                        setProviderForm((current) => ({
                          ...current,
                          customerPaymentsEnabled: event.target.checked,
                        }))
                      }
                    />
                    <span className="muted-text">
                      Active uniquement les paiements du prestataire courant.
                    </span>
                  </div>
                </label>

                <div className="field">
                  <label htmlFor="provider-mode">Environnement de paiement</label>
                  <select
                    id="provider-mode"
                    value={providerForm.stripeMode}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        stripeMode: event.target.value,
                      }))
                    }
                  >
                    <option value="test">Configuration</option>
                    <option value="live">Production</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="provider-account">Identifiant du compte Stripe</label>
                  <input
                    id="provider-account"
                    value={providerForm.accountId}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        accountId: event.target.value,
                      }))
                    }
                    placeholder="acct_..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="provider-publishable">Cle publique Stripe</label>
                  <input
                    id="provider-publishable"
                    value={providerForm.publishableKey}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        publishableKey: event.target.value,
                      }))
                    }
                    placeholder="pk_..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="provider-secret">Cle privee Stripe</label>
                  <input
                    id="provider-secret"
                    type="password"
                    value={providerForm.secretKey}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        secretKey: event.target.value,
                      }))
                    }
                    placeholder="sk_..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="provider-webhook">Secret de notification</label>
                  <input
                    id="provider-webhook"
                    type="password"
                    value={providerForm.webhookSecret}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        webhookSecret: event.target.value,
                      }))
                    }
                    placeholder="whsec_..."
                  />
                </div>

                <button type="submit" className="button primary" disabled={saving}>
                  {saving ? "Enregistrement..." : "Enregistrer la configuration de paiement"}
                </button>
              </form>
            </Panel>

            <Panel
              title="Préférences principales"
              description="Des activations simples pour la vitrine, les notifications et les exports."
            >
              <div className="card-list">
                {[
                  ["store_active", "Boutique en ligne", "Activer la vitrine client depuis votre espace."],
                  ["delivery_mode", "Mode livraisons", "Afficher les tournées et options logistiques."],
                  ["customer_notifications", "Notifications clients", "Préparer les messages de suivi et de rappel."],
                  ["accounting_export", "Export comptable", "Structurer un export compatible avec vos outils comptables."],
                ].map(([key, label, helper]) => (
                  <label key={key} className="detail-card">
                    <strong>{label}</strong>
                    <div className="row-actions">
                      <input
                        type="checkbox"
                        checked={localPreferences[key]}
                        onChange={() => togglePreference(key)}
                      />
                      <span className="muted-text">{helper}</span>
                    </div>
                  </label>
                ))}
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
