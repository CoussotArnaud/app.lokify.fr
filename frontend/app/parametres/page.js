"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import SegmentedTabs from "../../components/segmented-tabs";
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

const initialAccountForm = {
  full_name: "",
  first_name: "",
  last_name: "",
  phone: "",
};

const initialLocalPreferences = {
  store_active: true,
  delivery_mode: true,
  customer_notifications: true,
  accounting_export: false,
};

const formatStripeModeLabel = (value) =>
  String(value || "test").trim().toLowerCase() === "live" ? "Production" : "Configuration";

const superAdminSettingSections = [
  {
    id: "profile",
    label: "Mon compte",
    title: "Reglages de votre compte super admin.",
    description:
      "Modifiez ici le nom affiche dans le dashboard et les informations de contact de ce compte.",
  },
  {
    id: "platform-payments",
    label: "Paiements plateforme",
    title: "Configuration des paiements de la plateforme.",
    description:
      "Les informations Stripe de la plateforme restent securisees et uniquement visibles dans cet espace.",
  },
];

const providerSettingSections = [
  {
    id: "profile",
    label: "Mon compte",
    title: "Reglages de votre compte.",
    description:
      "Modifiez ici le nom affiche dans le dashboard et les coordonnees de contact de votre compte.",
  },
  {
    id: "statuses",
    label: "Statuts",
    title: "Statuts de reservations.",
    description:
      "Gardez des statuts simples, lisibles et personnalises pour votre organisation quotidienne.",
  },
  {
    id: "payments",
    label: "Paiements clients",
    title: "Configuration de vos encaissements clients.",
    description:
      "Vos informations de paiement sont masquees, stockees cote serveur et reservees a votre espace.",
  },
  {
    id: "preferences",
    label: "Preferences",
    title: "Preferences principales du dashboard.",
    description:
      "Retrouvez ici les activations rapides pour la vitrine, les notifications et les exports.",
  },
];

export default function SettingsPage() {
  const { user, replaceUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeSection, setActiveSection] = useState("profile");
  const [platformSettings, setPlatformSettings] = useState(null);
  const [providerSettings, setProviderSettings] = useState(null);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
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

    void loadSettings();
  }, [user?.id, user?.account_role]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setAccountForm({
      full_name: user.full_name || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
    });
  }, [user]);

  useEffect(() => {
    const validSectionIds = (isSuperAdmin(user)
      ? superAdminSettingSections
      : providerSettingSections
    ).map((section) => section.id);

    if (!validSectionIds.includes(activeSection)) {
      setActiveSection(validSectionIds[0] || "profile");
    }
  }, [activeSection, user]);

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

  const handleAccountSave = async (event) => {
    event.preventDefault();
    setSavingAccount(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/auth/me", {
        method: "PUT",
        body: accountForm,
      });
      replaceUser(response.user);
      setFeedback({
        type: "success",
        message: "Le profil du compte a ete mis a jour avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingAccount(false);
    }
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
  const settingSections = isPlatformMode ? superAdminSettingSections : providerSettingSections;
  const activeSectionConfig =
    settingSections.find((section) => section.id === activeSection) || settingSections[0];

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Parametres</p>
            <h3>{activeSectionConfig?.title}</h3>
            <p>{activeSectionConfig?.description}</p>
          </div>
        </div>

        <SegmentedTabs
          options={settingSections.map((section) => ({
            id: section.id,
            label: section.label,
          }))}
          value={activeSection}
          onChange={setActiveSection}
          size="sm"
          ariaLabel="Categories des reglages"
        />

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        {loading ? (
          <Panel title="Chargement des reglages" description="Preparation de votre espace de configuration.">
            <div className="empty-state">
              <strong>Lecture des reglages</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading ? (
          <Panel
            title="Mon compte"
            description={
              isPlatformMode
                ? "Ce nom est celui affiche en haut a droite du dashboard pour ce super admin."
                : "Ce nom est celui affiche en haut a droite du dashboard pour votre compte."
            }
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Nom affiche actuel</strong>
                <span className="muted-text">{user?.full_name || "Non configure"}</span>
              </article>
              <article className="detail-card">
                <strong>Email de connexion</strong>
                <span className="muted-text">{user?.email || "Non configure"}</span>
              </article>
              <article className="detail-card">
                <strong>Role</strong>
                <StatusPill tone={isPlatformMode ? "success" : "neutral"}>
                  {isPlatformMode ? "Super admin" : "Prestataire"}
                </StatusPill>
              </article>
              <article className="detail-card">
                <strong>Usage dashboard</strong>
                <span className="muted-text">
                  Le nom enregistre ici est reutilise dans le menu en haut a droite.
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleAccountSave}>
              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="account-full-name">Nom affiche</label>
                  <input
                    id="account-full-name"
                    value={accountForm.full_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        full_name: event.target.value,
                      }))
                    }
                    placeholder={isPlatformMode ? "Nom du super admin" : "Nom du compte"}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="account-phone">Telephone</label>
                  <input
                    id="account-phone"
                    type="tel"
                    value={accountForm.phone}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="06 12 34 56 78"
                  />
                </div>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="account-first-name">Prenom</label>
                  <input
                    id="account-first-name"
                    value={accountForm.first_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        first_name: event.target.value,
                      }))
                    }
                    placeholder="Prenom"
                  />
                </div>
                <div className="field">
                  <label htmlFor="account-last-name">Nom</label>
                  <input
                    id="account-last-name"
                    value={accountForm.last_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        last_name: event.target.value,
                      }))
                    }
                    placeholder="Nom"
                  />
                </div>
              </div>

              <button type="submit" className="button primary" disabled={savingAccount}>
                {savingAccount ? "Enregistrement..." : "Enregistrer mon profil"}
              </button>
            </form>
          </Panel>
        ) : null}

        {!loading && isPlatformMode && activeSection === "platform-payments" ? (
          <Panel
            title="Paiements plateforme"
            description="Utilise pour gerer les abonnements des prestataires."
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
                  placeholder="pk_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-secret">Cle privee Stripe</label>
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
                  <label htmlFor={`price-${planId}`}>Reference tarifaire {planId}</label>
                  <input
                    id={`price-${planId}`}
                    value={platformForm.priceIds[planId]}
                    onChange={(event) => updatePlatformPriceId(planId, event.target.value)}
                    placeholder="price_..."
                  />
                  <small className="muted-text">
                    Enregistre: {platformSettings?.subscriptionPriceIds?.[planId]?.preview || "non configure"}
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
            {activeSection === "statuses" ? (
              <Panel
                title="Statuts reservations"
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
            ) : null}

            {activeSection === "payments" ? (
              <Panel
                title="Paiements clients"
                description="Connectez votre compte de paiement pour encaisser vos clients."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Encaissements clients</strong>
                    <StatusPill tone={providerSettings?.customerPaymentsEnabled ? "success" : "neutral"}>
                      {providerSettings?.customerPaymentsEnabled ? "Actifs" : "Desactives"}
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
            ) : null}

            {activeSection === "preferences" ? (
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
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
