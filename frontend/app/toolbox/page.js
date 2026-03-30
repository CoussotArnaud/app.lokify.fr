"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import ModuleCard from "../../components/module-card";
import Panel from "../../components/panel";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { apiRequest } from "../../lib/api";
import { formatDateTime } from "../../lib/date";
import { toolboxTabs } from "../../lib/lokify-data";

export default function ToolboxPage() {
  const workspace = useLokifyWorkspace();
  const [activeTab, setActiveTab] = useState("all");
  const [enabledTools, setEnabledTools] = useState({});
  const [eventFeed, setEventFeed] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  useEffect(() => {
    if (workspace.toolboxModules.length && !Object.keys(enabledTools).length) {
      setEnabledTools(
        workspace.toolboxModules.reduce(
          (accumulator, module) => ({
            ...accumulator,
            [module.id]: module.enabled,
          }),
          {}
        )
      );
    }
  }, [workspace.toolboxModules, enabledTools]);

  useEffect(() => {
    let cancelled = false;

    const loadEventFeed = async () => {
      setEventsLoading(true);
      setEventsError("");

      try {
        const response = await apiRequest("/domain-events?limit=10");

        if (!cancelled) {
          setEventFeed(response.events || []);
        }
      } catch (error) {
        if (!cancelled) {
          setEventsError(error.message || "Impossible de charger les evenements metier.");
        }
      } finally {
        if (!cancelled) {
          setEventsLoading(false);
        }
      }
    };

    void loadEventFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredModules = workspace.toolboxModules.filter((module) => {
    if (activeTab === "new") {
      return module.isNew;
    }

    if (activeTab === "soon") {
      return module.isComingSoon;
    }

    if (activeTab === "mine") {
      return enabledTools[module.id];
    }

    return true;
  });

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Boite a outils</p>
            <h3>Activez les modules utiles a votre activite.</h3>
            <p>
              Retrouvez les modules disponibles pour personnaliser votre organisation au quotidien.
            </p>
          </div>
        </div>

        <SegmentedTabs
          options={toolboxTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Filtres boite a outils"
        />

        <Panel
          title="Modules disponibles"
          description="Modules operations, commercial, finance et marketing a activer selon vos besoins."
        >
          <div id="module-details" className="module-grid">
            {filteredModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                enabled={Boolean(enabledTools[module.id])}
                onToggle={(nextValue) =>
                  setEnabledTools((current) => ({ ...current, [module.id]: nextValue }))
                }
              />
            ))}
          </div>
        </Panel>

        <Panel
          title="Evenements metier"
          description="Suivi recent de l'activite pour garder une vue claire sur les operations en cours."
        >
          {eventsError ? <p className="feedback error">{eventsError}</p> : null}
          <DataTable
            rows={eventFeed}
            emptyMessage={eventsLoading ? "Chargement des evenements..." : "Aucun evenement a afficher pour le moment."}
            columns={[
              {
                key: "occurred_at",
                label: "Date",
                render: (row) => formatDateTime(row.occurred_at),
              },
              {
                key: "event_type",
                label: "Evenement",
                render: (row) => (
                  <div className="stack-inline">
                    <strong>{row.event_type}</strong>
                    <span className="muted-text">
                      {row.aggregate_type} · {row.aggregate_id}
                    </span>
                  </div>
                ),
              },
              {
                key: "status",
                label: "Etat",
                render: (row) => (
                  <StatusPill
                    tone={
                      row.event_status === "failed"
                        ? "danger"
                        : row.event_status === "processed"
                          ? "success"
                          : "info"
                    }
                  >
                    {row.event_status}
                  </StatusPill>
                ),
              },
              {
                key: "actor",
                label: "Declenche par",
                render: (row) => row.actor?.full_name || row.provider?.full_name || "Plateforme",
              },
            ]}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
