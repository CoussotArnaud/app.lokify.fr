"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import MetricCard from "../../components/metric-card";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";
import { isValidSiret, normalizeSiret } from "../../lib/siret";
import {
  formatAdminDateTime,
  getProviderStatusMeta,
  getSaasLifecycleMeta,
  getSubscriptionStatusMeta,
} from "../../lib/provider-admin";

const initialCreateForm = {
  first_name: "",
  last_name: "",
  company_name: "",
  siret: "",
  commercial_name: "",
  address: "",
  postal_code: "",
  city: "",
  ape_code: "",
  siren: "",
  email: "",
  phone: "",
};

function ProvidersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const isCreateModalOpen = searchParams.get("mode") === "create";

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

  const closeCreateModal = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("mode");
    setCreateForm(initialCreateForm);
    router.replace(
      nextSearchParams.toString() ? `/prestataires?${nextSearchParams.toString()}` : "/prestataires"
    );
  };

  const updateCreateField = (field, value) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCreateProvider = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      if (!isValidSiret(createForm.siret)) {
        throw new Error("Le numero de SIRET est invalide.");
      }

      const response = await apiRequest("/admin/providers", {
        method: "POST",
        body: createForm,
      });

      await loadProviders();
      setCreateForm(initialCreateForm);
      router.push(`/abonnements/${response.provider.id}?created=1`);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Supprimer ce prestataire et ses donnees ?");

    if (!confirmed) {
      return;
    }

    setFeedback(null);

    try {
      await apiRequest(`/admin/providers/${providerId}`, {
        method: "DELETE",
      });
      await loadProviders();
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
            <h3>Gestion centralisee des prestataires et de leur activation Lokify.</h3>
            <p>
              La creation se fait maintenant via le bouton global + Prestataire, puis l&apos;activation
              est envoyee depuis la fiche du compte pour garder un flux propre et securise.
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
            icon="users"
            label="Prestataires"
            value={metrics?.totalProviders || 0}
            helper="Comptes prestataires actuellement suivis."
            tone="info"
          />
          <MetricCard
            icon="shield"
            label="Actifs"
            value={metrics?.activeProvidersCurrently || 0}
            helper="Prestataires deja actifs sur la plateforme."
            tone="success"
          />
          <MetricCard
            icon="mail"
            label="Invitations en attente"
            value={metrics?.invitedProviders || 0}
            helper="Comptes invites n'ayant pas encore active leur acces."
            tone="warning"
          />
          <MetricCard
            icon="bill"
            label="Abonnements actifs"
            value={metrics?.activeSubscriptions || 0}
            helper="Prestataires avec abonnement Lokify en cours."
            tone="info"
          />
        </section>

        <Panel
          title="Prestataires"
          description="Vue globale des comptes, de leur statut d'activation et de leur abonnement Lokify."
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
                    <strong>{row.company_name || row.full_name}</strong>
                    <small>{row.email}</small>
                    <small>{row.phone || "Telephone non renseigne"}</small>
                  </div>
                ),
              },
              {
                key: "provider_status",
                label: "Compte",
                render: (row) => {
                  const providerStatusMeta = getProviderStatusMeta(row.provider_status);

                  return (
                    <div className="table-title">
                      <StatusPill tone={providerStatusMeta.tone}>
                        {providerStatusMeta.label}
                      </StatusPill>
                      <small>
                        {row.security?.lastInvitationSentAt
                          ? `Dernier lien ${formatAdminDateTime(row.security.lastInvitationSentAt)}`
                          : row.provider_status === "invited"
                            ? "Invitation non envoyee"
                            : "Aucun envoi recent"}
                      </small>
                    </div>
                  );
                },
              },
              {
                key: "subscription",
                label: "Abonnement",
                render: (row) => {
                  const lifecycleMeta = getSaasLifecycleMeta(row.subscription?.saasLifecycleStatus);
                  const subscriptionMeta = getSubscriptionStatusMeta(
                    row.subscription?.lokifySubscriptionStatus
                  );

                  return (
                    <div className="table-title">
                      <strong>{row.subscription?.lokifyPlanName || "Aucune"}</strong>
                      <small>
                        {row.subscription?.lokifyPlanName
                          ? lifecycleMeta.label
                          : subscriptionMeta.label}
                      </small>
                    </div>
                  );
                },
              },
              {
                key: "metrics",
                label: "Donnees",
                render: (row) => (
                  <div className="table-title">
                    <strong>{row.metrics?.totalClients || 0} clients</strong>
                    <small>{row.metrics?.totalReservations || 0} reservations</small>
                  </div>
                ),
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="row-actions table-actions-compact">
                    <Link href={`/abonnements/${row.id}`} className="button ghost">
                      Fiche
                    </Link>
                    <button type="button" className="button ghost" onClick={() => handleDelete(row.id)}>
                      Supprimer
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>

        <ModalShell
          open={isCreateModalOpen}
          onClose={closeCreateModal}
          title="Creer un prestataire"
          description="Creation d'un compte invite sans mot de passe initial. Le prestataire definira ensuite son mot de passe via un lien securise."
          size="xl"
        >
          <form className="form-grid two-columns" onSubmit={handleCreateProvider}>
            <div className="field">
              <label htmlFor="provider-first-name">Prenom</label>
              <input
                id="provider-first-name"
                value={createForm.first_name}
                onChange={(event) => updateCreateField("first_name", event.target.value)}
                placeholder="Ex. Marie"
              />
            </div>

            <div className="field">
              <label htmlFor="provider-last-name">Nom</label>
              <input
                id="provider-last-name"
                value={createForm.last_name}
                onChange={(event) => updateCreateField("last_name", event.target.value)}
                placeholder="Ex. Dupont"
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-company-name">Nom de la societe</label>
              <input
                id="provider-company-name"
                value={createForm.company_name}
                onChange={(event) => updateCreateField("company_name", event.target.value)}
                placeholder="Ex. Studio Horizon"
                required
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-siret">Numero de SIRET</label>
              <input
                id="provider-siret"
                value={createForm.siret}
                onChange={(event) => updateCreateField("siret", event.target.value)}
                placeholder="123 456 789 00012"
                inputMode="numeric"
                required
              />
              <p className="field-helper">
                Le SIRET sera verifie pendant la creation du compte et enrichira automatiquement la
                fiche si l'etablissement est reconnu.
              </p>
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-commercial-name">Nom commercial</label>
              <input
                id="provider-commercial-name"
                value={createForm.commercial_name}
                onChange={(event) => updateCreateField("commercial_name", event.target.value)}
                placeholder="Optionnel"
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-address">Adresse</label>
              <input
                id="provider-address"
                value={createForm.address}
                onChange={(event) => updateCreateField("address", event.target.value)}
                placeholder="Ex. 18 avenue des Arts"
              />
            </div>

            <div className="field">
              <label htmlFor="provider-postal-code">Code postal</label>
              <input
                id="provider-postal-code"
                value={createForm.postal_code}
                onChange={(event) => updateCreateField("postal_code", event.target.value)}
                placeholder="69006"
              />
            </div>

            <div className="field">
              <label htmlFor="provider-city">Ville</label>
              <input
                id="provider-city"
                value={createForm.city}
                onChange={(event) => updateCreateField("city", event.target.value)}
                placeholder="Lyon"
              />
            </div>

            <div className="field">
              <label htmlFor="provider-ape-code">Code APE / NAF</label>
              <input
                id="provider-ape-code"
                value={createForm.ape_code}
                onChange={(event) => updateCreateField("ape_code", event.target.value)}
                placeholder="7729Z"
              />
            </div>

            <div className="field">
              <label htmlFor="provider-siren">SIREN</label>
              <input
                id="provider-siren"
                value={createForm.siren}
                onChange={(event) => updateCreateField("siren", event.target.value)}
                placeholder="123456789"
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-email">Email</label>
              <input
                id="provider-email"
                type="email"
                value={createForm.email}
                onChange={(event) => updateCreateField("email", event.target.value)}
                placeholder="vous@exemple.fr"
                required
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="provider-phone">Telephone</label>
              <input
                id="provider-phone"
                value={createForm.phone}
                onChange={(event) => updateCreateField("phone", event.target.value)}
                placeholder="Optionnel"
              />
            </div>

            <article className="detail-card field-span-2">
              <strong>Activation securisee</strong>
              <span className="muted-text">
                Aucun mot de passe n&apos;est demande a cette etape. Le compte sera cree en statut
                invite, puis active par email depuis la fiche prestataire.
              </span>
            </article>

            <div className="row-actions field-span-2">
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Creation..." : "Creer le prestataire"}
              </button>
              <button type="button" className="button ghost" onClick={closeCreateModal}>
                Annuler
              </button>
            </div>
          </form>
        </ModalShell>
      </div>
    </AppShell>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="page-stack" />
        </AppShell>
      }
    >
      <ProvidersPageContent />
    </Suspense>
  );
}
