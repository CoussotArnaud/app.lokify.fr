"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import AppShell from "../../components/app-shell";
import Icon from "../../components/icon";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { formatDateTime } from "../../lib/date";
import {
  getSupportCategoryLabel,
  getSupportNotificationMeta,
  getSupportTicketStatusMeta,
} from "../../lib/provider-admin";

const emptyTicketForm = {
  subject: "",
  category: "general",
  message: "",
};

const emptyReplyForm = {
  message: "",
  status: "in_progress",
};

function SupportPageFallback() {
  return (
    <AppShell>
      <div className="page-stack">
        <Panel
          title="Chargement du support"
          description="LOKIFY prepare les tickets, notifications et outils de support."
        >
          <div className="empty-state">
            <strong>Ouverture du centre de support</strong>
            <span>Les tickets et notifications arrivent dans quelques instants.</span>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function SupportPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.account_role === "super_admin";
  const [overview, setOverview] = useState({
    metrics: null,
    notifications: [],
    providers: [],
    tickets: [],
  });
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [ticketForm, setTicketForm] = useState(emptyTicketForm);
  const [replyForm, setReplyForm] = useState(emptyReplyForm);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [providerFilter, setProviderFilter] = useState(searchParams.get("providerId") || "");

  const loadOverview = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingOverview(true);
    }

    try {
      const response = await apiRequest("/support/overview");
      const nextOverview = {
        metrics: response.metrics || null,
        notifications: response.notifications || [],
        providers: response.providers || [],
        tickets: response.tickets || [],
      };

      setOverview(nextOverview);
      setSelectedTicketId((current) => {
        const requestedTicketId = searchParams.get("ticketId") || "";

        if (
          requestedTicketId &&
          nextOverview.tickets.some((ticket) => ticket.id === requestedTicketId)
        ) {
          return requestedTicketId;
        }

        if (current && nextOverview.tickets.some((ticket) => ticket.id === current)) {
          return current;
        }

        return nextOverview.tickets[0]?.id || "";
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      if (!silent) {
        setLoadingOverview(false);
      }
    }
  };

  const loadTicketDetail = async (ticketId) => {
    if (!ticketId) {
      setSelectedTicket(null);
      return;
    }

    setLoadingTicket(true);

    try {
      const response = await apiRequest(`/support/tickets/${ticketId}`);
      setSelectedTicket(response.ticket || null);
      setReplyForm((current) => ({
        ...current,
        status: response.ticket?.status === "closed" ? "closed" : "in_progress",
      }));
      await loadOverview({ silent: true });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoadingTicket(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    setStatusFilter(searchParams.get("status") || "all");
    setProviderFilter(searchParams.get("providerId") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!selectedTicketId) {
      setSelectedTicket(null);
      return;
    }

    loadTicketDetail(selectedTicketId);
  }, [selectedTicketId]);

  const visibleTickets = useMemo(
    () =>
      (overview.tickets || []).filter((ticket) => {
        if (statusFilter !== "all" && ticket.status !== statusFilter) {
          return false;
        }

        if (providerFilter && ticket.provider?.id !== providerFilter) {
          return false;
        }

        return true;
      }),
    [overview.tickets, providerFilter, statusFilter]
  );

  const handleCreateTicket = async (event) => {
    event.preventDefault();
    setCreatingTicket(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/support/tickets", {
        method: "POST",
        body: ticketForm,
      });

      setTicketForm(emptyTicketForm);
      setSelectedTicketId(response.ticket?.id || "");
      setSelectedTicket(response.ticket || null);
      await loadOverview({ silent: true });
      setFeedback({
        type: "success",
        message: "La demande de support a bien ete creee.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleReply = async (event) => {
    event.preventDefault();

    if (!selectedTicketId) {
      return;
    }

    setReplying(true);
    setFeedback(null);

    try {
      const response = await apiRequest(`/support/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        body: isAdmin
          ? { message: replyForm.message, status: replyForm.status }
          : { message: replyForm.message },
      });

      setSelectedTicket(response.ticket || null);
      setReplyForm((current) => ({
        ...current,
        message: "",
        status: response.ticket?.status === "closed" ? "closed" : current.status,
      }));
      await loadOverview({ silent: true });
      setFeedback({
        type: "success",
        message: isAdmin
          ? "La reponse support a ete envoyee."
          : "Votre reponse a bien ete enregistree.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setReplying(false);
    }
  };

  const handleStatusUpdate = async (nextStatus) => {
    if (!selectedTicketId) {
      return;
    }

    setStatusUpdating(true);
    setFeedback(null);

    try {
      const response = await apiRequest(`/support/tickets/${selectedTicketId}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });

      setSelectedTicket(response.ticket || null);
      setReplyForm((current) => ({ ...current, status: nextStatus }));
      await loadOverview({ silent: true });
      setFeedback({
        type: "success",
        message: "Le statut du ticket a ete mis a jour.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleNotificationRead = async (notificationId) => {
    try {
      await apiRequest(`/support/notifications/${notificationId}/read`, {
        method: "POST",
      });
      await loadOverview({ silent: true });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    }
  };

  const selectedTicketStatusMeta = getSupportTicketStatusMeta(selectedTicket?.status);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">{isAdmin ? "Super admin" : "Support"}</p>
            <h3>
              {isAdmin
                ? "Pilotez les demandes prestataires et l'assistance SaaS."
                : "Ouvrez et suivez vos demandes de support Lokify."}
            </h3>
            <p>
              {isAdmin
                ? "Vue complete des tickets, des reponses et des notifications sans quitter le super admin."
                : "Le support reste separe de la facturation et des operations, avec un suivi simple et lisible."}
            </p>
          </div>
          <div className="page-header-actions">
            {!isAdmin ? (
              <Link href="/abonnement" className="button ghost">
                Facturation / abonnement
              </Link>
            ) : null}
          </div>
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        <section className="detail-grid">
          <article className="detail-card">
            <strong>{overview.metrics?.totalTickets || 0}</strong>
            <span className="muted-text">ticket(s) au total</span>
          </article>
          <article className="detail-card">
            <strong>{overview.metrics?.openTickets || 0}</strong>
            <span className="muted-text">ouvert(s)</span>
          </article>
          <article className="detail-card">
            <strong>{overview.metrics?.inProgressTickets || 0}</strong>
            <span className="muted-text">en cours</span>
          </article>
          <article className="detail-card">
            <strong>{overview.metrics?.closedTickets || 0}</strong>
            <span className="muted-text">ferme(s)</span>
          </article>
          <article className="detail-card">
            <strong>{overview.metrics?.unreadNotifications || 0}</strong>
            <span className="muted-text">notification(s) non lues</span>
          </article>
        </section>

        <div className="support-workspace">
          <div className="support-sidebar">
            {!isAdmin ? (
              <Panel
                title="Nouvelle demande"
                description="Creez une demande claire pour accelerer la prise en charge."
              >
                <form className="form-grid" onSubmit={handleCreateTicket}>
                  <div className="field">
                    <label htmlFor="support-subject">Sujet</label>
                    <input
                      id="support-subject"
                      value={ticketForm.subject}
                      onChange={(event) =>
                        setTicketForm((current) => ({
                          ...current,
                          subject: event.target.value,
                        }))
                      }
                      placeholder="Ex. Question sur mon abonnement"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="support-category">Categorie</label>
                    <select
                      id="support-category"
                      value={ticketForm.category}
                      onChange={(event) =>
                        setTicketForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    >
                      <option value="general">General</option>
                      <option value="billing">Abonnement</option>
                      <option value="technical">Technique</option>
                      <option value="catalog">Catalogue</option>
                      <option value="training">Accompagnement</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="support-message">Premier message</label>
                    <textarea
                      id="support-message"
                      rows={4}
                      value={ticketForm.message}
                      onChange={(event) =>
                        setTicketForm((current) => ({
                          ...current,
                          message: event.target.value,
                        }))
                      }
                      placeholder="Decrivez votre besoin, le contexte et le blocage."
                      required
                    />
                  </div>

                  <div className="row-actions">
                    <button type="submit" className="button primary" disabled={creatingTicket}>
                      {creatingTicket ? "Creation..." : "Creer la demande"}
                    </button>
                  </div>
                </form>
              </Panel>
            ) : (
              <Panel
                title="Filtres support"
                description="Filtrez rapidement les tickets par statut et par prestataire."
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="support-status-filter">Statut</label>
                    <select
                      id="support-status-filter"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="open">Ouverts</option>
                      <option value="in_progress">En cours</option>
                      <option value="closed">Fermes</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="support-provider-filter">Prestataire</label>
                    <select
                      id="support-provider-filter"
                      value={providerFilter}
                      onChange={(event) => setProviderFilter(event.target.value)}
                    >
                      <option value="">Tous les prestataires</option>
                      {(overview.providers || []).map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </Panel>
            )}

            <Panel
              title="Notifications"
              description="Lecture rapide des nouveaux tickets et reponses a traiter."
            >
              <div className="stack">
                {(overview.notifications || []).length ? (
                  overview.notifications.map((notification) => {
                    const notificationMeta = getSupportNotificationMeta(
                      notification.notification_type
                    );

                    return (
                      <article key={notification.id} className="detail-card support-notification-card">
                        <div className="row-actions">
                          <StatusPill tone={notificationMeta.tone}>
                            {notificationMeta.label}
                          </StatusPill>
                          {!notification.read_at ? (
                            <button
                              type="button"
                              className="button ghost"
                              onClick={() => handleNotificationRead(notification.id)}
                            >
                              Marquer lu
                            </button>
                          ) : null}
                        </div>
                        <strong>{notification.title}</strong>
                        <span className="muted-text">{notification.body}</span>
                        <span className="muted-text">{formatDateTime(notification.created_at)}</span>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <strong>Aucune notification</strong>
                    <span>Les prochains mouvements support apparaitront ici.</span>
                  </div>
                )}
              </div>
            </Panel>

            <Panel
              title="Tickets"
              description={
                loadingOverview
                  ? "Chargement des tickets..."
                  : `${visibleTickets.length} ticket(s) visible(s) dans cette vue.`
              }
            >
              <div className="stack support-ticket-list">
                {visibleTickets.length ? (
                  visibleTickets.map((ticket) => {
                    const statusMeta = getSupportTicketStatusMeta(ticket.status);
                    const isActive = ticket.id === selectedTicketId;

                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        className={`support-ticket-item ${isActive ? "active" : ""}`.trim()}
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        <div className="row-actions">
                          <strong>{ticket.reference}</strong>
                          <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
                        </div>
                        <span className="muted-text">{ticket.subject}</span>
                        <span className="muted-text">
                          {isAdmin ? `${ticket.provider?.full_name} · ` : ""}
                          {getSupportCategoryLabel(ticket.category)}
                        </span>
                        <span className="muted-text">
                          Dernier message {formatDateTime(ticket.last_message_at)}
                        </span>
                        {ticket.unread_notifications ? (
                          <span className="tag-chip">
                            {ticket.unread_notifications} nouveau(x)
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <strong>Aucun ticket a afficher</strong>
                    <span>Ajustez les filtres ou creez une nouvelle demande.</span>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="support-thread-column">
            <Panel
              title={selectedTicket ? selectedTicket.subject : "Detail du ticket"}
              description={
                selectedTicket
                  ? `${selectedTicket.reference} · ${getSupportCategoryLabel(selectedTicket.category)}`
                  : "Selectionnez un ticket pour ouvrir la conversation."
              }
              actions={
                selectedTicket ? (
                  <div className="row-actions">
                    <StatusPill tone={selectedTicketStatusMeta.tone}>
                      {selectedTicketStatusMeta.label}
                    </StatusPill>
                    {selectedTicket?.provider && isAdmin ? (
                      <Link
                        href={`/abonnements/${selectedTicket.provider.id}`}
                        className="button ghost"
                      >
                        Voir la fiche prestataire
                      </Link>
                    ) : null}
                  </div>
                ) : null
              }
            >
              {!selectedTicketId ? (
                <div className="empty-state">
                  <strong>Aucun ticket selectionne</strong>
                  <span>Choisissez un ticket dans la liste pour afficher l'historique.</span>
                </div>
              ) : loadingTicket && !selectedTicket ? (
                <div className="empty-state">
                  <strong>Chargement du ticket</strong>
                  <span>La conversation se charge.</span>
                </div>
              ) : selectedTicket ? (
                <div className="stack">
                  <div className="detail-grid">
                    <article className="detail-card">
                      <strong>Prestataire</strong>
                      <span className="muted-text">
                        {selectedTicket.provider?.full_name || "Non renseigne"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Creation</strong>
                      <span className="muted-text">
                        {formatDateTime(selectedTicket.created_at)}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Derniere activite</strong>
                      <span className="muted-text">
                        {formatDateTime(selectedTicket.last_message_at)}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Messages</strong>
                      <span className="muted-text">
                        {(selectedTicket.messages || []).length} element(s)
                      </span>
                    </article>
                  </div>

                  {isAdmin ? (
                    <div className="row-actions support-status-actions">
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => handleStatusUpdate("open")}
                        disabled={statusUpdating || selectedTicket.status === "open"}
                      >
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => handleStatusUpdate("in_progress")}
                        disabled={statusUpdating || selectedTicket.status === "in_progress"}
                      >
                        En cours
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => handleStatusUpdate("closed")}
                        disabled={statusUpdating || selectedTicket.status === "closed"}
                      >
                        Fermer
                      </button>
                    </div>
                  ) : null}

                  <div className="support-thread">
                    {(selectedTicket.messages || []).map((message) => {
                      const messageFromAdmin = message.author_role === "super_admin";

                      return (
                        <article
                          key={message.id}
                          className={`support-message ${messageFromAdmin ? "admin" : "provider"}`.trim()}
                        >
                          <div className="row-actions">
                            <strong>{message.author?.full_name || "Lokify"}</strong>
                            <span className="muted-text">
                              {messageFromAdmin ? "Support" : "Prestataire"} ·{" "}
                              {formatDateTime(message.created_at)}
                            </span>
                          </div>
                          <p>{message.body}</p>
                        </article>
                      );
                    })}
                  </div>

                  <form className="form-grid" onSubmit={handleReply}>
                    {isAdmin ? (
                      <div className="field">
                        <label htmlFor="support-reply-status">Statut apres reponse</label>
                        <select
                          id="support-reply-status"
                          value={replyForm.status}
                          onChange={(event) =>
                            setReplyForm((current) => ({
                              ...current,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="open">Ouvert</option>
                          <option value="in_progress">En cours</option>
                          <option value="closed">Ferme</option>
                        </select>
                      </div>
                    ) : null}

                    <div className="field">
                      <label htmlFor="support-reply-message">
                        {isAdmin ? "Reponse support" : "Votre reponse"}
                      </label>
                      <textarea
                        id="support-reply-message"
                        rows={4}
                        value={replyForm.message}
                        onChange={(event) =>
                          setReplyForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        placeholder={
                          isAdmin
                            ? "Apportez une reponse claire au prestataire."
                            : "Ajoutez un complement d'information."
                        }
                        required
                      />
                    </div>

                    <div className="row-actions">
                      <button type="submit" className="button primary" disabled={replying}>
                        {replying
                          ? "Envoi..."
                          : isAdmin
                            ? "Envoyer la reponse"
                            : "Envoyer ma reponse"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Ticket indisponible</strong>
                  <span>Selectionnez un ticket pour ouvrir la conversation.</span>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<SupportPageFallback />}>
      <SupportPageContent />
    </Suspense>
  );
}
