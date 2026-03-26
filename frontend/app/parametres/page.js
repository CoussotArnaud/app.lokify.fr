"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { isSuperAdmin } from "../../lib/access";

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

  const loadSettings = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (isSuperAdmin(user)) {
        const response = await apiRequest("/admin/stripe/settings");
        setPlatformSettings(response.stripeSettings);
      } else {
        const response = await apiRequest("/customer-payments/settings");
        setProviderSettings(response.customerPayments);
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

  const isPlatformMode = isSuperAdmin(user);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Parametres</p>
            <h3>
              {isPlatformMode
                ? "Configuration globale de paiement pour facturer les prestataires."
                : "Configuration Stripe isolee pour encaisser les clients du prestataire."}
            </h3>
            <p>
              {isPlatformMode
                ? "Les secrets Stripe super admin restent cote serveur et ne sont jamais visibles des prestataires."
                : "Vos cles Stripe sont masquees, stockees cote serveur et strictement reservees a votre espace."}
            </p>
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        {loading ? (
          <Panel title="Chargement des reglages" description="Preparation de la configuration de paiement.">
            <div className="empty-state">
              <strong>Lecture des reglages</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading && isPlatformMode ? (
          <Panel
            title="Stripe super admin"
            description="Utilise pour facturer les abonnements SaaS des prestataires."
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Cle publique</strong>
                <span className="muted-text">
                  {platformSettings?.stripePublishableKeyPreview || "Non configuree"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Cle secrete</strong>
                <span className="muted-text">
                  {platformSettings?.stripeSecretKeyPreview || "Non configuree"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Webhook secret</strong>
                <span className="muted-text">
                  {platformSettings?.stripeWebhookSecretPreview || "Non configure"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Derniere mise a jour</strong>
                <span className="muted-text">
                  {platformSettings?.updatedBy || "Pas encore de mise a jour"}
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="platform-publishable">Cle publique Stripe</label>
                <input
                  id="platform-publishable"
                  value={platformForm.publishableKey}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      publishableKey: event.target.value,
                    }))
                  }
                  placeholder="pk_test_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-secret">Cle secrete Stripe</label>
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
                  placeholder="sk_test_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-webhook">Webhook signing secret</label>
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
                  <label htmlFor={`price-${planId}`}>Price ID {planId}</label>
                  <input
                    id={`price-${planId}`}
                    value={platformForm.priceIds[planId]}
                    onChange={(event) => updatePlatformPriceId(planId, event.target.value)}
                    placeholder="price_..."
                  />
                  <small className="muted-text">
                    Actuel: {platformSettings?.subscriptionPriceIds?.[planId]?.preview || "non configure"}
                  </small>
                </div>
              ))}

              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer Stripe super admin"}
              </button>
            </form>
          </Panel>
        ) : null}

        {!loading && !isPlatformMode ? (
          <>
            <Panel
              title="Stripe prestataire"
              description="Vos encaissements clients sont totalement separes du Stripe super admin."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Encaissements clients</strong>
                  <StatusPill tone={providerSettings?.customerPaymentsEnabled ? "success" : "neutral"}>
                    {providerSettings?.customerPaymentsEnabled ? "Actifs" : "Desactives"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Mode</strong>
                  <span className="muted-text">{providerSettings?.customerStripeMode || "test"}</span>
                </article>
                <article className="detail-card">
                  <strong>Cle publique</strong>
                  <span className="muted-text">
                    {providerSettings?.customerStripePublishableKeyPreview || "Non configuree"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Cle secrete</strong>
                  <span className="muted-text">
                    {providerSettings?.customerStripeSecretKeyPreview || "Non configuree"}
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
                      Active uniquement le Stripe du prestataire courant.
                    </span>
                  </div>
                </label>

                <div className="field">
                  <label htmlFor="provider-mode">Mode Stripe</label>
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
                    <option value="test">Test</option>
                    <option value="live">Live</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="provider-account">Stripe account ID</label>
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
                    placeholder="pk_test_..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="provider-secret">Cle secrete Stripe</label>
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
                    placeholder="sk_test_..."
                  />
                </div>

                <div className="field">
                  <label htmlFor="provider-webhook">Webhook signing secret</label>
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
                  {saving ? "Enregistrement..." : "Enregistrer Stripe prestataire"}
                </button>
              </form>
            </Panel>

            <Panel
              title="Preferences principales"
              description="Des activations simples pour la vitrine, les notifications et les exports."
            >
              <div className="card-list">
                {[
                  ["store_active", "Boutique en ligne", "Activer la vitrine client depuis votre espace."],
                  ["delivery_mode", "Mode livraisons", "Afficher les tournees et options logistiques."],
                  ["customer_notifications", "Notifications clients", "Preparer les messages de suivi et de rappel."],
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
