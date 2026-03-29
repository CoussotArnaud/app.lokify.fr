"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { canAccessOperationalModules, getWorkspaceHomePath } from "../../lib/access";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/date";
import { getSubscriptionStatusMeta } from "../../lib/provider-admin";

const formatDateValue = (value) => (value ? formatDate(value) : "À définir");
const formatDateTimeValue = (value) => (value ? formatDateTime(value) : "À définir");
const formatIntervalLabel = (interval) => (interval === "month" ? "mois" : interval);

const saasLifecycleMeta = {
  inactive: { label: "Inactif", tone: "neutral" },
  active: { label: "Actif", tone: "success" },
  pending: { label: "En attente", tone: "info" },
};

const planCopyById = {
  essential: "L'essentiel pour lancer votre activité.",
  pro: "Une formule complète pour piloter au quotidien.",
  premium: "L'offre la plus complète pour accompagner votre croissance.",
};

const buildSubscriptionLeadDraft = (profile, plan) => ({
  planId: plan?.id || "",
  firstName: profile?.first_name || "",
  lastName: profile?.last_name || "",
  company: profile?.company_name || profile?.full_name || "",
  email: profile?.email || "",
  phone: profile?.phone || "",
  message: plan ? `Bonjour, je souhaite être recontacté pour la formule ${plan.name}.` : "",
});

const getPlanActionLabel = ({
  isCurrentPlan,
  isCurrentPlanActive,
  isRequestedPlan,
  hasCurrentPlan,
}) => {
  if (isCurrentPlanActive) {
    return "Formule actuelle";
  }

  if (isRequestedPlan) {
    return "Demande envoyée";
  }

  if (!hasCurrentPlan) {
    return "Choisir la formule";
  }

  if (isCurrentPlan) {
    return "Demander l'activation";
  }

  return "Demander le changement";
};

const getPlanShortCopy = (plan) => planCopyById[plan?.id] || plan?.description || "";

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [contactForm, setContactForm] = useState(null);
  const [submittingContact, setSubmittingContact] = useState(false);

  const loadBillingState = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await apiRequest("/lokify-billing/overview");
      setOverview(response);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadBillingState();
  }, []);

  const currentUser = overview?.currentUser || user;
  const lokifySubscription = overview?.lokifySubscription || currentUser?.lokifyBilling || {};
  const plans = overview?.plans || [];
  const planChangeRequest = lokifySubscription.planChangeRequest || null;
  const history = lokifySubscription.history || [];
  const currentPlanId = lokifySubscription.lokifyPlanId || "";
  const hasChosenPlan = Boolean(currentPlanId);
  const currentPlan = plans.find((plan) => plan.id === currentPlanId) || null;
  const currentSubscriptionStatus = String(
    lokifySubscription.lokifySubscriptionStatus || "inactive"
  ).toLowerCase();
  const lifecycleMeta =
    saasLifecycleMeta[String(lokifySubscription.saasLifecycleStatus || "inactive").toLowerCase()] ||
    saasLifecycleMeta.inactive;
  const subscriptionMeta = getSubscriptionStatusMeta(
    lokifySubscription.lokifySubscriptionStatus
  );
  const hasOperationalAccess = canAccessOperationalModules(currentUser);
  const currentPlanLabel = lokifySubscription.lokifyPlanName || "Aucune formule";
  const currentPlanPriceLabel = currentPlan
    ? `${formatCurrency(currentPlan.price)} / ${formatIntervalLabel(currentPlan.interval)}`
    : lokifySubscription.lokifyPlanName
      ? "Formule en place"
      : "Activation requise";
  const pendingRequestPriceLabel = planChangeRequest
    ? planChangeRequest.requestedPlanPrice === null
      ? "Tarif à définir"
      : `${formatCurrency(planChangeRequest.requestedPlanPrice)} / ${formatIntervalLabel(
          planChangeRequest.requestedPlanInterval
        )}`
    : "";

  const subscriptionCards = [
    {
      id: "plan",
      label: "Formule",
      type: "value",
      value: currentPlanLabel,
      helper: currentPlanPriceLabel,
    },
    {
      id: "account",
      label: "Compte",
      type: "status",
      value: lifecycleMeta.label,
      tone: lifecycleMeta.tone,
      helper: "Statut du compte",
    },
    {
      id: "subscription",
      label: "Abonnement",
      type: "status",
      value: subscriptionMeta.label,
      tone: subscriptionMeta.tone,
      helper: lokifySubscription.lokifySubscriptionEndAt
        ? `Échéance ${formatDateValue(lokifySubscription.lokifySubscriptionEndAt)}`
        : "Facturation à définir",
    },
    {
      id: "software",
      label: "Logiciel",
      type: "status",
      value: hasOperationalAccess ? "Actif" : "Verrouillé",
      tone: hasOperationalAccess ? "success" : "warning",
      helper: hasOperationalAccess ? "Modules ouverts" : "Activation requise",
    },
  ];

  const subscriptionDetails = [
    {
      id: "start",
      label: "Début de période",
      value: formatDateValue(lokifySubscription.lokifySubscriptionStartAt),
    },
    {
      id: "end",
      label: "Prochaine échéance",
      value: formatDateValue(lokifySubscription.lokifySubscriptionEndAt),
    },
    {
      id: "activation",
      label: "Activation",
      value: "Mise en place accompagnée",
    },
    {
      id: "support",
      label: "Support",
      value: "Ticket créé à chaque demande",
    },
  ];

  const activationSteps = [
    {
      id: "choose",
      label: "1. Choix",
      value: "Sélectionnez la formule adaptée.",
    },
    {
      id: "request",
      label: "2. Demande",
      value: "Envoyez vos coordonnées depuis le compte.",
    },
    {
      id: "followup",
      label: "3. Finalisation",
      value: "Lokify vous recontacte pour activer l'abonnement.",
    },
  ];

  const openContactModal = (plan) => {
    setSelectedPlan(plan);
    setContactForm(buildSubscriptionLeadDraft(currentUser, plan));
    setFeedback(null);
    setContactModalOpen(true);
  };

  const closeContactModal = (force = false) => {
    if (submittingContact && !force) {
      return;
    }

    setContactModalOpen(false);
    setSelectedPlan(null);
    setContactForm(null);
  };

  const handleContactFieldChange = (field, value) => {
    setContactForm((current) => ({
      ...(current || {}),
      [field]: value,
    }));
  };

  const handleContactRequest = async (event) => {
    event.preventDefault();

    if (!selectedPlan || !contactForm) {
      return;
    }

    setSubmittingContact(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/lokify-billing/contact-request", {
        method: "POST",
        body: {
          planId: selectedPlan.id,
          ...contactForm,
        },
      });

      await refreshUser();
      await loadBillingState({ silent: true });
      setFeedback({
        type: "success",
        message: `Votre demande pour la formule ${response.requestedPlan.name} a été envoyée. L'équipe Lokify vous recontacte pour finaliser l'activation.`,
      });
      closeContactModal(true);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmittingContact(false);
    }
  };

  return (
    <AppShell>
      <div className="billing-page">
        <div className="page-stack billing-page-stack">
          <div className="page-header">
            <div>
              <p className="eyebrow">Facturation / abonnement</p>
              <h3>Votre abonnement Lokify.</h3>
              <p>
                Comparez les formules, choisissez la plus adaptée et suivez l&apos;activation sans
                confusion.
              </p>
            </div>
            <div className="page-header-actions">
              {hasOperationalAccess ? (
                <Link href={getWorkspaceHomePath(currentUser)} className="button ghost">
                  Retour au logiciel
                </Link>
              ) : null}
              <Link href="/support" className="button ghost">
                Contacter le support
              </Link>
            </div>
          </div>

          {feedback ? (
            <p className={`feedback ${feedback.type || "error"}`}>{feedback.message}</p>
          ) : null}

          {loading ? (
            <Panel
              className="billing-section"
              title="Chargement de l'abonnement"
              description="Préparation de votre espace de facturation."
            >
              <div className="empty-state billing-empty-state">
                <strong>Chargement en cours</strong>
                <span>Les informations d&apos;abonnement arrivent dans quelques instants.</span>
              </div>
            </Panel>
          ) : (
            <>
              <Panel
                className="billing-section"
                title={hasChosenPlan ? "Changer ou faire évoluer votre formule" : "Choisissez votre formule"}
                description={
                  hasChosenPlan
                    ? "Comparez les offres et demandez l'activation ou l'évolution de votre abonnement."
                    : "Choisissez d'abord votre formule. Une fois votre demande envoyée, Lokify vous recontacte pour finaliser l'activation."
                }
              >
                {!hasChosenPlan ? (
                  <div className="billing-offer-intro">
                    <article className="billing-inline-card billing-inline-card-accent">
                      <div>
                        <span className="billing-micro-label">Nouveau compte</span>
                        <strong>Aucun abonnement actif pour le moment</strong>
                        <p>Commencez par choisir la formule qui correspond à votre activité ci-dessous.</p>
                      </div>
                    </article>
                  </div>
                ) : null}

                <div className="billing-inline-grid">
                  <article className="billing-inline-card">
                    <div>
                      <span className="billing-micro-label">Activation guidée</span>
                      <strong>Choix, demande, rappel Lokify</strong>
                      <p>Notre équipe vous accompagne pour finaliser l'activation de la formule choisie.</p>
                    </div>
                  </article>

                  {planChangeRequest ? (
                    <article className="billing-inline-card billing-inline-card-accent">
                      <div>
                        <span className="billing-micro-label">Demande en cours</span>
                        <strong>
                          {planChangeRequest.requestedPlanName || "Formule à confirmer"}
                        </strong>
                        <p>Envoyée le {formatDateTimeValue(planChangeRequest.requestedAt)}.</p>
                      </div>
                      <span className="billing-inline-meta">{pendingRequestPriceLabel}</span>
                    </article>
                  ) : (
                    <article className="billing-inline-card billing-inline-card-soft">
                      <div>
                        <span className="billing-micro-label">Support</span>
                        <strong>Accompagnement dédié</strong>
                        <p>Une demande d'abonnement crée automatiquement un suivi support.</p>
                      </div>
                    </article>
                  )}
                </div>

                <details className="billing-accordion">
                  <summary>Voir le parcours d'activation</summary>
                  <div className="billing-step-grid">
                    {activationSteps.map((step) => (
                      <article key={step.id} className="billing-step-card">
                        <span className="billing-micro-label">{step.label}</span>
                        <strong>{step.value}</strong>
                      </article>
                    ))}
                  </div>
                </details>

                <div className="billing-plan-grid">
                  {plans.map((plan) => {
                    const isCurrentPlan = currentPlanId === plan.id;
                    const isCurrentPlanActive =
                      isCurrentPlan && ["active", "trial"].includes(currentSubscriptionStatus);
                    const isRequestedPlan = planChangeRequest?.requestedPlanId === plan.id;
                    const isFeaturedPlan = !hasChosenPlan && plan.id === "pro";
                    const previewHighlights = (plan.highlights || []).slice(0, 2);
                    const extraHighlights = Math.max((plan.highlights || []).length - 2, 0);
                    const buttonLabel = getPlanActionLabel({
                      isCurrentPlan,
                      isCurrentPlanActive,
                      isRequestedPlan,
                      hasCurrentPlan: Boolean(currentPlanId),
                    });

                    return (
                      <article
                        key={plan.id}
                        className={`billing-plan-card ${
                          isCurrentPlan ? "is-current" : ""
                        } ${isRequestedPlan ? "is-requested" : ""} ${
                          isFeaturedPlan ? "is-featured" : ""
                        }`.trim()}
                      >
                        <div className="billing-plan-head">
                          <div>
                            <span className="billing-micro-label">Formule</span>
                            <strong>{plan.name}</strong>
                          </div>
                          {isCurrentPlanActive ? (
                            <StatusPill tone="success">Active</StatusPill>
                          ) : isRequestedPlan ? (
                            <StatusPill tone="info">En cours</StatusPill>
                          ) : isFeaturedPlan ? (
                            <StatusPill tone="warning">Recommandée</StatusPill>
                          ) : null}
                        </div>

                        <div className="billing-plan-price">
                          <strong>{formatCurrency(plan.price)}</strong>
                          <span>/ {formatIntervalLabel(plan.interval)}</span>
                        </div>

                        <p className="billing-plan-copy">{getPlanShortCopy(plan)}</p>

                        <div className="billing-plan-tags">
                          {previewHighlights.map((highlight) => (
                            <span key={highlight} className="billing-feature-chip">
                              {highlight}
                            </span>
                          ))}
                          {extraHighlights ? (
                            <span className="billing-feature-chip billing-feature-chip-muted">
                              +{extraHighlights}
                            </span>
                          ) : null}
                        </div>

                        {(plan.highlights || []).length ? (
                          <details className="billing-accordion billing-plan-accordion">
                            <summary>Voir les points inclus</summary>
                            <div className="billing-plan-detail-list">
                              {(plan.highlights || []).map((highlight) => (
                                <span key={highlight} className="billing-feature-chip">
                                  {highlight}
                                </span>
                              ))}
                            </div>
                          </details>
                        ) : null}

                        <button
                          type="button"
                          className={`button ${isCurrentPlanActive ? "ghost" : "primary"}`}
                          onClick={() => openContactModal(plan)}
                          disabled={isCurrentPlanActive || isRequestedPlan}
                        >
                          {buttonLabel}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </Panel>

              {hasChosenPlan ? (
                <Panel
                  className="billing-section"
                  title="Votre abonnement"
                  description="L'essentiel sur votre formule actuelle et l'accès au logiciel."
                >
                  <div className="billing-status-grid">
                    {subscriptionCards.map((card) => (
                      <article key={card.id} className="billing-status-card">
                        <span className="billing-micro-label">{card.label}</span>
                        {card.type === "status" ? (
                          <StatusPill tone={card.tone}>{card.value}</StatusPill>
                        ) : (
                          <strong>{card.value}</strong>
                        )}
                        <small>{card.helper}</small>
                      </article>
                    ))}
                  </div>

                  {!hasOperationalAccess ? (
                    <div className="billing-inline-card billing-inline-card-soft">
                      <div>
                        <span className="billing-micro-label">Accès logiciel</span>
                        <strong>Compte en attente</strong>
                        <p>Les modules restent verrouillés jusqu'à l'activation de la formule.</p>
                      </div>
                    </div>
                  ) : null}

                  <details className="billing-accordion">
                    <summary>Voir les détails</summary>
                    <div className="billing-detail-grid">
                      {subscriptionDetails.map((detail) => (
                        <article key={detail.id} className="billing-detail-card">
                          <span className="billing-micro-label">{detail.label}</span>
                          <strong>{detail.value}</strong>
                        </article>
                      ))}
                    </div>
                  </details>
                </Panel>
              ) : null}

              <Panel
                className="billing-section"
                title="Historique"
                description="Les derniers jalons utiles."
              >
                {history.length ? (
                  <div className="billing-history-list">
                    {history.map((item) => (
                      <details key={item.id} className="billing-history-item">
                        <summary>
                          <div className="billing-history-head">
                            <strong>{item.label}</strong>
                            <span>{formatDateTimeValue(item.at)}</span>
                          </div>
                        </summary>
                        <p className="muted-text">{item.description}</p>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state billing-empty-state">
                    <strong>Aucun jalon disponible</strong>
                    <span>L'historique se remplira au fil des activations et des changements.</span>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>

        <ModalShell
          open={contactModalOpen}
          title={
            selectedPlan
              ? `Demande de mise en place - ${selectedPlan.name}`
              : "Demande de mise en place"
          }
          description="Laissez vos coordonnées pour être recontacté rapidement."
          size="lg"
          onClose={closeContactModal}
          footer={
            <>
              <button
                type="button"
                className="button ghost"
                onClick={closeContactModal}
                disabled={submittingContact}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="button primary"
                form="lokify-subscription-contact-form"
                disabled={submittingContact}
              >
                {submittingContact ? "Envoi..." : "Être recontacté"}
              </button>
            </>
          }
        >
          {selectedPlan && contactForm ? (
            <form
              id="lokify-subscription-contact-form"
              className="form-grid"
              onSubmit={handleContactRequest}
            >
              <div className="subscription-contact-summary">
                <div>
                  <span className="eyebrow">Formule choisie</span>
                  <strong>{selectedPlan.name}</strong>
                  <p>
                    {formatCurrency(selectedPlan.price)} / {formatIntervalLabel(selectedPlan.interval)}
                  </p>
                </div>
                <p className="muted-text">{getPlanShortCopy(selectedPlan)}</p>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="subscription-contact-first-name">Prénom</label>
                  <input
                    id="subscription-contact-first-name"
                    value={contactForm.firstName}
                    onChange={(event) =>
                      handleContactFieldChange("firstName", event.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subscription-contact-last-name">Nom</label>
                  <input
                    id="subscription-contact-last-name"
                    value={contactForm.lastName}
                    onChange={(event) =>
                      handleContactFieldChange("lastName", event.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subscription-contact-company">Société</label>
                  <input
                    id="subscription-contact-company"
                    value={contactForm.company}
                    onChange={(event) =>
                      handleContactFieldChange("company", event.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subscription-contact-email">E-mail</label>
                  <input
                    id="subscription-contact-email"
                    type="email"
                    value={contactForm.email}
                    onChange={(event) => handleContactFieldChange("email", event.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subscription-contact-phone">Téléphone</label>
                  <input
                    id="subscription-contact-phone"
                    value={contactForm.phone}
                    onChange={(event) => handleContactFieldChange("phone", event.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="subscription-contact-plan">Formule choisie</label>
                  <input
                    id="subscription-contact-plan"
                    value={selectedPlan.name}
                    disabled
                    aria-disabled="true"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="subscription-contact-message">Message complémentaire</label>
                <textarea
                  id="subscription-contact-message"
                  value={contactForm.message}
                  onChange={(event) => handleContactFieldChange("message", event.target.value)}
                  placeholder="Précisez vos besoins ou vos questions."
                />
              </div>
            </form>
          ) : null}
        </ModalShell>

        <style jsx global>{`
          .billing-page {
            display: grid;
            gap: 1.8rem;
          }

          .billing-page .billing-page-stack {
            gap: 1.8rem;
          }

          .billing-page .page-header {
            align-items: flex-end;
            gap: 1.8rem;
          }

          .billing-page .page-header > :first-child {
            flex: 1 1 auto;
            min-width: 0;
          }

          .billing-page .page-header h3 {
            max-width: none;
            font-size: clamp(1.75rem, 2vw, 2.3rem);
            letter-spacing: -0.03em;
          }

          .billing-page .page-header p {
            max-width: none;
            margin-top: 0.35rem;
          }

          .billing-page .page-header-actions {
            align-items: center;
            gap: 0.7rem;
          }

          @media (min-width: 1200px) {
            .billing-page .page-header h3,
            .billing-page .page-header p {
              white-space: nowrap;
            }
          }

          .billing-page .billing-section {
            border: 1px solid rgba(23, 31, 59, 0.06);
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.88);
            box-shadow: 0 18px 44px rgba(23, 31, 59, 0.05);
          }

          .billing-page .billing-section .panel-header,
          .billing-page .billing-section .panel-footer {
            padding: 1.2rem 1.25rem 0;
          }

          .billing-page .billing-section .panel-body {
            padding: 1rem 1.25rem 1.25rem;
            display: grid;
            gap: 1rem;
          }

          .billing-page .billing-section .panel-header h3 {
            font-size: 1.02rem;
            letter-spacing: -0.01em;
          }

          .billing-page .billing-section .panel-header p {
            max-width: 52ch;
            margin-top: 0.18rem;
            font-size: 0.9rem;
            line-height: 1.5;
          }

          .billing-page .feedback {
            margin: 0;
            border-radius: 16px;
            padding: 0.85rem 0.95rem;
          }

          .billing-page .button {
            min-height: 38px;
            padding: 0.52rem 0.82rem;
            border-radius: 12px;
            font-size: 0.84rem;
            box-shadow: none;
          }

          .billing-page .button.primary {
            color: #ffffff;
            background: linear-gradient(135deg, var(--accent-strong), var(--accent));
            box-shadow: 0 10px 24px rgba(107, 46, 130, 0.18);
          }

          .billing-page .button.ghost {
            color: var(--text);
            background: transparent;
            border-color: rgba(23, 31, 59, 0.12);
          }

          .billing-page .button:hover {
            transform: translateY(-1px);
          }
          .billing-page .status-pill {
            min-height: 24px;
            padding: 0.16rem 0.5rem;
            border: 1px solid transparent;
            border-radius: 999px;
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 0.01em;
          }

          .billing-page .billing-status-grid,
          .billing-page .billing-plan-grid,
          .billing-page .billing-detail-grid,
          .billing-page .billing-step-grid {
            display: grid;
            gap: 0.85rem;
          }

          .billing-page .billing-status-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }

          .billing-page .billing-detail-grid,
          .billing-page .billing-step-grid {
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          }

          .billing-page .billing-plan-grid {
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1rem;
          }

          .billing-page .billing-status-card,
          .billing-page .billing-detail-card,
          .billing-page .billing-step-card,
          .billing-page .billing-inline-card,
          .billing-page .billing-plan-card,
          .billing-page .billing-history-item {
            border: 1px solid rgba(23, 31, 59, 0.08);
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 8px 18px rgba(23, 31, 59, 0.03);
            transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease,
              background 0.18s ease;
          }

          .billing-page .billing-status-card:hover,
          .billing-page .billing-detail-card:hover,
          .billing-page .billing-step-card:hover,
          .billing-page .billing-inline-card:hover,
          .billing-page .billing-plan-card:hover,
          .billing-page .billing-history-item:hover {
            transform: translateY(-2px);
            border-color: rgba(23, 31, 59, 0.12);
            box-shadow: 0 16px 30px rgba(23, 31, 59, 0.06);
          }

          .billing-page .billing-status-card,
          .billing-page .billing-detail-card,
          .billing-page .billing-step-card {
            display: grid;
            gap: 0.32rem;
            min-height: 94px;
            padding: 0.82rem 0.88rem;
          }

          .billing-page .billing-status-card strong,
          .billing-page .billing-detail-card strong,
          .billing-page .billing-step-card strong {
            font-size: 0.96rem;
            line-height: 1.35;
          }

          .billing-page .billing-status-card small {
            color: var(--muted);
            font-size: 0.79rem;
            line-height: 1.4;
          }

          .billing-page .billing-micro-label {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            font-size: 0.69rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }

          .billing-page .billing-inline-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.9rem;
          }

          .billing-page .billing-inline-card {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.95rem 1rem;
          }

          .billing-page .billing-inline-card p,
          .billing-page .billing-plan-copy {
            margin: 0.18rem 0 0;
            color: var(--muted);
            line-height: 1.5;
          }

          .billing-page .billing-inline-card-accent {
            border-color: rgba(107, 46, 130, 0.14);
            background: linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.96),
              rgba(250, 246, 253, 0.94)
            );
          }

          .billing-page .billing-inline-card-soft {
            background: rgba(248, 250, 255, 0.92);
          }

          .billing-page .billing-inline-meta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 32px;
            padding: 0.35rem 0.6rem;
            border-radius: 999px;
            background: rgba(23, 31, 59, 0.05);
            color: var(--text);
            font-size: 0.78rem;
            font-weight: 700;
            white-space: nowrap;
          }

          .billing-page .billing-accordion {
            border-top: 1px solid rgba(23, 31, 59, 0.08);
            padding-top: 0.15rem;
          }

          .billing-page .billing-accordion summary,
          .billing-page .billing-history-item summary {
            list-style: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.8rem;
            cursor: pointer;
            color: var(--text);
            font-weight: 700;
          }

          .billing-page .billing-accordion summary::-webkit-details-marker,
          .billing-page .billing-history-item summary::-webkit-details-marker {
            display: none;
          }

          .billing-page .billing-accordion summary {
            padding: 0.45rem 0;
            font-size: 0.88rem;
          }

          .billing-page .billing-accordion summary::after,
          .billing-page .billing-history-item summary::after {
            content: "+";
            flex: none;
            color: var(--muted);
            font-size: 1rem;
            line-height: 1;
          }

          .billing-page .billing-accordion[open] summary::after,
          .billing-page .billing-history-item[open] summary::after {
            content: "-";
          }

          .billing-page .billing-plan-card {
            display: grid;
            gap: 0.85rem;
            padding: 1rem;
          }

          .billing-page .billing-plan-card.is-current {
            border-color: rgba(107, 46, 130, 0.16);
            box-shadow: 0 16px 34px rgba(107, 46, 130, 0.08);
          }

          .billing-page .billing-plan-card.is-featured {
            border-color: rgba(16, 117, 92, 0.22);
            box-shadow: 0 18px 36px rgba(16, 117, 92, 0.12);
          }

          .billing-page .billing-offer-intro {
            display: grid;
            gap: 0.85rem;
          }

          .billing-page .billing-plan-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.8rem;
          }

          .billing-page .billing-plan-head strong {
            display: block;
            margin-top: 0.22rem;
            font-size: 1rem;
          }

          .billing-page .billing-plan-price {
            display: flex;
            align-items: baseline;
            gap: 0.25rem;
          }

          .billing-page .billing-plan-price strong {
            font-size: 1.5rem;
            letter-spacing: -0.04em;
          }

          .billing-page .billing-plan-price span {
            color: var(--muted);
            font-size: 0.85rem;
          }

          .billing-page .billing-plan-tags,
          .billing-page .billing-plan-detail-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
          }

          .billing-page .billing-feature-chip {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
            padding: 0.24rem 0.58rem;
            border-radius: 999px;
            background: rgba(23, 31, 59, 0.05);
            color: var(--text);
            font-size: 0.75rem;
            font-weight: 600;
          }

          .billing-page .billing-feature-chip-muted {
            color: var(--muted);
          }

          .billing-page .billing-plan-accordion {
            margin-top: -0.2rem;
            border-top: 0;
            padding-top: 0;
          }

          .billing-page .billing-plan-accordion summary {
            padding: 0;
            font-size: 0.8rem;
            color: var(--muted);
          }

          .billing-page .billing-history-list {
            display: grid;
            gap: 0.75rem;
          }

          .billing-page .billing-history-item {
            padding: 0.88rem 0.95rem;
          }

          .billing-page .billing-history-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            width: 100%;
          }

          .billing-page .billing-history-head span {
            color: var(--muted);
            font-size: 0.8rem;
            white-space: nowrap;
          }

          .billing-page .billing-history-item p {
            margin: 0.75rem 0 0;
            padding-top: 0.75rem;
            border-top: 1px solid rgba(23, 31, 59, 0.08);
            line-height: 1.55;
          }

          .billing-page .billing-empty-state {
            border: 1px dashed rgba(23, 31, 59, 0.1);
            border-radius: 18px;
            background: rgba(248, 250, 255, 0.84);
            padding: 1rem;
          }

          .billing-page .subscription-contact-summary {
            border-radius: 18px;
            border: 1px solid rgba(23, 31, 59, 0.08);
            background: rgba(248, 250, 255, 0.84);
            box-shadow: none;
          }

          @media (max-width: 960px) {
            .billing-page .billing-inline-grid {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 720px) {
            .billing-page .billing-page-stack {
              gap: 1.2rem;
            }

            .billing-page .billing-section .panel-header,
            .billing-page .billing-section .panel-footer {
              padding: 1rem 1rem 0;
            }

            .billing-page .billing-section .panel-body {
              padding: 0.92rem 1rem 1rem;
            }

            .billing-page .billing-status-grid,
            .billing-page .billing-detail-grid,
            .billing-page .billing-step-grid,
            .billing-page .billing-plan-grid {
              grid-template-columns: 1fr;
            }

            .billing-page .billing-plan-head,
            .billing-page .billing-inline-card,
            .billing-page .billing-history-head {
              display: grid;
            }

            .billing-page .billing-inline-meta,
            .billing-page .billing-history-head span {
              white-space: normal;
            }
          }
        `}</style>
      </div>
    </AppShell>
  );
}
