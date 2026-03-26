"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import MetricCard from "../../components/metric-card";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import Pagination from "../../components/pagination";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import {
  DEFAULT_CLIENT_COUNTRY,
  DEFAULT_CLIENT_COUNTRY_CODE,
  formatClientPhone,
  getCountryOptionByName,
  getCountrySelectOptions,
  getCountrySelectValue,
  isLegacyCountryValue,
  resolveClientPhoneFields,
} from "../../lib/client-country";
import { downloadCsv } from "../../lib/csv";
import { readClientProfiles, saveClientProfile } from "../../lib/workspace-store";

const pageSize = 8;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const createEmptyClientForm = () => ({
  avatar_data: "",
  client_type: "Particulier",
  first_name: "",
  last_name: "",
  phone: "",
  country: DEFAULT_CLIENT_COUNTRY,
  country_code: DEFAULT_CLIENT_COUNTRY_CODE,
  email: "",
  notes: "",
  address: "",
  postal_code: "",
  city: "",
  newsletter_opt_in: false,
});

const getProfileField = (profile, key, fallback = "") => (hasOwn(profile, key) ? profile[key] : fallback);

const resolveClientFormContact = (profile, client) => {
  const contact = resolveClientPhoneFields({
    country: getProfileField(profile, "country"),
    country_code: getProfileField(profile, "country_code"),
    phone: getProfileField(profile, "phone", client.phone || ""),
  });

  return {
    country: contact.country || (contact.country_code === DEFAULT_CLIENT_COUNTRY_CODE ? DEFAULT_CLIENT_COUNTRY : ""),
    country_code: contact.country_code,
    phone_number: contact.phone_number,
  };
};

const buildDisplayAddress = (client, profile = {}) => {
  const baseAddress = profile.address || client.address || "";
  const cityLine = [profile.postal_code, profile.city].filter(Boolean).join(" ");
  return [baseAddress, cityLine].filter(Boolean).join(", ") || client.address || "Adresse a renseigner";
};

export default function ClientsPage() {
  const workspace = useLokifyWorkspace();
  const [clientProfiles, setClientProfiles] = useState({});
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(createEmptyClientForm);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    setClientProfiles(readClientProfiles());
  }, []);

  useEffect(() => {
    setPage(1);
  }, [segmentFilter, deferredSearch]);

  const enrichedClients = workspace.clients.map((client) => {
    const profile = clientProfiles[client.id] || {};
    const contact = resolveClientFormContact(profile, client);

    return {
      ...client,
      avatar_data: profile.avatar_data || "",
      client_type: profile.client_type || client.segment,
      country: contact.country,
      country_code: contact.country_code,
      phone_number: contact.phone_number,
      address_line: profile.address || client.address || "",
      postal_code: profile.postal_code || "",
      city: profile.city || "",
      newsletter_opt_in: Boolean(profile.newsletter_opt_in),
      display_address: buildDisplayAddress(client, profile),
    };
  });

  const filteredClients = enrichedClients.filter((client) => {
    if (segmentFilter !== "all" && client.client_type !== segmentFilter) {
      return false;
    }

    if (!deferredSearch) {
      return true;
    }

    return [client.full_name, client.email, client.phone_number, client.display_address]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  const paginatedClients = filteredClients.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));

  const resetForm = () => {
    setEditingId(null);
    setForm(createEmptyClientForm());
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(createEmptyClientForm());
    setIsModalOpen(true);
  };

  const startEdit = (client) => {
    setEditingId(client.id);
    setForm({
      avatar_data: client.avatar_data || "",
      client_type: client.client_type || client.segment || "Particulier",
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone_number || "",
      country: client.country || (client.country_code === DEFAULT_CLIENT_COUNTRY_CODE ? DEFAULT_CLIENT_COUNTRY : ""),
      country_code: client.country_code || DEFAULT_CLIENT_COUNTRY_CODE,
      email: client.email,
      notes: client.notes || "",
      address: client.address_line || client.address || "",
      postal_code: client.postal_code || "",
      city: client.city || "",
      newsletter_opt_in: Boolean(client.newsletter_opt_in),
    });
    setIsModalOpen(true);
  };

  const handleAvatarChange = async (file) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        avatar_data: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleCountryChange = (value) => {
    if (isLegacyCountryValue(value)) {
      return;
    }

    const selectedCountry = getCountryOptionByName(value);

    if (!selectedCountry) {
      return;
    }

    setForm((current) => ({
      ...current,
      country: selectedCountry.label,
      country_code: selectedCountry.code,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      const selectedCountry = getCountryOptionByName(form.country);
      const countryCode = selectedCountry?.code || form.country_code || DEFAULT_CLIENT_COUNTRY_CODE;
      const country = selectedCountry?.label || (countryCode === DEFAULT_CLIENT_COUNTRY_CODE ? DEFAULT_CLIENT_COUNTRY : "");

      const response = await workspace.saveClient(
        {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: formatClientPhone(countryCode, form.phone),
          address: [form.address, [form.postal_code, form.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          notes: form.notes,
        },
        editingId
      );

      const savedClientId = response?.client?.id || editingId;
      const nextProfiles = saveClientProfile(savedClientId, {
        avatar_data: form.avatar_data,
        client_type: form.client_type,
        phone: form.phone,
        country,
        country_code: countryCode,
        address: form.address,
        postal_code: form.postal_code,
        city: form.city,
        newsletter_opt_in: form.newsletter_opt_in,
      });

      setClientProfiles(nextProfiles);
      setFeedback(editingId ? "Client mis a jour." : "Client ajoute.");
      resetForm();
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm("Supprimer ce client ?")) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.deleteClient(clientId);
      setFeedback("Client supprime.");
      if (editingId === clientId) {
        resetForm();
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const exportClients = () => {
    downloadCsv(
      "lokify-clients.csv",
      [
        { label: "Type", value: (row) => row.client_type },
        { label: "Nom", value: (row) => row.full_name },
        { label: "Email", value: (row) => row.email },
        { label: "Telephone", value: (row) => formatClientPhone(row.country_code, row.phone_number) },
        { label: "Adresse", value: (row) => row.display_address },
      ],
      filteredClients
    );
  };

  const countrySelectOptions = getCountrySelectOptions(form.country_code);
  const countrySelectValue = getCountrySelectValue(form.country, form.country_code);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Clients</p>
            <h3>Vos clients</h3>
            <p>Un annuaire plus simple, plus large et plus fluide, avec une vraie modale de creation et d'edition.</p>
          </div>
          <div className="page-header-actions">
            <button type="button" className="button ghost" onClick={exportClients}>
              Export CSV
            </button>
            <button type="button" className="button primary" onClick={openCreateModal}>
              + Client
            </button>
          </div>
        </div>

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <section className="metric-grid">
          <MetricCard icon="users" label="Clients suivis" value={workspace.clients.length} helper="Base exploitable pour les reservations" tone="info" />
          <MetricCard icon="catalog" label="Professionnels" value={enrichedClients.filter((client) => client.client_type === "Professionnel").length} helper="Agences, entreprises, associations" tone="success" />
          <MetricCard icon="calendar" label="Clients actifs" value={workspace.clients.filter((client) => client.reservationCount > 0).length} helper="Au moins une reservation rattachee" tone="warning" />
        </section>

        <Panel
          title="Annuaire clients"
          description="Recherche, export et actions rapides dans une page plus aeree."
          actions={
            <div className="toolbar-group">
              <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}>
                <option value="all">Tous les types</option>
                <option value="Professionnel">Professionnels</option>
                <option value="Particulier">Particuliers</option>
              </select>
            </div>
          }
        >
          <div className="stack">
            <div className="toolbar-spread">
              <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par nom, email ou telephone" />
              <StatusPill tone="info">{filteredClients.length} client(s)</StatusPill>
            </div>

            <DataTable
              rows={paginatedClients}
              emptyMessage="Aucun client sur cette vue."
              columns={[
                {
                  key: "name",
                  label: "Nom",
                  render: (row) => (
                    <div className="table-visual">
                      <div className="table-visual-thumb">
                        {row.avatar_data ? <img src={row.avatar_data} alt={row.full_name} /> : row.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="table-title">
                        <strong>{row.full_name}</strong>
                        <small>{row.display_address}</small>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "email",
                  label: "Email",
                  render: (row) => row.email,
                },
                {
                  key: "phone",
                  label: "Telephone",
                  render: (row) => formatClientPhone(row.country_code, row.phone_number),
                },
                {
                  key: "type",
                  label: "Type",
                  render: (row) => (
                    <StatusPill tone={row.client_type === "Professionnel" ? "info" : "neutral"}>
                      {row.client_type}
                    </StatusPill>
                  ),
                },
                {
                  key: "actions",
                  label: "Action",
                  render: (row) => (
                    <div className="row-actions">
                      <Link href={`/clients/${row.id}`} className="action-button">
                        Voir
                      </Link>
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

        <ModalShell
          open={isModalOpen}
          title={editingId ? "Modifier le client" : "Nouveau client"}
          description="Une fiche plus complete, mais toujours simple a renseigner."
          size="xl"
          onClose={resetForm}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="avatar-stack">
              <div className="avatar-preview">
                {form.avatar_data ? <img src={form.avatar_data} alt="Avatar client" /> : `${form.first_name.slice(0, 1)}${form.last_name.slice(0, 1)}`.trim() || "LK"}
              </div>
              <div className="stack">
                <label className="button ghost" htmlFor="client-avatar">
                  Photo / avatar
                </label>
                <input id="client-avatar" type="file" accept="image/*" hidden onChange={(event) => handleAvatarChange(event.target.files?.[0])} />
                <p className="field-hint">Optionnel. Un apercu propre est conserve pour la fiche client.</p>
              </div>
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="client-type">Type de client</label>
                <select id="client-type" value={form.client_type} onChange={(event) => setForm((current) => ({ ...current, client_type: event.target.value }))}>
                  <option value="Particulier">Particulier</option>
                  <option value="Professionnel">Professionnel</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="client-country">Pays</label>
                <select id="client-country" value={countrySelectValue} onChange={(event) => handleCountryChange(event.target.value)}>
                  {countrySelectOptions.map((option) => (
                    <option key={`${option.value}-${option.code}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="client-first-name">Prenom</label>
                <input id="client-first-name" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
              </div>
              <div className="field">
                <label htmlFor="client-last-name">Nom</label>
                <input id="client-last-name" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
              </div>
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="client-phone">Telephone</label>
                <input id="client-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="client-email">Email</label>
                <input id="client-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </div>
            </div>

            <div className="field">
              <label htmlFor="client-address">Adresse</label>
              <input id="client-address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rue, batiment, complement..." />
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="client-postal-code">Code postal</label>
                <input id="client-postal-code" value={form.postal_code} onChange={(event) => setForm((current) => ({ ...current, postal_code: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="client-city">Ville</label>
                <input id="client-city" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="client-notes">Note interne</label>
              <textarea id="client-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Preferences, contexte, besoins recurrents..." />
            </div>

            <label className="detail-card">
              <strong>Newsletter</strong>
              <div className="row-actions">
                <input type="checkbox" checked={form.newsletter_opt_in} onChange={(event) => setForm((current) => ({ ...current, newsletter_opt_in: event.target.checked }))} />
                <span className="muted-text">Le client accepte de recevoir les actualites ou offres.</span>
              </div>
            </label>

            <div className="row-actions">
              <button type="submit" className="button primary" disabled={workspace.mutating}>
                {workspace.mutating ? "Enregistrement..." : editingId ? "Sauvegarder" : "Creer le client"}
              </button>
              <button type="button" className="button ghost" onClick={resetForm}>
                Annuler
              </button>
            </div>
          </form>
        </ModalShell>
      </div>
    </AppShell>
  );
}
