"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import AppShell from "../../../components/app-shell";
import DataTable from "../../../components/data-table";
import Panel from "../../../components/panel";
import StatusPill from "../../../components/status-pill";
import useLokifyWorkspace from "../../../hooks/use-lokify-workspace";
import { formatClientPhone, resolveClientPhoneFields } from "../../../lib/client-country";
import { formatCurrency, formatDateTime } from "../../../lib/date";
import { readClientProfiles } from "../../../lib/workspace-store";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const getProfileField = (profile, key, fallback = "") => (hasOwn(profile, key) ? profile[key] : fallback);

const normalizeRouteParam = (value) => {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
};

const normalizeClientText = (value) => String(value ?? "").trim();

const buildClientDisplayName = (client) => {
  const explicitFullName = normalizeClientText(client?.full_name);

  if (explicitFullName) {
    return explicitFullName;
  }

  const joinedName = [normalizeClientText(client?.first_name), normalizeClientText(client?.last_name)]
    .filter(Boolean)
    .join(" ");

  if (joinedName) {
    return joinedName;
  }

  return normalizeClientText(client?.email) || "Client sans nom";
};

const buildClientInitials = (displayName) => {
  const initials = String(displayName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "CL";
};

const normalizeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const ensureObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const safeFormatDateTime = (value, fallback = "Non renseigne") => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return formatDateTime(date);
};

const safeLabel = (value, fallback) => {
  const normalizedValue = normalizeClientText(value);
  return normalizedValue || fallback;
};

const formatFileSize = (value) => {
  const bytes = Number(value || 0);

  if (!bytes) {
    return "0 o";
  }

  if (bytes < 1024) {
    return `${bytes} o`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier selectionne."));
    reader.readAsDataURL(file);
  });

export default function ClientDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspace = useLokifyWorkspace();
  const clientId = normalizeRouteParam(params?.id);
  const reservationStatusMeta = ensureObject(workspace.reservationStatusMeta) || {};
  const [clientProfiles, setClientProfiles] = useState({});
  const [clientRecord, setClientRecord] = useState(null);
  const [clientReservations, setClientReservations] = useState([]);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState("");
  const [clientDocuments, setClientDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentsFeedback, setDocumentsFeedback] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [restoringClient, setRestoringClient] = useState(false);
  const [documentDraft, setDocumentDraft] = useState({
    title: "",
    notes: "",
  });
  const filePickerRef = useRef(null);
  const cameraPickerRef = useRef(null);

  useEffect(() => {
    setClientProfiles(readClientProfiles());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadClient = async () => {
      if (!clientId) {
        if (!cancelled) {
          setClientError("Identifiant client invalide.");
          setClientRecord(null);
          setClientReservations([]);
          setClientLoading(false);
        }

        return;
      }

      setClientLoading(true);
      setClientError("");

      try {
        const [clientResponse, reservationsResponse] = await Promise.all([
          workspace.getClientDetail(clientId),
          workspace.listReservations({ client_id: clientId }),
        ]);
        const nextClientRecord = ensureObject(clientResponse?.client);

        if (!cancelled) {
          setClientRecord(nextClientRecord);
          setClientReservations(ensureArray(reservationsResponse?.reservations));
        }
      } catch (error) {
        if (!cancelled) {
          setClientError(error.message || "Impossible de charger la fiche client.");
          setClientRecord(null);
          setClientReservations([]);
        }
      } finally {
        if (!cancelled) {
          setClientLoading(false);
        }
      }
    };

    void loadClient();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const baseClient = clientRecord;
  const profile = clientId ? clientProfiles[clientId] || {} : {};
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
        full_name: buildClientDisplayName(baseClient),
        avatar_data: profile.avatar_data || "",
        client_type: profile.client_type || baseClient.segment || "Particulier",
        country_code: contact?.country_code || "",
        phone_number: contact?.phone_number || "",
        address_line: profile.address || baseClient.address || "",
        postal_code: profile.postal_code || "",
        city: profile.city || "",
        newsletter_opt_in: Boolean(profile.newsletter_opt_in),
      }
    : null;
  const reservations = ensureArray(clientReservations);
  const documents = ensureArray(clientDocuments);
  const clientInitials = buildClientInitials(client?.full_name);
  const totalReservationRevenue = reservations.reduce(
    (sum, reservation) => sum + normalizeAmount(reservation.total_amount),
    0
  );
  const isArchived = Boolean(client?.archive?.isArchived);
  const backHref = searchParams.get("scope") === "archived" ? "/clients?scope=archived" : "/clients";

  useEffect(() => {
    if (!client?.id) {
      setClientDocuments([]);
      return;
    }

    let cancelled = false;

    const loadClientDocuments = async () => {
      setDocumentsLoading(true);
      setDocumentsError("");

      try {
        const response = await workspace.listClientDocuments(client.id);

        if (!cancelled) {
          setClientDocuments(ensureArray(response?.documents));
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentsError(error.message || "Impossible de charger les documents du client.");
        }
      } finally {
        if (!cancelled) {
          setDocumentsLoading(false);
        }
      }
    };

    void loadClientDocuments();

    return () => {
      cancelled = true;
    };
  }, [client?.id]);

  const openClientDocument = (document) => {
    if (!normalizeClientText(document?.data_url) || typeof window === "undefined") {
      return;
    }

    window.open(document.data_url, "_blank", "noopener,noreferrer");
  };

  const handleClientDocumentUpload = async (event, captureSource) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !client?.id || isArchived) {
      return;
    }

    setUploadingDocument(true);
    setDocumentsError("");
    setDocumentsFeedback("");

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await workspace.uploadClientDocument(client.id, {
        title: documentDraft.title.trim() || file.name,
        notes: documentDraft.notes,
        file_name: file.name,
        capture_source: captureSource,
        data_url: dataUrl,
      });
      const nextDocument = ensureObject(response?.document);

      if (nextDocument) {
        setClientDocuments((current) => [nextDocument, ...ensureArray(current)]);
      }
      setDocumentDraft({
        title: "",
        notes: "",
      });
      setDocumentsFeedback("Document client ajoute.");
    } catch (error) {
      setDocumentsError(error.message || "Impossible d'ajouter le document client.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDeleteClientDocument = async (documentId) => {
    if (!client?.id || isArchived || !window.confirm("Supprimer ce document client ?")) {
      return;
    }

    setDocumentsError("");
    setDocumentsFeedback("");

    try {
      await workspace.deleteClientDocument(client.id, documentId);
      setClientDocuments((current) => ensureArray(current).filter((document) => document.id !== documentId));
      setDocumentsFeedback("Document supprimé.");
    } catch (error) {
      setDocumentsError(error.message || "Impossible de supprimer le document client.");
    }
  };

  const handleRestoreClient = async () => {
    if (!client?.id || !window.confirm("Restaurer ce client archivé ?")) {
      return;
    }

    setRestoringClient(true);
    setClientError("");

    try {
      await workspace.restoreClient(client.id);
      const [clientResponse, reservationsResponse] = await Promise.all([
        workspace.getClientDetail(client.id),
        workspace.listReservations({ client_id: client.id }),
      ]);
      setClientRecord(ensureObject(clientResponse?.client));
      setClientReservations(ensureArray(reservationsResponse?.reservations));
      setDocumentsFeedback("Client restauré.");
    } catch (error) {
      setClientError(error.message || "Impossible de restaurer le client.");
    } finally {
      setRestoringClient(false);
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Fiche client</p>
            <h3>{client ? client.full_name : "Client introuvable"}</h3>
            <p>Retrouvez les coordonnées, les notes de suivi et l'historique des réservations du client.</p>
          </div>
          <div className="page-header-actions">
            <Link href={backHref} className="button ghost">
              Retour aux clients
            </Link>
            {isArchived ? (
              <button
                type="button"
                className="button primary"
                onClick={handleRestoreClient}
                disabled={restoringClient}
              >
                {restoringClient ? "Restauration..." : "Restaurer"}
              </button>
            ) : (
              <Link href="/reservations?mode=create" className="button primary">
                Préparer une réservation
              </Link>
            )}
          </div>
        </div>

        {clientError ? <p className="feedback error">{clientError}</p> : null}

        {clientLoading && !client ? (
          <Panel title="Chargement de la fiche" description="Lecture des données client en cours.">
            <div className="empty-state">
              <strong>Préparation de la fiche détaillée</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!clientLoading && !client ? (
          <Panel title="Fiche indisponible" description="Le client demande n'existe pas dans l'espace courant.">
            <div className="empty-state">
              <strong>Aucune donnée chargée</strong>
              <span>Retournez à la liste clients pour sélectionner une fiche existante.</span>
            </div>
          </Panel>
        ) : (
          <>
            {isArchived ? (
              <Panel
                title="Client archivé"
                description="Le dossier reste intégralement conservé et peut être restauré sans perte."
              >
                <div className="detail-grid">
                  <article className="detail-card">
                    <strong>Archivé le</strong>
                    <span>{safeFormatDateTime(client.archive?.archivedAt)}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Purge définitive planifiée</strong>
                    <span>{safeFormatDateTime(client.archive?.scheduledPurgeAt)}</span>
                  </article>
                  <article className="detail-card">
                    <strong>Motif</strong>
                    <span>{safeLabel(client.archive?.archiveReason, "Non renseigne")}</span>
                  </article>
                </div>
              </Panel>
            ) : null}

            <section className="split-layout split-1-2">
              <Panel title="Coordonnées" description="Informations de contact et contexte relationnel.">
                <div className="avatar-stack">
                  <div className="avatar-preview">
                    {client.avatar_data ? <img src={client.avatar_data} alt={client.full_name} /> : clientInitials}
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
                    <span>{safeLabel(client.email, "Non renseigne")}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Téléphone</strong>
                    <span>{formatClientPhone(client.country_code, client.phone_number) || "Non renseigné"}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Newsletter</strong>
                    <span>{client.newsletter_opt_in ? "Abonné" : "Non abonné"}</span>
                  </div>
                </div>

                <div className="stack">
                  <div className="detail-card">
                    <strong>Adresse</strong>
                    <span>{[client.address_line, [client.postal_code, client.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse à compléter"}</span>
                  </div>
                  <div className="detail-card">
                    <strong>Notes de suivi</strong>
                    <span>{safeLabel(client.notes, "Aucune note de suivi.")}</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Activité client" description="Une lecture condensée des réservations et du volume généré.">
                <div className="summary-cards">
                  <div className="detail-card">
                    <strong>{client.metrics?.reservationCount || reservations.length}</strong>
                    <span className="muted-text">réservation(s)</span>
                  </div>
                  <div className="detail-card">
                    <strong>{formatCurrency(client.metrics?.totalRevenue || totalReservationRevenue)}</strong>
                    <span className="muted-text">montant cumulé</span>
                  </div>
                  <div className="detail-card">
                    <strong>{documents.length}</strong>
                    <span className="muted-text">document(s) rattaché(s)</span>
                  </div>
                </div>
              </Panel>
            </section>

            <Panel
              title="Documents clients"
              description={
                isArchived
                  ? "Les documents restent consultables. Les ajouts et suppressions sont bloqués tant que le dossier est archivé."
                  : "Importez les pièces utiles du dossier client et conservez-les dans la fiche."
              }
              actions={
                !isArchived ? (
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => filePickerRef.current?.click()}
                      disabled={uploadingDocument}
                    >
                      Choisir un fichier
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => cameraPickerRef.current?.click()}
                      disabled={uploadingDocument}
                    >
                      Photo / camera
                    </button>
                  </div>
                ) : null
              }
            >
              {!isArchived ? (
                <>
                  <input
                    ref={filePickerRef}
                    type="file"
                    hidden
                    onChange={(event) => void handleClientDocumentUpload(event, "upload")}
                  />
                  <input
                    ref={cameraPickerRef}
                    type="file"
                    hidden
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => void handleClientDocumentUpload(event, "camera")}
                  />

                  <div className="form-grid two-columns">
                    <div className="field">
                      <label htmlFor="client-document-title">Titre du document</label>
                      <input
                        id="client-document-title"
                        value={documentDraft.title}
                        onChange={(event) =>
                          setDocumentDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Permis, pièce d'identité, justificatif..."
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="client-document-notes">Note de suivi</label>
                      <input
                        id="client-document-notes"
                        value={documentDraft.notes}
                        onChange={(event) =>
                          setDocumentDraft((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Remarque utile pour l'équipe"
                      />
                    </div>
                  </div>

                  <p className="field-hint">
                    Sur mobile, le bouton caméra peut ouvrir directement la prise de photo. Sur ordinateur, il retombera sur le sélecteur de fichiers.
                  </p>
                </>
              ) : (
                <p className="field-hint">
                  Le dossier est archivé. Les documents restent consultables, mais aucun ajout ni suppression n'est autorisé tant que le client n'est pas restauré.
                </p>
              )}

              {documentsError ? <p className="feedback error">{documentsError}</p> : null}
              {documentsFeedback ? <p className="feedback success">{documentsFeedback}</p> : null}

              <DataTable
                rows={documents}
                emptyMessage={documentsLoading ? "Chargement des documents..." : "Aucun document client pour le moment."}
                columns={[
                  { key: "title", label: "Document" },
                  {
                    key: "mime_type",
                    label: "Type",
                    render: (row) => (
                      <div className="stack-inline">
                        <strong>{safeLabel(row.mime_type, "Type inconnu")}</strong>
                        <span className="muted-text">{formatFileSize(row.file_size)}</span>
                      </div>
                    ),
                  },
                  {
                    key: "capture_source",
                    label: "Source",
                    render: (row) => (
                      <StatusPill tone={row.capture_source === "camera" ? "info" : "neutral"}>
                        {row.capture_source === "camera" ? "Camera" : "Import"}
                      </StatusPill>
                    ),
                  },
                  {
                    key: "created_at",
                    label: "Ajouté le",
                    render: (row) => safeFormatDateTime(row.created_at, "Date indisponible"),
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (row) => (
                      <div className="inline-action-list">
                        <button type="button" className="action-button" onClick={() => openClientDocument(row)}>
                          Ouvrir
                        </button>
                        {!isArchived ? (
                          <button
                            type="button"
                            className="action-button danger"
                            onClick={() => void handleDeleteClientDocument(row.id)}
                          >
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
            </Panel>

            <Panel title="Historique des réservations" description="Retrouvez les locations rattachées à ce client et l'état des dossiers.">
              <DataTable
                rows={reservations}
                emptyMessage="Aucune réservation rattachée à ce client."
                columns={[
                  { key: "product", label: "Produit", render: (row) => safeLabel(row.item_name, "Produit indisponible") },
                  { key: "period", label: "Période", render: (row) => safeFormatDateTime(row.start_date, "Date indisponible") },
                  { key: "amount", label: "Montant TTC", render: (row) => formatCurrency(row.total_amount) },
                  {
                    key: "status",
                    label: "Statut",
                    render: (row) => (
                      <StatusPill
                        tone={reservationStatusMeta[row.status]?.tone || "neutral"}
                        color={reservationStatusMeta[row.status]?.color}
                      >
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
