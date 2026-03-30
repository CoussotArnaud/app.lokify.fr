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
import { reservationDepositStatusMeta } from "../../lib/lokify-data";
import { addDays, formatCurrency, formatDateTime, toDateTimeLocalValue } from "../../lib/date";

const pageSize = 7;
const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

const reservationGroups = [
  {
    items: [
      { id: "reservations", label: "Réservations", helper: "Suivi, filtres et actions quotidiennes." },
      { id: "documents", label: "Documents", helper: "Devis, contrats, téléchargements et exports." },
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

const ensureArray = (value) => (Array.isArray(value) ? value : EMPTY_ARRAY);
const ensureObject = (value) => (value && typeof value === "object" ? value : EMPTY_OBJECT);

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

  for (const client of ensureArray(clients)) {
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

const buildReservationLine = (products) => ({
  item_id: ensureArray(products)[0]?.id || "",
  quantity: 1,
});

const getDefaultForm = (clients, products) => ({
  client_id: ensureArray(clients)[0]?.id || "",
  start_date: toDateTimeLocalValue(new Date()),
  end_date: toDateTimeLocalValue(addDays(new Date(), 1)),
  status: "draft",
  source: "manual",
  fulfillment_mode: "pickup",
  notes: "",
  deposit: {
    handling_mode: "manual",
    manual_status: "pending",
    manual_method: "",
    manual_reference: "",
    notes: "",
  },
  lines: [buildReservationLine(products)],
});

const getReservationDurationInDays = (startDateValue, endDateValue) => {
  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 1;
  }

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDocumentPreviewMarkup = (document) => `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: Arial, sans-serif;
        color: #1f2a44;
        background: #ffffff;
      }
      .sheet {
        max-width: 860px;
        margin: 0 auto;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 20px 0 28px;
      }
      .meta-card {
        border: 1px solid #d9e3f2;
        border-radius: 12px;
        padding: 14px 16px;
        background: #f8fbff;
      }
      .meta-card strong,
      .meta-card span {
        display: block;
      }
      pre {
        white-space: pre-wrap;
        font: inherit;
        line-height: 1.6;
        border: 1px solid #d9e3f2;
        border-radius: 12px;
        padding: 20px;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <h1>${escapeHtml(document.title)}</h1>
      <p>${escapeHtml(document.type_label || document.type)}</p>
      <div class="meta">
        <div class="meta-card">
          <strong>Référence</strong>
          <span>${escapeHtml(document.reference)}</span>
        </div>
        <div class="meta-card">
          <strong>Réservation</strong>
          <span>${escapeHtml(document.reservation?.reference || "")}</span>
        </div>
        <div class="meta-card">
          <strong>Client</strong>
          <span>${escapeHtml(document.reservation?.client_name || document.client_name || "")}</span>
        </div>
        <div class="meta-card">
          <strong>Statut</strong>
          <span>${escapeHtml(document.status_label || document.status)}</span>
        </div>
      </div>
      <pre>${escapeHtml(document.content_text || "")}</pre>
      ${
        document.notes
          ? `<section><h2>Notes de suivi</h2><pre>${escapeHtml(document.notes)}</pre></section>`
          : ""
      }
    </main>
  </body>
</html>
`;

export default function ReservationsPage() {
  const rawWorkspace = useLokifyWorkspace();
  const [section, setSection] = useState("reservations");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [requestedEditId, setRequestedEditId] = useState("");
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
  const [operationsFeedback, setOperationsFeedback] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [activeDocument, setActiveDocument] = useState(null);
  const [documentDraft, setDocumentDraft] = useState({
    title: "",
    status: "",
    due_at: "",
    content_text: "",
    notes: "",
  });
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentFeedback, setDocumentFeedback] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const reservationStatusMeta = ensureObject(rawWorkspace.reservationStatusMeta);
  const reservationStatusOptions = ensureArray(rawWorkspace.reservationStatuses);
  const clients = ensureArray(rawWorkspace.clients);
  const products = ensureArray(rawWorkspace.products);
  const reservations = ensureArray(rawWorkspace.reservations);
  const documents = ensureArray(rawWorkspace.documents);
  const cashEntries = ensureArray(rawWorkspace.cashEntries);
  const formLines = ensureArray(form.lines);
  const overviewStats = ensureObject(rawWorkspace.overview?.stats);
  const cashSummary = {
    pending_revenue_count: 0,
    blocked_deposits_count: 0,
    deposits_to_release_count: 0,
    tracked_amount: 0,
    ...ensureObject(rawWorkspace.cashSummary),
  };
  const workspace = {
    ...rawWorkspace,
    clients,
    products,
    reservations,
    documents,
    cashEntries,
    reservationStatuses: reservationStatusOptions,
    reservationStatusMeta,
    overview: {
      ...ensureObject(rawWorkspace.overview),
      stats: overviewStats,
    },
    cashSummary,
  };

  useEffect(() => {
    if (!clients.length && !products.length) {
      return;
    }

    setForm((current) => {
      const nextClientId = current.client_id || clients[0]?.id || "";
      const nextLines =
        ensureArray(current.lines).length
          ? ensureArray(current.lines).map((line, index) => ({
              ...line,
              item_id: line.item_id || (index === 0 ? products[0]?.id || "" : ""),
              quantity: Number(line.quantity || 1),
            }))
          : [buildReservationLine(products)];

      const hasChanged =
        nextClientId !== current.client_id ||
        JSON.stringify(nextLines) !== JSON.stringify(ensureArray(current.lines));

      if (!hasChanged) {
        return current;
      }

      return {
        ...current,
        client_id: nextClientId,
        lines: nextLines,
      };
    });
  }, [clients, products]);

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
    if (params.get("edit")) {
      setSection("reservations");
      setRequestedEditId(params.get("edit"));
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [section, periodFilter, statusFilter, deferredSearch]);

  const filteredReservations = reservations.filter((reservation) => {
    if (statusFilter !== "all" && reservation.status !== statusFilter) {
      return false;
    }
    if (!matchPeriodFilter(reservation, periodFilter)) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }

    return [reservation.client_name, reservation.item_summary || reservation.item_name, reservation.category]
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
    setForm(getDefaultForm(clients, products));
    resetQuickClientState();
    setIsSubmittingReservation(false);
    setIsComposerOpen(false);
  };

  const openReservationComposer = () => {
    setEditingId(null);
    setComposerIntent("reservation");
    setForm(getDefaultForm(clients, products));
    setError("");
    setFeedback("");
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setQuickClientError("");
    setIsCreatingClient(false);
    setIsSubmittingReservation(false);
    setIsClientCreatorOpen(!clients.length);
    setIsComposerOpen(true);
  };

  const openQuoteComposer = () => {
    setEditingId(null);
    setComposerIntent("quote");
    setForm({
      ...getDefaultForm(clients, products),
      source: "quote",
    });
    setSection("documents");
    setError("");
    setFeedback("");
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setQuickClientError("");
    setIsCreatingClient(false);
    setIsSubmittingReservation(false);
    setIsClientCreatorOpen(!clients.length);
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

    const existingClientMatch = findExistingClientMatch(clients, nextClientPayload);

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
        throw new Error("Impossible de créer le client.");
      }

      setForm((current) => ({
        ...current,
        client_id: createdClient.id,
      }));
      setQuickClientFeedback("Client créé avec succès.");
      setQuickClientForm(emptyQuickClientForm);
      setIsClientCreatorOpen(false);
    } catch (creationError) {
      setQuickClientError(creationError.message || "Impossible de créer le client.");
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

  const updateReservationLine = (index, field, value) => {
    setForm((current) => ({
      ...current,
      lines: ensureArray(current.lines).map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: field === "quantity" ? Math.max(1, Number(value || 1)) : value,
            }
          : line
      ),
    }));
  };

  const addReservationLine = () => {
    setForm((current) => ({
      ...current,
      lines: [...ensureArray(current.lines), buildReservationLine(products)],
    }));
  };

  const removeReservationLine = (index) => {
    setForm((current) => {
      const nextLines = ensureArray(current.lines).filter((_, lineIndex) => lineIndex !== index);

      return {
        ...current,
        lines: nextLines.length ? nextLines : [buildReservationLine(products)],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");
    const nextLines = formLines
      .map((line) => ({
        item_id: line.item_id,
        quantity: Math.max(1, Number(line.quantity || 1)),
      }))
      .filter((line) => line.item_id);

    if (!form.client_id) {
      setError("Sélectionnez un client existant ou créez un nouveau client.");
      return;
    }

    if (!nextLines.length) {
      setError("Ajoutez au moins un produit pour enregistrer la réservation.");
      return;
    }

    setIsSubmittingReservation(true);

    try {
      await workspace.saveReservation(
        {
          ...form,
          source: composerIntent === "quote" ? "quote" : form.source,
          lines: nextLines,
          item_id: nextLines[0]?.item_id || "",
          deposit: form.deposit,
        },
        editingId
      );
      setFeedback(
        editingId
          ? composerIntent === "quote"
            ? "Devis mis à jour."
            : "Réservation mise à jour."
          : composerIntent === "quote"
            ? "Devis préparé."
            : "Réservation ajoutée."
      );
      resetForm();
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmittingReservation(false);
    }
  };

  const handleDelete = async (reservationId) => {
    if (!window.confirm("Supprimer cette réservation ?")) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.deleteReservation(reservationId);
      setFeedback("Réservation supprimée.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const closeDocumentEditor = () => {
    setActiveDocument(null);
    setDocumentDraft({
      title: "",
      status: "",
      due_at: "",
      content_text: "",
      notes: "",
    });
    setDocumentLoading(false);
    setDocumentSaving(false);
    setDocumentError("");
    setDocumentFeedback("");
  };

  const openDocumentEditor = async (documentId) => {
    setActiveDocument(null);
    setDocumentLoading(true);
    setDocumentError("");
    setDocumentFeedback("");

    try {
      const response = await workspace.getReservationDocument(documentId);
      const document = response.document;

      setActiveDocument(document);
      setDocumentDraft({
        title: document.title || "",
        status: document.status || "",
        due_at: document.due_at ? toDateTimeLocalValue(document.due_at) : "",
        content_text: document.content_text || "",
        notes: document.notes || "",
      });
    } catch (requestError) {
      setDocumentError(requestError.message || "Impossible d'ouvrir le document.");
      setError(requestError.message || "Impossible d'ouvrir le document.");
    } finally {
      setDocumentLoading(false);
    }
  };

  const openDocumentPreview = () => {
    if (!activeDocument || typeof window === "undefined") {
      return;
    }

    const statusLabel =
      ensureArray(activeDocument.status_options).find((option) => option.value === documentDraft.status)?.label ||
      activeDocument.status_label ||
      documentDraft.status;
    const previewDocument = {
      ...activeDocument,
      ...documentDraft,
      status_label: statusLabel,
    };
    const previewWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!previewWindow) {
      setDocumentError("Le navigateur a bloque l'ouverture du document.");
      return;
    }

    previewWindow.document.write(buildDocumentPreviewMarkup(previewDocument));
    previewWindow.document.close();
  };

  const handleDocumentSave = async () => {
    if (!activeDocument) {
      return;
    }

    setDocumentSaving(true);
    setDocumentError("");
    setDocumentFeedback("");

    try {
      const response = await workspace.saveReservationDocument(activeDocument.id, {
        title: documentDraft.title,
        status: documentDraft.status,
        due_at: documentDraft.due_at ? new Date(documentDraft.due_at).toISOString() : activeDocument.due_at,
        content_text: documentDraft.content_text,
        notes: documentDraft.notes,
      });
      const nextDocument = response.document;

      setActiveDocument(nextDocument);
      setDocumentDraft({
        title: nextDocument.title || "",
        status: nextDocument.status || "",
        due_at: nextDocument.due_at ? toDateTimeLocalValue(nextDocument.due_at) : "",
        content_text: nextDocument.content_text || "",
        notes: nextDocument.notes || "",
      });
      setDocumentFeedback("Document enregistre.");
    } catch (requestError) {
      setDocumentError(requestError.message || "Impossible d'enregistrer le document.");
    } finally {
      setDocumentSaving(false);
    }
  };

  const handleDeparture = async (reservationId) => {
    setOperationsError("");
    setOperationsFeedback("");

    try {
      await workspace.markReservationDeparture(reservationId);
      setOperationsFeedback("Depart valide.");
    } catch (requestError) {
      setOperationsError(requestError.message);
    }
  };

  const handleReturn = async (reservationId) => {
    setOperationsError("");
    setOperationsFeedback("");

    try {
      await workspace.markReservationReturn(reservationId);
      setOperationsFeedback("Retour valide.");
    } catch (requestError) {
      setOperationsError(requestError.message);
    }
  };

  const startEdit = (reservation) => {
    setEditingId(reservation.id);
    setComposerIntent("reservation");
    setForm({
      client_id: reservation.client_id,
      start_date: toDateTimeLocalValue(reservation.start_date),
      end_date: toDateTimeLocalValue(reservation.end_date),
      status: reservation.status,
      source: reservation.source || "manual",
      fulfillment_mode: reservation.fulfillment_mode || "pickup",
      notes: reservation.notes || "",
      deposit: {
        handling_mode: reservation.deposit_tracking?.handling_mode || "manual",
        manual_status: reservation.deposit_tracking?.manual_status || "pending",
        manual_method: reservation.deposit_tracking?.manual_method || "",
        manual_reference: reservation.deposit_tracking?.manual_reference || "",
        notes: reservation.deposit_tracking?.notes || "",
      },
      lines: reservation.lines?.length
        ? ensureArray(reservation.lines).map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
          }))
        : [buildReservationLine(products)],
    });
    resetQuickClientState();
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientFeedback("");
    setIsSubmittingReservation(false);
    setIsComposerOpen(true);
  };

  useEffect(() => {
    if (!requestedEditId || !reservations.length) {
      return;
    }

    const reservationToEdit = reservations.find((reservation) => reservation.id === requestedEditId);

    if (!reservationToEdit) {
      return;
    }

    startEdit(reservationToEdit);
    setRequestedEditId("");

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("edit");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", nextSearch ? `/reservations?${nextSearch}` : "/reservations");
    }
  }, [requestedEditId, reservations]);

  const exportReservations = () => {
    downloadCsv(
      "lokify-reservations.csv",
      [
        { label: "Statut", value: (row) => reservationStatusMeta[row.status]?.label || row.status },
        { label: "Client", value: (row) => row.client_name },
        { label: "Produit", value: (row) => row.item_summary || row.item_name },
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
        { label: "Référence", value: (row) => row.reference },
        { label: "Client", value: (row) => row.client },
        { label: "Devis", value: (row) => row.quoteStatus },
        { label: "Contrat", value: (row) => row.contractStatus },
        { label: "Etat des lieux", value: (row) => row.inventoryStatus },
        { label: "Facture", value: (row) => row.invoiceStatus },
      ],
      documents
    );
  };

  const reservationDurationInDays = getReservationDurationInDays(form.start_date, form.end_date);
  const estimatedReservationAmount = formLines.reduce((sum, line) => {
    const product = products.find((entry) => entry.id === line.item_id);
    return sum + (Number(product?.price || 0) * Number(line.quantity || 0) * reservationDurationInDays);
  }, 0);
  const estimatedReservationDeposit = formLines.reduce((sum, line) => {
    const product = products.find((entry) => entry.id === line.item_id);
    return sum + (Number(product?.deposit || 0) * Number(line.quantity || 0));
  }, 0);
  const canSubmitReservation =
    Boolean(form.client_id && formLines.some((line) => line.item_id)) &&
    !isCreatingClient &&
    !isSubmittingReservation;

  return (
    <AppShell>
      <div className="page-stack reservations-page">
        <div className="page-header reservations-header">
          <div className="reservations-header-copy">
            <p className="eyebrow">Réservations</p>
            <h3>Un module plus clair pour vos dossiers, documents et encaissements.</h3>
            <p>Retrouvez les dossiers, les documents et les encaissements dans un espace unique et facile à suivre.</p>
          </div>
          <div className="page-header-actions reservations-header-actions">
            <button type="button" className="button ghost" onClick={exportReservations}>
              Export
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setScannerMessage("Connectez votre lecteur pour lancer le scan depuis ce bouton.")}
            >
              Scanner
            </button>
            <button type="button" className="button primary" onClick={openReservationComposer}>
              Nouvelle réservation
            </button>
          </div>
        </div>

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}
        {operationsError ? <p className="feedback error">{operationsError}</p> : null}
        {operationsFeedback ? <p className="feedback success">{operationsFeedback}</p> : null}
        {scannerMessage ? <div className="inline-alert">{scannerMessage}</div> : null}

        <section className="metric-grid reservations-metrics">
          <MetricCard icon="document" label="Demandes" value={workspace.overview.stats.draft_reservations} helper="Brouillons à transformer" tone="warning" />
          <MetricCard icon="calendar" label="Réservations confirmées" value={workspace.reservations.filter((reservation) => reservation.status === "confirmed").length} helper="Locations prêtes à partir" tone="success" />
          <MetricCard icon="euro" label="Montant suivi" value={formatCurrency(workspace.reservations.reduce((sum, reservation) => sum + reservation.total_amount, 0))} helper="TTC réservé sur la base actuelle" tone="info" />
        </section>

        <section className="subnav-layout reservations-layout">
          <SecondaryNav title="Sections" groups={reservationGroups} activeId={section} onChange={setSection} />

          <div className="page-stack">
            {section === "reservations" ? (
              <Panel
                className="reservations-panel"
                title="Liste des réservations"
                description="Recherche client ou produit, filtres utiles et tableau plus respirant."
                actions={
                  <div className="toolbar-group reservations-filter-actions">
                    <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                      <option value="all">Toute période</option>
                      <option value="week">7 prochains jours</option>
                      <option value="month">30 prochains jours</option>
                      <option value="future">À venir</option>
                      <option value="past">Passées</option>
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">Tous les statuts</option>
                      {reservationStatusOptions.map((status) => (
                        <option key={status.code} value={status.code}>
                          {reservationStatusMeta[status.code]?.label || status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <div className="stack">
                  <div className="toolbar-spread reservations-toolbar">
                    <SearchInput className="reservations-search" value={search} onChange={setSearch} placeholder="Rechercher un client ou un produit" />
                    <StatusPill tone="info">{filteredReservations.length} réservation(s)</StatusPill>
                  </div>

                  <DataTable
                    className="reservations-data-table"
                    rows={paginatedReservations}
                    emptyMessage="Aucune réservation sur cette vue."
                    columns={[
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
                      {
                        key: "client",
                        label: "Client",
                        render: (row) => (
                          <div className="table-title">
                            <strong>{row.client_name}</strong>
                            <small>
                              {row.item_summary || row.item_name} · {row.total_quantity} unité(s)
                            </small>
                          </div>
                        ),
                      },
                      {
                        key: "period",
                        label: "Période",
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
                        label: "Dépôt de garantie",
                        render: (row) => formatCurrency(row.deposit),
                      },
                      {
                        key: "actions",
                        label: "Actions",
                        render: (row) => (
                          <div className="row-actions">
                            {row.status === "confirmed" && row.departure_tracking?.status !== "completed" ? (
                              <button
                                type="button"
                                className="action-button"
                                onClick={() => void handleDeparture(row.id)}
                                disabled={workspace.mutating}
                              >
                                Départ
                              </button>
                            ) : null}
                            {row.departure_tracking?.status === "completed" &&
                            row.return_tracking?.status !== "completed" &&
                            row.status !== "cancelled" ? (
                              <button
                                type="button"
                                className="action-button"
                                onClick={() => void handleReturn(row.id)}
                                disabled={workspace.mutating}
                              >
                                Retour
                              </button>
                            ) : null}
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
                className="reservations-panel"
                title="Documents"
                description="Recherche, filtres par période et export propre pour les devis et contrats."
                actions={
                  <div className="toolbar-group">
                    <button type="button" className="button ghost" onClick={exportDocuments}>
                      Exporter
                    </button>
                    <button type="button" className="button secondary" onClick={openQuoteComposer}>
                      Préparer un devis
                    </button>
                  </div>
                }
              >
                <DataTable
                  className="reservations-data-table"
                  rows={workspace.documents}
                  emptyMessage="Aucun document à suivre."
                  columns={[
                    { key: "reference", label: "Référence" },
                    { key: "client", label: "Client" },
                    {
                      key: "quoteStatus",
                      label: "Devis",
                      render: (row) => <StatusPill tone={row.quoteTone || "neutral"}>{row.quoteStatus}</StatusPill>,
                    },
                    {
                      key: "contractStatus",
                      label: "Contrat",
                      render: (row) => <StatusPill tone={row.contractTone || "neutral"}>{row.contractStatus}</StatusPill>,
                    },
                    {
                      key: "inventoryStatus",
                      label: "État des lieux",
                      render: (row) => <StatusPill tone={row.inventoryTone || "neutral"}>{row.inventoryStatus}</StatusPill>,
                    },
                    {
                      key: "invoiceStatus",
                      label: "Facture",
                      render: (row) => <StatusPill tone={row.invoiceTone || "neutral"}>{row.invoiceStatus}</StatusPill>,
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (row) => (
                        <div className="inline-action-list">
                          {ensureArray(row.documents).map((document) => (
                            <button
                              key={document.id}
                              type="button"
                              className="action-button"
                              onClick={() => void openDocumentEditor(document.id)}
                            >
                              {document.title}
                            </button>
                          ))}
                        </div>
                      ),
                    },
                  ]}
                />
              </Panel>
            ) : null}

            {section === "cash" ? (
              <>
                <div className="kpi-band reservations-cash-band">
                  <div className="kpi-tile">
                    <strong>{workspace.cashSummary.pending_revenue_count}</strong>
                    <span>encaissements à suivre</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{workspace.cashSummary.blocked_deposits_count}</strong>
                    <span>dépôts actuellement bloqués</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{workspace.cashSummary.deposits_to_release_count}</strong>
                    <span>garanties à restituer</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{formatCurrency(workspace.cashSummary.tracked_amount)}</strong>
                    <span>montant total suivi</span>
                  </div>
                </div>

                <Panel className="reservations-panel" title="Journal de caisse" description="Un suivi plus propre des montants TTC, non soldés et dépôts.">
                  <DataTable
                    className="reservations-data-table"
                    rows={workspace.cashEntries}
                    emptyMessage="Aucune écriture de caisse pour le moment."
                    columns={[
                      { key: "type", label: "Type" },
                      { key: "label", label: "Référence" },
                      { key: "date", label: "Date", render: (row) => formatDateTime(row.date) },
                      { key: "amount", label: "Montant", render: (row) => formatCurrency(row.amount) },
                      {
                        key: "status",
                        label: "Statut",
                        render: (row) => (
                          <StatusPill tone={row.tone || "neutral"}>
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
          title={editingId ? "Modifier la réservation" : composerIntent === "quote" ? "Préparer un devis" : "Nouvelle réservation"}
          description={
            composerIntent === "quote"
              ? "Créez un devis directement depuis votre base clients et votre catalogue, sans quitter la section documents."
              : "Une création plus propre sans encombrer l'écran principal."
          }
          onClose={resetForm}
        >
          {workspace.loading ? (
            <div className="empty-state">
              <strong>Chargement des données</strong>
              <span>Les clients et le catalogue sont en cours de récupération pour préparer le dossier.</span>
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
                  <option value="">Sélectionnez ou créez un client</option>
                  {workspace.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
                <p className="field-hint">Choisissez un client existant ou ajoutez-en un sans quitter cette réservation.</p>
                {!workspace.clients.length ? (
                  <div className="inline-alert reservation-inline-alert">
                    Aucun client dans la base pour le moment. Créez-en un ici puis poursuivez la réservation.
                  </div>
                ) : null}
                {quickClientError ? <p className="feedback error reservation-inline-feedback">{quickClientError}</p> : null}
                {quickClientFeedback ? <p className="feedback success reservation-inline-feedback">{quickClientFeedback}</p> : null}

                {isClientCreatorOpen ? (
                  <div className="reservation-client-creator">
                    <div className="reservation-client-creator-head">
                      <div>
                        <strong>Nouveau client</strong>
                        <p>Création rapide de la fiche client, avec sélection automatique dans la réservation.</p>
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="quick-client-first-name">Prénom</label>
                        <input
                          id="quick-client-first-name"
                          value={quickClientForm.first_name}
                          onChange={(event) => setQuickClientForm((current) => ({ ...current, first_name: event.target.value }))}
                          onKeyDown={handleQuickClientKeyDown}
                          placeholder="Prénom"
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
                        <label htmlFor="quick-client-phone">Téléphone</label>
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
                        {isCreatingClient ? "Création..." : "Créer et sélectionner"}
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

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Produits du dossier</h4>
                    <p>Ajoutez une ou plusieurs lignes sans quitter la réservation.</p>
                  </div>
                </div>

                <div className="stack">
                  {formLines.map((line, index) => {
                    const selectedProduct = workspace.products.find((product) => product.id === line.item_id);

                    return (
                      <div key={`reservation-line-${index}`} className="form-grid two-columns">
                        <div className="field">
                          <label htmlFor={`reservation-product-${index}`}>Produit {index + 1}</label>
                          <select
                            id={`reservation-product-${index}`}
                            value={line.item_id}
                            onChange={(event) => updateReservationLine(index, "item_id", event.target.value)}
                          >
                            <option value="">Sélectionner un produit</option>
                            {workspace.products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.category})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label htmlFor={`reservation-quantity-${index}`}>Quantité</label>
                          <div className="row-actions">
                            <input
                              id={`reservation-quantity-${index}`}
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(event) => updateReservationLine(index, "quantity", event.target.value)}
                            />
                            <button
                              type="button"
                              className="button ghost"
                              onClick={() => removeReservationLine(index)}
                              disabled={formLines.length === 1}
                            >
                              Retirer
                            </button>
                          </div>
                          {selectedProduct ? (
                            <p className="field-hint">
                              {formatCurrency(selectedProduct.price)} / jour · dépôt {formatCurrency(selectedProduct.deposit)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button type="button" className="button ghost" onClick={addReservationLine}>
                  + Ajouter un produit
                </button>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="reservation-start">Début</label>
                  <input id="reservation-start" type="datetime-local" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} />
                </div>
                <div className="field">
                  <label htmlFor="reservation-end">Fin</label>
                  <input id="reservation-end" type="datetime-local" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
                </div>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="reservation-source">Source</label>
                  <select
                    id="reservation-source"
                    value={composerIntent === "quote" ? "quote" : form.source}
                    onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
                    disabled={composerIntent === "quote"}
                  >
                    <option value="manual">Saisie manuelle</option>
                    <option value="phone">Téléphone</option>
                    <option value="web">Boutique / web</option>
                    <option value="marketplace">Partenaire</option>
                    <option value="quote">Devis</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reservation-fulfillment">Logistique</label>
                  <select
                    id="reservation-fulfillment"
                    value={form.fulfillment_mode}
                    onChange={(event) => setForm((current) => ({ ...current, fulfillment_mode: event.target.value }))}
                  >
                    <option value="pickup">Retrait dépôt</option>
                    <option value="delivery">Livraison</option>
                    <option value="onsite">Intervention sur site</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="reservation-status">Statut</label>
                <select id="reservation-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  {reservationStatusOptions.map((status) => (
                    <option key={status.code} value={status.code}>
                      {reservationStatusMeta[status.code]?.label || status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="reservation-notes">Notes</label>
                <textarea id="reservation-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes opérationnelles, consignes client, logistique..." />
              </div>

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Caution manuelle</h4>
                    <p>La caution reste suivie à part, sans être mélangée au montant de location.</p>
                  </div>
                  <StatusPill
                    tone={reservationDepositStatusMeta[form.deposit.manual_status]?.tone || "neutral"}
                    color={reservationDepositStatusMeta[form.deposit.manual_status]?.color}
                  >
                    {reservationDepositStatusMeta[form.deposit.manual_status]?.label || form.deposit.manual_status}
                  </StatusPill>
                </div>

                <div className="kpi-band">
                  <div className="kpi-tile">
                    <strong>{formatCurrency(estimatedReservationDeposit)}</strong>
                    <span>caution calculée</span>
                  </div>
                  <div className="kpi-tile">
                    <strong>{form.deposit.handling_mode === "manual" ? "Manuelle" : "Paiement intégré"}</strong>
                    <span>mode de gestion</span>
                  </div>
                </div>

                <div className="form-grid two-columns">
                  <div className="field">
                    <label htmlFor="reservation-deposit-status">Statut de caution</label>
                    <select
                      id="reservation-deposit-status"
                      value={estimatedReservationDeposit > 0 ? form.deposit.manual_status : "not_required"}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deposit: {
                            ...current.deposit,
                            manual_status: event.target.value,
                          },
                        }))
                      }
                      disabled={estimatedReservationDeposit <= 0}
                    >
                      {Object.entries(reservationDepositStatusMeta).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="reservation-deposit-method">Mode de remise</label>
                    <input
                      id="reservation-deposit-method"
                      value={form.deposit.manual_method}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deposit: {
                            ...current.deposit,
                            manual_method: event.target.value,
                          },
                        }))
                      }
                      placeholder="Chèque, espèces, TPE, virement..."
                      disabled={estimatedReservationDeposit <= 0}
                    />
                  </div>
                </div>

                <div className="form-grid two-columns">
                  <div className="field">
                    <label htmlFor="reservation-deposit-reference">Référence caution</label>
                    <input
                      id="reservation-deposit-reference"
                      value={form.deposit.manual_reference}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deposit: {
                            ...current.deposit,
                            manual_reference: event.target.value,
                          },
                        }))
                      }
                      placeholder="No chèque, preuve TPE, référence ou remarque..."
                      disabled={estimatedReservationDeposit <= 0}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="reservation-deposit-notes">Notes caution</label>
                    <input
                      id="reservation-deposit-notes"
                      value={form.deposit.notes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deposit: {
                            ...current.deposit,
                            notes: event.target.value,
                          },
                        }))
                      }
                      placeholder="Infos de remise ou restitution"
                      disabled={estimatedReservationDeposit <= 0}
                    />
                  </div>
                </div>
              </div>

              <div className="kpi-band">
                <div className="kpi-tile">
                  <strong>{formLines.filter((line) => line.item_id).length}</strong>
                  <span>ligne(s) produit</span>
                </div>
                <div className="kpi-tile">
                  <strong>{reservationDurationInDays}</strong>
                  <span>jour(s) facturés</span>
                </div>
                <div className="kpi-tile">
                  <strong>{formatCurrency(estimatedReservationAmount)}</strong>
                  <span>montant estimé</span>
                </div>
                <div className="kpi-tile">
                  <strong>{formatCurrency(estimatedReservationDeposit)}</strong>
                  <span>dépôt visible</span>
                </div>
              </div>

              {!form.client_id ? (
                <div className="inline-alert reservation-inline-alert">
                  Sélectionnez un client existant ou créez-en un nouveau pour finaliser la réservation.
                </div>
              ) : null}

              <div className="row-actions">
                <button type="submit" className="button primary" disabled={!canSubmitReservation}>
                  {isSubmittingReservation ? "Enregistrement..." : editingId ? "Sauvegarder" : composerIntent === "quote" ? "Créer le devis" : "Créer la réservation"}
                </button>
                <button type="button" className="button ghost" onClick={resetForm}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <strong>Catalogue insuffisant</strong>
              <span>Ajoutez au moins un produit pour créer une réservation. Les clients peuvent maintenant être créés directement ici.</span>
            </div>
          )}
        </ModalShell>

        <ModalShell
          open={Boolean(activeDocument) || documentLoading}
          title={
            activeDocument ? `${activeDocument.type_label} ${activeDocument.reference}` : "Document réservation"
          }
          description={
            activeDocument
              ? `Document lié à ${activeDocument.reservation?.reference} pour ${activeDocument.reservation?.client_name}.`
              : ""
          }
          size="xl"
          onClose={closeDocumentEditor}
          footer={
            activeDocument ? (
              <div className="row-actions">
                <button type="button" className="button ghost" onClick={openDocumentPreview}>
                  Ouvrir
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void handleDocumentSave()}
                  disabled={documentSaving}
                >
                  {documentSaving ? "Enregistrement..." : "Sauvegarder"}
                </button>
              </div>
            ) : null
          }
        >
          {documentLoading ? (
            <div className="empty-state">
              <strong>Chargement du document</strong>
              <span>Le contenu du document est en cours de récupération.</span>
            </div>
          ) : activeDocument ? (
            <div className="stack document-editor-stack">
              {documentError ? <p className="feedback error">{documentError}</p> : null}
              {documentFeedback ? <p className="feedback success">{documentFeedback}</p> : null}

              <div className="kpi-band">
                <div className="kpi-tile">
                  <strong>{activeDocument.reservation?.reference}</strong>
                  <span>dossier lie</span>
                </div>
                <div className="kpi-tile">
                  <strong>{activeDocument.reservation?.item_summary}</strong>
                  <span>resume produit</span>
                </div>
                <div className="kpi-tile">
                  <strong>{formatCurrency(activeDocument.amount)}</strong>
                  <span>location</span>
                </div>
                <div className="kpi-tile">
                  <strong>{formatCurrency(activeDocument.deposit_amount)}</strong>
                  <span>caution separee</span>
                </div>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="document-title">Titre</label>
                  <input
                    id="document-title"
                    value={documentDraft.title}
                    onChange={(event) =>
                      setDocumentDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="document-status">Statut</label>
                  <select
                    id="document-status"
                    value={documentDraft.status}
                    onChange={(event) =>
                      setDocumentDraft((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    {ensureArray(activeDocument.status_options).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="document-reference">Référence</label>
                  <input id="document-reference" value={activeDocument.reference} readOnly />
                </div>
                <div className="field">
                  <label htmlFor="document-due-at">Date cle</label>
                  <input
                    id="document-due-at"
                    type="datetime-local"
                    value={documentDraft.due_at}
                    onChange={(event) =>
                      setDocumentDraft((current) => ({
                        ...current,
                        due_at: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="document-content">Contenu du document</label>
                <textarea
                  id="document-content"
                  className="document-editor-textarea"
                  value={documentDraft.content_text}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({
                      ...current,
                      content_text: event.target.value,
                    }))
                  }
                  placeholder="Contenu libre du document"
                />
              </div>

              <div className="field">
                <label htmlFor="document-notes">Notes de suivi</label>
                <textarea
                  id="document-notes"
                  value={documentDraft.notes}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Consignes, suivi ou informations complementaires"
                />
              </div>
            </div>
          ) : null}
        </ModalShell>
      </div>
    </AppShell>
  );
}
