"use client";

import { useDeferredValue, useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import MetricCard from "../../components/metric-card";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import Pagination from "../../components/pagination";
import SearchInput from "../../components/search-input";
import SecondaryNav from "../../components/secondary-nav";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { downloadCsv } from "../../lib/csv";
import { reservationStatusMeta } from "../../lib/lokify-data";
import { addDays, formatCurrency, formatDateTime, toDateTimeLocalValue } from "../../lib/date";

const pageSize = 7;

const reservationGroups = [
  {
    title: "Navigation interne",
    items: [
      { id: "reservations", label: "Reservations", helper: "Suivi, filtres et actions quotidiennes." },
      { id: "documents", label: "Documents", helper: "Devis, contrats, telechargements et exports." },
      { id: "cash", label: "Journal de caisse", helper: "Encaissements, non soldes et garanties." },
    ],
  },
];

const emptyQuickClientForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
};

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeComparableText = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeEmailValue = (value) => normalizeWhitespace(value).toLowerCase();

const normalizePhoneValue = (value) => {
  const digitsOnly = normalizeWhitespace(value).replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("33") && digitsOnly.length === 11) {
    return `0${digitsOnly.slice(2)}`;
  }

  return digitsOnly;
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const findExistingClientMatch = (clients, candidate) => {
  const candidateEmail = normalizeEmailValue(candidate.email);
  const candidatePhone = normalizePhoneValue(candidate.phone);
  const candidateFirstName = normalizeComparableText(candidate.first_name);
  const candidateLastName = normalizeComparableText(candidate.last_name);

  for (const client of clients) {
    const existingEmail = normalizeEmailValue(client.email);
    const existingPhone = normalizePhoneValue(client.phone || client.phone_number || "");
    const sameName =
      normalizeComparableText(client.first_name) === candidateFirstName &&
      normalizeComparableText(client.last_name) === candidateLastName;

    if (candidateEmail && existingEmail === candidateEmail) {
      return { client, type: "email" };
    }

    if (candidatePhone && existingPhone === candidatePhone) {
      return { client, type: "phone" };
    }

    if (sameName && !candidatePhone && !existingPhone && !candidateEmail && !existingEmail) {
      return { client, type: "name" };
    }
  }

  return null;
};

const getExistingClientMessage = (matchType) => {
  if (matchType === "email") {
    return "Ce client existe deja avec cet email. Il a ete selectionne automatiquement.";
  }

  if (matchType === "phone") {
    return "Ce client existe deja avec ce numero. Il a ete selectionne automatiquement.";
  }

  return "Ce client existe deja. Il a ete selectionne automatiquement.";
};

const getDefaultForm = (clients, products) => ({
  client_id: clients[0]?.id || "",
  item_id: products[0]?.id || "",
  start_date: toDateTimeLocalValue(new Date()),
  end_date: toDateTimeLocalValue(addDays(new Date(), 1)),
  status: "draft",
  notes: "",
});

const matchPeriodFilter = (reservation, periodFilter) => {
  const startDate = new Date(reservation.start_date);
  const now = new Date();

  if (periodFilter === "future") {
    return startDate >= now;
  }
  if (periodFilter === "past") {
    return startDate < now;
  }
  if (periodFilter === "month") {
    return startDate <= addDays(now, 30);
  }
  if (periodFilter === "week") {
    return startDate <= addDays(now, 7);
  }

  return true;
};

export default function ReservationsPage() {
  const workspace = useLokifyWorkspace();
  const [section, setSection] = useState("reservations");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState("reservation");
  const [scannerMessage, setScannerMessage] = useState("");
  const [form, setForm] = useState(getDefaultForm([], []));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isClientCreatorOpen, setIsClientCreatorOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState(emptyQuickClientForm);
  const [quickClientFeedback, setQuickClientFeedback] = useState("");
  const [quickClientError, setQuickClientError] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isSubmittingReservation, setIsSubmittingReservation] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (!workspace.clients.length && !workspace.products.length) {
      return;
    }

    setForm((current) => {
      const nextClientId = current.client_id || workspace.clients[0]?.id || "";
      const nextItemId = current.item_id || workspace.products[0]?.id || "";

      if (nextClientId === current.client_id && nextItemId === current.item_id) {
        return current;
      }

      return {
        ...current,
        client_id: nextClientId,
        item_id: nextItemId,
      };
    });
  }, [workspace.clients, workspace.products]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedSection = params.get("module");
    if (requestedSection === "documents" || requestedSection === "cash") {
      setSection(requestedSection);
    }
    if (params.get("mode") === "create") {
      setComposerIntent("reservation");
      setIsComposerOpen(true);
    }
    if (params.get("mode") === "quote") {
      setSection("documents");
      setComposerIntent("quote");
      setIsComposerOpen(true);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [section, periodFilter, statusFilter, deferredSearch]);

  const filteredReservations = workspace.reservations.filter((reservation) => {
    if (statusFilter !== "all" && reservation.status !== statusFilter) {
      return false;
    }
    if (!matchPeriodFilter(reservation, periodFilter)) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }

    return [reservation.client_name, reservation.item_name, reservation.category]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  const paginatedReservations = filteredReservations.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));

  const resetQuickClientState = ({ keepFeedback = false } = {}) => {
    setIsClientCreatorOpen(false);
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientError("");
    setIsCreatingClient(false);

    if (!keepFeedback) {
      setQuickClientFeedback("");
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setComposerIntent("reservation");
    setForm(getDefaultForm(workspace.clients, workspace.products));
    resetQuickClientState();
    setIsSubmittingReservation(false);
    setIsComposerOpen(false);
  };

  const openReservationComposer = () => {
    setEditingId(null);
    setComposerIntent("reservation");
    setForm(getDefaultForm(workspace.clients, workspace.products));
    setError("");
    setFeedback("");
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setQuickClientError("");
    setIsCreatingClient(false);
    setIsSubmittingReservation(false);
    setIsClientCreatorOpen(!workspace.clients.length);
    setIsComposerOpen(true);
  };

  const openQuoteComposer = () => {
    setEditingId(null);
    setComposerIntent("quote");
    setForm(getDefaultForm(workspace.clients, workspace.products));
    setSection("documents");
    setError("");
    setFeedback("");
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setQuickClientError("");
    setIsCreatingClient(false);
    setIsSubmittingReservation(false);
    setIsClientCreatorOpen(!workspace.clients.length);
    setIsComposerOpen(true);
  };

  const handleQuickClientCreate = async () => {
    const nextClientPayload = {
      first_name: normalizeWhitespace(quickClientForm.first_name),
      last_name: normalizeWhitespace(quickClientForm.last_name),
      phone: normalizeWhitespace(quickClientForm.phone),
      email: normalizeEmailValue(quickClientForm.email),
    };

    setQuickClientError("");
    setQuickClientFeedback("");

    if (!nextClientPayload.first_name || !nextClientPayload.last_name || !nextClientPayload.email) {
      setQuickClientError("Veuillez remplir les champs obligatoires.");
      return;
    }

    if (!isValidEmail(nextClientPayload.email)) {
      setQuickClientError("Le format de l'email est invalide.");
      return;
    }

    const existingClientMatch = findExistingClientMatch(workspace.clients, nextClientPayload);

    if (existingClientMatch) {
      setForm((current) => ({
        ...current,
        client_id: existingClientMatch.client.id,
      }));
      setQuickClientFeedback(getExistingClientMessage(existingClientMatch.type));
      setQuickClientForm(emptyQuickClientForm);
      setQuickClientError("");
      setIsClientCreatorOpen(false);
      return;
    }

    setIsCreatingClient(true);

    try {
      const response = await workspace.saveClient({
        first_name: nextClientPayload.first_name,
        last_name: nextClientPayload.last_name,
        email: nextClientPayload.email,
        phone: nextClientPayload.phone,
        address: "",
        notes: "",
      });

      const createdClient = response?.client;

      if (!createdClient?.id) {
        throw new Error("Impossible de creer le client.");
      }

      setForm((current) => ({
        ...current,
        client_id: createdClient.id,
      }));
      setQuickClientFeedback("Client cree avec succes.");
      setQuickClientForm(emptyQuickClientForm);
      setIsClientCreatorOpen(false);
    } catch (creationError) {
      setQuickClientError(creationError.message || "Impossible de creer le client.");
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleQuickClientKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleQuickClientCreate();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    if (!form.client_id) {
      setError("Selectionnez un client existant ou creez un nouveau client.");
      return;
    }

    if (!form.item_id) {
      setError("Selectionnez un produit pour enregistrer la reservation.");
      return;
    }

    setIsSubmittingReservation(true);

    try {
      await workspace.saveReservation(form, editingId);
      setFeedback(
        editingId
          ? composerIntent === "quote"
            ? "Devis mis a jour."
            : "Reservation mise a jour."
          : composerIntent === "quote"
            ? "Devis prepare."
            : "Reservation ajoutee."
      );
      resetForm();
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmittingReservation(false);
    }
  };

  const handleDelete = async (reservationId) => {
    if (!window.confirm("Supprimer cette reservation ?")) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.deleteReservation(reservationId);
      setFeedback("Reservation supprimee.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const startEdit = (reservation) => {
    setEditingId(reservation.id);
    setComposerIntent("reservation");
    setForm({
      client_id: reservation.client_id,
      item_id: reservation.item_id,
      start_date: toDateTimeLocalValue(reservation.start_date),
      end_date: toDateTimeLocalValue(reservation.end_date),
      status: reservation.status,
      notes: reservation.notes || "",
    });
    resetQuickClientState();
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setIsSubmittingReservation(false);
    setIsComposerOpen(true);
  };

  const exportReservations = () => {
    downloadCsv(
      "lokify-reservations.csv",
      [
        { label: "Statut", value: (row) => reservationStatusMeta[row.status]?.label || row.status },
        { label: "Client", value: (row) => row.client_name },
        { label: "Produit", value: (row) => row.item_name },
        { label: "Debut", value: (row) => formatDateTime(row.start_date) },
        { label: "Fin", value: (row) => formatDateTime(row.end_date) },
        { label: "Montant TTC", value: (row) => row.total_amount },
        { label: "Depot de garantie", value: (row) => row.deposit },
      ],
      filteredReservations
    );
  };

  const exportDocuments = () => {
    downloadCsv(
      "lokify-documents.csv",
      [
        { label: "Reference", value: (row) => row.reference },
        { label: "Client", value: (row) => row.client },
        { label: "Devis", value: (row) => row.quoteStatus },
        { label: "Contrat", value: (row) => row.contractStatus },
        { label: "Etat des lieux", value: (row) => row.inventoryStatus },
      ],
      workspace.documents
    );
  };

  const canSubmitReservation = Boolean(form.client_id && form.item_id) && !isCreatingClient && !isSubmittingReservation;

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Reservations</p>
            <h3>Un module plus clair pour vos dossiers, documents et encaissements.</h3>
            <p>La structure s'aere, les tables gagnent en lisibilite et les actions restent toutes branchees proprement.</p>
          </div>
          <div className="page-header-actions">
            <button type="button" className="button ghost" onClick={exportReservations}>
              Export
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setScannerMessage("Mode scanner prepare : structure prete pour un branchement materiel futur.")}
            >
              Scanner
            </button>
            <button type="button" className="button primary" onClick={openReservationComposer}>
              Nouvelle reservation
            </button>
          </div>
        </div>

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}
        {scannerMessage ? <div className="inline-alert">{scannerMessage}</div> : null}

        <section className="metric-grid">
          <MetricCard icon="document" label="Demandes" value={workspace.overview.stats.draft_reservations} helper="Brouillons a transformer" tone="warning" />
          <MetricCard icon="calendar" label="Reservations confirmees" value={workspace.reservations.filter((reservation) => reservation.status === "confirmed").length} helper="Locations pretes a partir" tone="success" />
          <MetricCard icon="euro" label="Montant suivi" value={formatCurrency(workspace.reservations.reduce((sum, reservation) => sum + reservation.total_amount, 0))} helper="TTC reserve sur la base actuelle" tone="info" />
        </section>

        <section className="subnav-layout">
          <SecondaryNav title="Module reservations" groups={reservationGroups} activeId={section} onChange={setSection} />

          <div className="page-stack">
            {section === "reservations" ? (
              <Panel
                title="Liste des reservations"
                description="Recherche client ou produit, filtres utiles et tableau plus respirant."
                actions={
                  <div className="toolbar-group">
                    <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                      <option value="all">Toute periode</option>
                      <option value="week">7 prochains jours</option>
                      <option value="month">30 prochains jours</option>
                      <option value="future">A venir</option>
                      <option value="past">Passees</option>
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">Tous les statuts</option>
                      {Object.entries(reservationStatusMeta).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <div className="stack">
                  <div className="toolbar-spread">
                    <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un client ou un produit" />
                    <StatusPill tone="info">{filteredReservations.length} reservation(s)</StatusPill>
                  </div>

                  <DataTable
                    rows={paginatedReservations}
                    emptyMessage="Aucune reservation sur cette vue."
                    columns={[
                      {
                        key: "status",
                        label: "Statut",
                        render: (row) => (
                          <StatusPill tone={reservationStatusMeta[row.status]?.tone || "neutral"}>
                            {reservationStatusMeta[row.status]?.label || row.status}
                          </StatusPill>
                        ),
                      },
                      {
                        key: "client",
                        label: "Client",
                        render: (row) => (
                          <div className="table-title">
                            <strong>{row.client_name}</strong>
                            <small>{row.item_name}</small>
                          </div>
                        ),
                      },
                      {
                        key: "period",
                        label: "Periode",
                        render: (row) => (
                          <div className="table-title">
                            <strong>{formatDateTime(row.start_date)}</strong>
                            <small>Fin {formatDateTime(row.end_date)}</small>
                          </div>
                        ),
                      },
                      {
                        key: "amount",
                        label: "Montant TTC",
                        render: (row) => formatCurrency(row.total_amount),
                      },
                      {
                        key: "deposit",
                        label: "Depot de garantie",
                        render: (row) => formatCurrency(row.deposit),
                      },
                      {
                        key: "actions",
                        label: "Actions",
                        render: (row) => (
                          <div className="row-actions">
                            <button type="button" className="action-button" onClick={() => startEdit(row)}>
                              Modifier
                            </button>
                            <button type="button" className="action-button danger" onClick={() => handleDelete(row.id)}>
                              Supprimer
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />

                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              </Panel>
            ) : null}

            {section === "documents" ? (
              <Panel
                title="Documents"
                description="Recherche, filtres par periode et export propre pour les devis et contrats."
                actions={
                  <div className="toolbar-group">
                    <button type="button" className="button ghost" onClick={exportDocuments}>
                      Exporter
                    </button>
                    <button type="button" className="button secondary" onClick={openQuoteComposer}>
                      Preparer un devis
                    </button>
                  </div>
                }
              >
                <DataTable
                  rows={workspace.documents}
                  emptyMessage="Aucun document a suivre."
                  columns={[
                    { key: "reference", label: "Reference" },
                    { key: "client", label: "Client" },
                    {
                      key: "quoteStatus",
                      label: "Devis",
                      render: (row) => <StatusPill tone={row.quoteStatus === "Pret" ? "success" : "warning"}>{row.quoteStatus}</StatusPill>,
                    },
                    {
                      key: "contractStatus",
                      label: "Contrat",
                      render: (row) => <StatusPill tone={row.contractStatus === "A signer" ? "info" : "neutral"}>{row.contractStatus}</StatusPill>,
                    },
                    {
                      key: "inventoryStatus",
                      label: "Etat des lieux",
                      render: (row) => <StatusPill tone={row.inventoryStatus === "Archive" ? "success" : "warning"}>{row.inventoryStatus}</StatusPill>,
                    },
                  ]}
                />
              </Panel>
            ) : null}

            {section === "cash" ? (
              <>
                <div className="kpi-band">
                  <div className="kpi-tile">
                    <strong>{workspace.cashEntries.filter((entry) => entry.status === "A encaisser").length}</strong>
                    <span>encaissements a suivre</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{workspace.cashEntries.filter((entry) => entry.status === "Bloque").length}</strong>
                    <span>depots actuellement bloques</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{workspace.cashEntries.filter((entry) => entry.status === "A restituer").length}</strong>
                    <span>garanties a restituer</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{formatCurrency(workspace.cashEntries.reduce((sum, entry) => sum + entry.amount, 0))}</strong>
                    <span>montant total suivi</span>
                  </div>
                </div>

                <Panel title="Journal de caisse" description="Un suivi plus propre des montants TTC, non soldes et depots.">
                  <DataTable
                    rows={workspace.cashEntries}
                    emptyMessage="Aucune ecriture de caisse pour le moment."
                    columns={[
                      { key: "type", label: "Type" },
                      { key: "label", label: "Reference" },
                      { key: "date", label: "Date", render: (row) => formatDateTime(row.date) },
                      { key: "amount", label: "Montant", render: (row) => formatCurrency(row.amount) },
                      {
                        key: "status",
                        label: "Statut",
                        render: (row) => (
                          <StatusPill tone={row.status === "A encaisser" ? "warning" : row.status === "A restituer" ? "info" : "neutral"}>
                            {row.status}
                          </StatusPill>
                        ),
                      },
                    ]}
                  />
                </Panel>
              </>
            ) : null}
          </div>
        </section>

        <ModalShell
          open={isComposerOpen}
          title={editingId ? "Modifier la reservation" : composerIntent === "quote" ? "Preparer un devis" : "Nouvelle reservation"}
          description={
            composerIntent === "quote"
              ? "Creez un devis directement depuis votre base clients et votre catalogue, sans quitter la section documents."
              : "Une creation plus propre sans encombrer l'ecran principal."
          }
          onClose={resetForm}
        >
          {workspace.loading ? (
            <div className="empty-state">
              <strong>Chargement des donnees</strong>
              <span>Les clients et le catalogue sont en cours de recuperation pour preparer le dossier.</span>
            </div>
          ) : workspace.products.length ? (
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field reservation-client-field">
                <div className="reservation-client-heading">
                  <label htmlFor="reservation-client">Client</label>
                  <button
                    type="button"
                    className="action-button reservation-client-toggle"
                    onClick={() => {
                      setIsClientCreatorOpen((current) => !current);
                      setQuickClientError("");
                      setQuickClientFeedback("");
                    }}
                    disabled={isCreatingClient || isSubmittingReservation}
                  >
                    {isClientCreatorOpen ? "Fermer" : "+ Nouveau client"}
                  </button>
                </div>
                <select id="reservation-client" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}>
                  <option value="">Selectionnez ou creez un client</option>
                  {workspace.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
                <p className="field-hint">Choisissez un client existant ou ajoutez-en un sans quitter cette reservation.</p>
                {!workspace.clients.length ? (
                  <div className="inline-alert reservation-inline-alert">
                    Aucun client dans la base pour le moment. Creez-en un ici puis poursuivez la reservation.
                  </div>
                ) : null}
                {quickClientError ? <p className="feedback error reservation-inline-feedback">{quickClientError}</p> : null}
                {quickClientFeedback ? <p className="feedback success reservation-inline-feedback">{quickClientFeedback}</p> : null}

                {isClientCreatorOpen ? (
                  <div className="reservation-client-creator">
                    <div className="reservation-client-creator-head">
                      <div>
                        <strong>Nouveau client</strong>
                        <p>Creation rapide de la fiche client, avec selection automatique dans la reservation.</p>
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="quick-client-first-name">Prenom</label>
                        <input
                          id="quick-client-first-name"
                          value={quickClientForm.first_name}
                          onChange={(event) => setQuickClientForm((current) => ({ ...current, first_name: event.target.value }))}
                          onKeyDown={handleQuickClientKeyDown}
                          placeholder="Prenom"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="quick-client-last-name">Nom</label>
                        <input
                          id="quick-client-last-name"
                          value={quickClientForm.last_name}
                          onChange={(event) => setQuickClientForm((current) => ({ ...current, last_name: event.target.value }))}
                          onKeyDown={handleQuickClientKeyDown}
                          placeholder="Nom"
                        />
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="quick-client-phone">Telephone</label>
                        <input
                          id="quick-client-phone"
                          value={quickClientForm.phone}
                          onChange={(event) => setQuickClientForm((current) => ({ ...current, phone: event.target.value }))}
                          onKeyDown={handleQuickClientKeyDown}
                          placeholder="06 12 34 56 78"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="quick-client-email">Email</label>
                        <input
                          id="quick-client-email"
                          type="email"
                          value={quickClientForm.email}
                          onChange={(event) => setQuickClientForm((current) => ({ ...current, email: event.target.value }))}
                          onKeyDown={handleQuickClientKeyDown}
                          placeholder="client@exemple.fr"
                        />
                      </div>
                    </div>

                    <div className="row-actions reservation-client-creator-actions">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void handleQuickClientCreate()}
                        disabled={isCreatingClient || isSubmittingReservation}
                      >
                        {isCreatingClient ? "Creation..." : "Creer et selectionner"}
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => {
                          setIsClientCreatorOpen(false);
                          setQuickClientForm(emptyQuickClientForm);
                          setQuickClientError("");
                          setQuickClientFeedback("");
                        }}
                        disabled={isCreatingClient}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="reservation-product">Produit</label>
                <select id="reservation-product" value={form.item_id} onChange={(event) => setForm((current) => ({ ...current, item_id: event.target.value }))}>
                  {workspace.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="reservation-start">Debut</label>
                  <input id="reservation-start" type="datetime-local" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} />
                </div>
                <div className="field">
                  <label htmlFor="reservation-end">Fin</label>
                  <input id="reservation-end" type="datetime-local" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="reservation-status">Statut</label>
                <select id="reservation-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  {Object.entries(reservationStatusMeta).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="reservation-notes">Notes</label>
                <textarea id="reservation-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes operationnelles, consignes client, logistique..." />
              </div>

              {!form.client_id ? (
                <div className="inline-alert reservation-inline-alert">
                  Selectionnez un client existant ou creez-en un nouveau pour finaliser la reservation.
                </div>
              ) : null}

              <div className="row-actions">
                <button type="submit" className="button primary" disabled={!canSubmitReservation}>
                  {isSubmittingReservation ? "Enregistrement..." : editingId ? "Sauvegarder" : composerIntent === "quote" ? "Creer le devis" : "Creer la reservation"}
                </button>
                <button type="button" className="button ghost" onClick={resetForm}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <strong>Catalogue insuffisant</strong>
              <span>Ajoutez au moins un produit pour creer une reservation. Les clients peuvent maintenant etre crees directement ici.</span>
            </div>
          )}
        </ModalShell>
      </div>
    </AppShell>
  );
}
