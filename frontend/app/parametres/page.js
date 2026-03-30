"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { getWorkspaceUserLabel, isSuperAdmin } from "../../lib/access";
import { defaultReservationStatuses } from "../../lib/lokify-data";
import { buildStorefrontPath, buildStorefrontUrl } from "../../lib/storefront";

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

const initialStorefrontForm = {
  slug: "",
  is_published: false,
  reservation_approval_mode: "manual",
};

const initialAccountForm = {
  full_name: "",
  first_name: "",
  last_name: "",
  phone: "",
};

const initialLocalPreferences = {
  delivery_mode: true,
  customer_notifications: true,
  accounting_export: false,
};

const standardFrenchTaxRates = [
  { name: "TVA 20 %", rate: 20, defaultActive: true, helper: "Taux normal applique par defaut." },
  { name: "TVA 10 %", rate: 10, defaultActive: false, helper: "Taux reduit pour certaines prestations et locations." },
  { name: "TVA 5,5 %", rate: 5.5, defaultActive: false, helper: "Taux reduit specifique a certains cas autorises." },
  { name: "TVA 2,1 %", rate: 2.1, defaultActive: false, helper: "Taux tres specifique, a activer uniquement si necessaire." },
];

const buildTaxRateKey = (rate) => {
  const parsedRate = Number(rate);
  return Number.isFinite(parsedRate) ? parsedRate.toFixed(2) : "";
};

const formatStripeModeLabel = (value) =>
  String(value || "test").trim().toLowerCase() === "live" ? "Production" : "Configuration";

const roleLabelByAccount = {
  super_admin: "Super admin",
  provider: "Prestataire",
};

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
    id: "storefront",
    label: "Boutique en ligne",
    title: "Reglages de la boutique en ligne.",
    description:
      "Gerez ici le lien public, l'activation et la validation des reservations en ligne.",
  },
  {
    id: "payments",
    label: "Paiements clients",
    title: "Configuration de vos encaissements clients.",
    description:
      "Vos informations de paiement sont masquees, stockees cote serveur et reservees a votre espace.",
  },
  {
    id: "taxes",
    label: "TVA",
    title: "Configuration de la TVA catalogue.",
    description:
      "Configurez uniquement les taux utiles a votre catalogue, puis definissez votre TVA par defaut.",
  },
  {
    id: "statuses",
    label: "Statuts",
    title: "Statuts de reservations.",
    description:
      "Gardez des statuts simples, lisibles et personnalises pour votre organisation quotidienne.",
  },
  {
    id: "preferences",
    label: "Preferences",
    title: "Preferences du dashboard.",
    description:
      "Retrouvez ici les activations rapides utiles a votre organisation quotidienne.",
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
  const [storefrontSettings, setStorefrontSettings] = useState(null);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [platformForm, setPlatformForm] = useState(initialPlatformForm);
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [storefrontForm, setStorefrontForm] = useState(initialStorefrontForm);
  const [localPreferences, setLocalPreferences] = useState(initialLocalPreferences);
  const [reservationStatuses, setReservationStatuses] = useState(defaultReservationStatuses);
  const [savingStatuses, setSavingStatuses] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [savingTaxRate, setSavingTaxRate] = useState(false);
  const [savingStorefront, setSavingStorefront] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (isSuperAdmin(user)) {
        const response = await apiRequest("/admin/stripe/settings");
        setPlatformSettings(response.stripeSettings);
      } else {
        const [response, statusesResponse, taxRatesResponse, storefrontResponse] = await Promise.all([
          apiRequest("/customer-payments/settings"),
          apiRequest("/reservations/statuses"),
          apiRequest("/catalog/tax-rates").catch(() => ({ taxRates: [] })),
          apiRequest("/storefront/settings"),
        ]);
        setProviderSettings(response.customerPayments);
        setReservationStatuses(statusesResponse.statuses || defaultReservationStatuses);
        setTaxRates(taxRatesResponse.taxRates || []);
        setStorefrontSettings(storefrontResponse.storefrontSettings);
        setProviderForm((current) => ({
          ...current,
          customerPaymentsEnabled: Boolean(response.customerPayments?.customerPaymentsEnabled),
          stripeMode: response.customerPayments?.customerStripeMode || "test",
          accountId: response.customerPayments?.customerStripeAccountId || "",
        }));
        setStorefrontForm({
          slug: storefrontResponse.storefrontSettings?.slug || "",
          is_published: Boolean(storefrontResponse.storefrontSettings?.is_published),
          reservation_approval_mode:
            storefrontResponse.storefrontSettings?.reservation_approval_mode || "manual",
        });
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
      setActiveSection("profile");
    }
  }, [activeSection, user]);

  const updatePlatformPriceId = (planId, value) => {
    setPlatformForm((current) => ({
      ...current,
      priceIds: {
        ...current.priceIds,
        [planId]: value,
      },
    }));
  };

  const togglePreference = (key) => {
    setLocalPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const managedTaxRates = standardFrenchTaxRates.map((taxRateDefinition) => {
    const matchingTaxRate = taxRates.find(
      (entry) => buildTaxRateKey(entry.rate) === buildTaxRateKey(taxRateDefinition.rate)
    );

    return {
      ...taxRateDefinition,
      id: matchingTaxRate?.id || "",
      is_active:
        matchingTaxRate?.is_active === undefined
          ? taxRateDefinition.defaultActive
          : Boolean(matchingTaxRate.is_active),
      is_default: Number(taxRateDefinition.rate) === 20,
    };
  });

  const updateReservationStatusForm = (code, field, value) => {
    setReservationStatuses((current) =>
      current.map((status) => (status.code === code ? { ...status, [field]: value } : status))
    );
  };

  const handleTaxRateToggle = async (taxRateDefinition) => {
    const matchingTaxRate = taxRates.find(
      (entry) => buildTaxRateKey(entry.rate) === buildTaxRateKey(taxRateDefinition.rate)
    );

    setSavingTaxRate(true);
    setFeedback(null);

    try {
      const response = await apiRequest(
        matchingTaxRate ? `/catalog/tax-rates/${matchingTaxRate.id}` : "/catalog/tax-rates",
        {
          method: matchingTaxRate ? "PUT" : "POST",
          body: {
            name: taxRateDefinition.name,
            rate: Number(taxRateDefinition.rate || 0),
            is_active: !taxRateDefinition.is_active,
            is_default: Number(taxRateDefinition.rate) === 20,
          },
        }
      );
      const savedTaxRate = response.taxRate;
      setTaxRates((current) =>
        [...current.filter((entry) => entry.id !== savedTaxRate.id), savedTaxRate].sort(
          (left, right) => Number(left.rate || 0) - Number(right.rate || 0)
        )
      );
      setFeedback({
        type: "success",
        message: "La configuration TVA a ete mise a jour.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingTaxRate(false);
    }
  };

  const handleAccountSave = async (event) => {
    event.preventDefault();
    setSavingAccount(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/auth/me", {
        method: "PUT",
        body: {
          ...accountForm,
        },
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

  const handleStorefrontSave = async (event) => {
    event.preventDefault();
    setSavingStorefront(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/storefront/settings", {
        method: "PUT",
        body: storefrontForm,
      });

      setStorefrontSettings(response.storefrontSettings);
      setStorefrontForm({
        slug: response.storefrontSettings?.slug || "",
        is_published: Boolean(response.storefrontSettings?.is_published),
        reservation_approval_mode:
          response.storefrontSettings?.reservation_approval_mode || "manual",
      });
      setFeedback({
        type: "success",
        message: "Les reglages de la boutique en ligne ont ete enregistres.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingStorefront(false);
    }
  };

  const handleCopyStorefrontLink = async () => {
    if (!storefrontForm.slug) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        buildStorefrontUrl(storefrontForm.slug, window.location.origin)
      );
      setFeedback({
        type: "success",
        message: "Le lien public de votre boutique en ligne a ete copie.",
      });
    } catch (_error) {
      setFeedback({
        type: "error",
        message: "Impossible de copier le lien public pour le moment.",
      });
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
  const currentWorkspaceUserLabel = getWorkspaceUserLabel(user, "Non configure");
  const settingSections = isPlatformMode ? superAdminSettingSections : providerSettingSections;
  const activeSectionConfig =
    settingSections.find((section) => section.id === activeSection) || settingSections[0];
  const storefrontPath = storefrontForm.slug ? buildStorefrontPath(storefrontForm.slug) : "";

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Paramètres</p>
            <h3>{activeSectionConfig?.title}</h3>
            <p>
              {isPlatformMode
                ? "Les informations de paiement restent sécurisées et uniquement visibles dans cet espace."
                : "Vos informations de paiement sont masquées, stockées côté serveur et réservées à votre espace."}
            </p>
          </div>
        </div>

        <div className="settings-category-strip" aria-label="Categories des reglages">
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

        {!loading && activeSection === "profile" ? (
          <Panel
            title="Mon compte"
            description={
              isPlatformMode
                ? "Le super admin s'affiche toujours comme Super Admin dans le dashboard. Les informations ci-dessous restent liees au compte."
                : "Ce nom est celui affiche en haut a droite du dashboard pour votre compte."
            }
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Libelle actuellement affiche</strong>
                <span className="muted-text">{currentWorkspaceUserLabel}</span>
              </article>
              <article className="detail-card">
                <strong>Email de connexion</strong>
                <span className="muted-text">{user?.email || "Non configure"}</span>
              </article>
              <article className="detail-card">
                <strong>Role</strong>
                <StatusPill tone={isPlatformMode ? "success" : "neutral"}>
                  {roleLabelByAccount[user?.account_role] || "Compte"}
                </StatusPill>
              </article>
              <article className="detail-card">
                <strong>Usage dashboard</strong>
                <span className="muted-text">
                  {isPlatformMode
                    ? 'Le menu du super admin affiche toujours "Super Admin".'
                    : "Le nom enregistre ici est reutilise dans le menu en haut a droite."}
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleAccountSave}>
              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="account-full-name">
                    {isPlatformMode ? "Nom interne du compte" : "Nom affiche"}
                  </label>
                  <input
                    id="account-full-name"
                    value={accountForm.full_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        full_name: event.target.value,
                      }))
                    }
                    placeholder={isPlatformMode ? "Nom interne du super admin" : "Nom du compte"}
                    required
                  />
                  <p className="field-hint">
                    {isPlatformMode
                      ? 'Ce champ reste stocke sur le compte, mais le dashboard super admin affiche toujours "Super Admin".'
                      : "C&apos;est ce texte qui apparait dans le dashboard et dans le menu utilisateur."}
                  </p>
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

              <div className="detail-card">
                <strong>Organisation</strong>
                <p className="muted-text">
                  {isPlatformMode
                    ? 'Le compte conserve ses informations internes, mais l\'interface super admin affiche toujours "Super Admin".'
                    : "Chaque compte peut definir son propre nom affiche ici."}
                </p>
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
            {activeSection === "taxes" ? (
              <Panel
                title="TVA"
                description="Activez uniquement les TVA francaises que vous utilisez. La TVA 20 % reste la valeur par defaut du catalogue."
              >
              <div className="card-list">
                {managedTaxRates.map((taxRate) => (
                  <article key={taxRate.rate} className="detail-card">
                    <div className="row-actions">
                      <div>
                        <strong>{taxRate.name}</strong>
                        <p className="muted-text">{taxRate.helper}</p>
                      </div>
                      <StatusPill tone={taxRate.is_active ? "success" : "neutral"}>
                        {taxRate.is_active ? "Active" : "Inactive"}
                      </StatusPill>
                    </div>

                    <div className="row-actions">
                      <span className="muted-text">
                        {taxRate.is_default ? "TVA par defaut" : "TVA optionnelle"}
                      </span>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => void handleTaxRateToggle(taxRate)}
                        disabled={savingTaxRate}
                      >
                        {taxRate.is_active ? "Desactiver" : "Activer"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              </Panel>
            ) : null}

            {activeSection === "statuses" ? (
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
            ) : null}

            {activeSection === "storefront" ? (
            <Panel
              title="Boutique en ligne"
              description="Gerez ici le lien public, l'activation et le mode de validation des reservations en ligne."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Statut</strong>
                  <StatusPill tone={storefrontSettings?.is_published ? "success" : "neutral"}>
                    {storefrontSettings?.is_published ? "Publiee" : "Non publiee"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Slug public</strong>
                  <span className="muted-text">
                    {storefrontSettings?.slug || "Aucun slug disponible"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Validation</strong>
                  <span className="muted-text">
                    {storefrontSettings?.reservation_approval_mode === "automatic"
                      ? "Automatique"
                      : "Manuelle"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Lien public</strong>
                  <span className="muted-text">{storefrontPath || "Indisponible"}</span>
                </article>
              </div>

              <form className="form-grid" onSubmit={handleStorefrontSave}>
                <div className="field">
                  <label htmlFor="storefront-slug">Slug boutique</label>
                  <input
                    id="storefront-slug"
                    value={storefrontForm.slug}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                    placeholder="ma-boutique"
                  />
                  <p className="field-hint">
                    URL publique: {storefrontPath || "/shop/votre-slug"}. Le slug est normalise,
                    unique et un changement de slug est limite dans le temps.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="storefront-approval-mode">Validation des reservations</label>
                  <select
                    id="storefront-approval-mode"
                    value={storefrontForm.reservation_approval_mode}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        reservation_approval_mode: event.target.value,
                      }))
                    }
                  >
                    <option value="manual">Manuelle</option>
                    <option value="automatic">Automatique</option>
                  </select>
                  <p className="field-hint">
                    En mode automatique, les reservations publiques passent directement en confirme.
                    En mode manuel, elles restent en attente de confirmation.
                  </p>
                </div>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={storefrontForm.is_published}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        is_published: event.target.checked,
                      }))
                    }
                  />
                  <span>Activer la boutique en ligne</span>
                </label>

                <div className="row-actions">
                  <button type="submit" className="button primary" disabled={savingStorefront}>
                    {savingStorefront ? "Enregistrement..." : "Enregistrer la boutique en ligne"}
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => void handleCopyStorefrontLink()}
                    disabled={!storefrontForm.slug}
                  >
                    Copier le lien
                  </button>
                  {storefrontPath ? (
                    <Link href={storefrontPath} className="button secondary" target="_blank">
                      Voir ma boutique en ligne
                    </Link>
                  ) : null}
                </div>
              </form>
            </Panel>
            ) : null}

            {activeSection === "preferences" ? (
            <Panel
              title="Preferences"
              description="Activez uniquement les options utiles a votre organisation."
            >
              <div className="card-list">
                {[
                  ["delivery_mode", "Mode de livraison", "Afficher les tournees et options logistiques."],
                  ["customer_notifications", "Notification client", "Preparer les messages de suivi et de rappel."],
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
