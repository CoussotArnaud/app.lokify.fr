"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import AppShell from "../../../components/app-shell";
import DataTable from "../../../components/data-table";
import Panel from "../../../components/panel";
import StatusPill from "../../../components/status-pill";
import useLokifyWorkspace from "../../../hooks/use-lokify-workspace";
import { formatClientPhone, resolveClientPhoneFields } from "../../../lib/client-country";
import { reservationStatusMeta } from "../../../lib/lokify-data";
import { formatCurrency, formatDateTime } from "../../../lib/date";
import { readClientProfiles } from "../../../lib/workspace-store";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const getProfileField = (profile, key, fallback = "") => (hasOwn(profile, key) ? profile[key] : fallback);

export default function ClientDetailPage() {
  const params = useParams();
  const workspace = useLokifyWorkspace();
  const [clientProfiles, setClientProfiles] = useState({});

  useEffect(() => {
    setClientProfiles(readClientProfiles());
  }, []);

  const baseClient = workspace.clients.find((entry) => entry.id === params.id);
  const profile = clientProfiles[params.id] || {};
  const contact = baseClient
    ? resolveClientPhoneFields({
        country: getProfileField(profile, "country"),
        country_code: getProfileField(profile, "country_code"),
        phone: getProfileField(profile, "phone", baseClient.phone || ""),
      })
    : null;
  const client = baseClient
    ? {
        ...baseClient,
        avatar_data: profile.avatar_data || "",
        client_type: profile.client_type || baseClient.segment,
        country_code: contact?.country_code || "",
        phone_number: contact?.phone_number || "",
        address_line: profile.address || baseClient.address || "",
        postal_code: profile.postal_code || "",
        city: profile.city || "",
        newsletter_opt_in: Boolean(profile.newsletter_opt_in),
      }
    : null;
  const reservations = workspace.reservations.filter((reservation) => reservation.client_id === params.id);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Fiche client</p>
            <h3>{client ? client.full_name : "Client introuvable"}</h3>
            <p>Coordonnees, notes internes et historique des reservations dans une fiche plus propre et plus complete.</p>
          </div>
          <div className="page-header-actions">
            <Link href="/clients" className="button ghost">
              Retour aux clients
            </Link>
            <Link href="/reservations?mode=create" className="button primary">
              Preparer une reservation
            </Link>
          </div>
        </div>

        {!client ? (
          <Panel title="Fiche indisponible" description="Le client demande n'existe pas dans l'espace courant.">
            <div className="empty-state">
              <strong>Aucune donnee chargee</strong>
              <span>Retournez a la liste clients pour selectionner une fiche existante.</span>
            </div>
          </Panel>
        ) : (
          <>
            <section className="split-layout split-1-2">
              <Panel title="Coordonnees" description="Informations de contact et contexte relationnel.">
                <div className="avatar-stack">
                  <div className="avatar-preview">
                    {client.avatar_data ? <img src={client.avatar_data} alt={client.full_name} /> : client.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="stack">
                    <strong>{client.full_name}</strong>
                    <StatusPill tone={client.client_type === "Professionnel" ? "info" : "neutral"}>
                      {client.client_type}
                    </StatusPill>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <strong>Email</strong>
                    <span>{client.email}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Telephone</strong>
                    <span>{formatClientPhone(client.country_code, client.phone_number) || "Non renseigne"}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Newsletter</strong>
                    <span>{client.newsletter_opt_in ? "Abonne" : "Non abonne"}</span>
                  </div>
                </div>

                <div className="stack">
                  <div className="detail-card">
                    <strong>Adresse</strong>
                    <span>{[client.address_line, [client.postal_code, client.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse a completer"}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Notes internes</strong>
                    <span>{client.notes || "Aucune note interne."}</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Activite client" description="Une lecture condensee des reservations et du volume genere.">
                <div className="summary-cards">
                  <div className="detail-card">
                    <strong>{reservations.length}</strong>
                    <span className="muted-text">reservation(s)</span>
                  </div>
                  <div className="detail-card">
                    <strong>{formatCurrency(reservations.reduce((sum, reservation) => sum + reservation.total_amount, 0))}</strong>
                    <span className="muted-text">montant cumule</span>
                  </div>
                </div>

                <div className="empty-state">
                  <strong>Documents lies</strong>
                  <span>La base reste prete pour rattacher devis, contrats, signatures et pieces jointes.</span>
                </div>
              </Panel>
            </section>

            <Panel title="Historique des reservations" description="Retrouvez les locations rattachees a ce client et l'etat des dossiers.">
              <DataTable
                rows={reservations}
                emptyMessage="Aucune reservation rattachee a ce client."
                columns={[
                  { key: "product", label: "Produit", render: (row) => row.item_name },
                  { key: "period", label: "Periode", render: (row) => formatDateTime(row.start_date) },
                  { key: "amount", label: "Montant TTC", render: (row) => formatCurrency(row.total_amount) },
                  {
                    key: "status",
                    label: "Statut",
                    render: (row) => (
                      <StatusPill tone={reservationStatusMeta[row.status]?.tone || "neutral"}>
                        {reservationStatusMeta[row.status]?.label || row.status}
                      </StatusPill>
                    ),
                  },
                ]}
              />
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}
