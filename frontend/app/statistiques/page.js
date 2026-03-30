"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import MetricCard from "../../components/metric-card";
import Panel from "../../components/panel";
import SecondaryNav from "../../components/secondary-nav";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";
import { formatCurrency, formatNumber } from "../../lib/date";

const navigationGroups = [
  {
    title: "Global",
    items: [
      { id: "revenue", label: "Chiffre d'affaires", helper: "CA location hors cautions." },
      { id: "categories", label: "Categories", helper: "Lecture par famille de produits." },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "reservations", label: "Reservations", helper: "Volumes par statut reel." },
      { id: "deliveries", label: "Livraisons", helper: "Charge logistique sur la periode." },
      { id: "products", label: "Produits", helper: "Occupation et capacite utile." },
    ],
  },
  {
    title: "Finance",
    items: [
      { id: "documents", label: "Documents", helper: "Devis, contrats, etats des lieux et factures." },
      { id: "cash", label: "Caisse", helper: "Revenus location et cautions suivies separement." },
    ],
  },
];

const initialStatistics = {
  window_days: 30,
  period_start: "",
  period_end: "",
  metrics: {
    confirmed_revenue: 0,
    confirmed_reservations: 0,
    average_order_value: 0,
    delivery_assignments: 0,
    tracked_products: 0,
    park_usage_rate: 0,
    documents_to_follow: 0,
    revenue_to_collect: 0,
    deposits_tracked: 0,
  },
  revenue_by_day: [],
  category_rows: [],
  reservation_status_rows: [],
  delivery_rows: [],
  bestseller_rows: [],
  product_rows: [],
  document_rows: [],
  cash_rows: [],
};

const renderBars = (rows, valueKey, formatter) => (
  <div className="bars-list">
    {rows.length ? (
      rows.map((row) => {
        const maxValue = Math.max(...rows.map((entry) => Number(entry[valueKey] || 0)), 1);
        const value = Number(row[valueKey] || 0);

        return (
          <div key={row.id || row.label || row.date} className="bar-row">
            <header>
              <strong>{row.label}</strong>
              <span>{formatter(value)}</span>
            </header>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.max(8, Math.round((value / maxValue) * 100))}%`,
                }}
              />
            </div>
          </div>
        );
      })
    ) : (
      <div className="empty-state">
        <strong>Aucune donnee sur cette section</strong>
        <span>La periode choisie n'a pas encore genere d'activite exploitable ici.</span>
      </div>
    )}
  </div>
);

export default function StatisticsPage() {
  const [activeSection, setActiveSection] = useState("revenue");
  const [windowDays, setWindowDays] = useState(30);
  const [statistics, setStatistics] = useState(initialStatistics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadStatistics = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await apiRequest(`/reporting/statistics?window=${windowDays}`);

        if (isMounted) {
          setStatistics(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Impossible de charger les statistiques.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadStatistics();

    return () => {
      isMounted = false;
    };
  }, [windowDays]);

  const sectionContent = {
    revenue: (
      <Panel title="CA location" description="Lecture journaliere du chiffre d'affaires confirme, sans jamais inclure les cautions.">
        {renderBars(statistics.revenue_by_day, "amount", formatCurrency)}
      </Panel>
    ),
    categories: (
      <Panel title="Categories" description="Revenus et volumes reels par famille de produits.">
        {renderBars(statistics.category_rows, "revenue", formatCurrency)}
      </Panel>
    ),
    reservations: (
      <Panel title="Reservations" description="Distribution des dossiers sur la periode selon vos statuts personnalises.">
        <div className="bars-list">
          {statistics.reservation_status_rows.length ? (
            statistics.reservation_status_rows.map((row) => (
              <div key={row.id} className="bar-row">
                <header>
                  <StatusPill tone="neutral" color={row.color}>
                    {row.label}
                  </StatusPill>
                  <span>{formatNumber(row.volume)}</span>
                </header>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(
                        8,
                        Math.round(
                          (Number(row.volume || 0) /
                            Math.max(...statistics.reservation_status_rows.map((entry) => Number(entry.volume || 0)), 1)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>Aucune reservation sur la periode</strong>
              <span>Les prochaines creations de dossiers alimenteront cette vue.</span>
            </div>
          )}
        </div>
      </Panel>
    ),
    deliveries: (
      <Panel title="Livraisons" description="Tournées et affectations reelles sur la periode selectionnee.">
        {renderBars(statistics.delivery_rows, "volume", formatNumber)}
      </Panel>
    ),
    products: (
      <Panel title="Produits" description="Occupation courante et capacite utile pour les produits les plus exposes.">
        <DataTable
          rows={statistics.product_rows}
          emptyMessage="Aucune disponibilite produit a afficher."
          columns={[
            { key: "label", label: "Produit" },
            {
              key: "reserved_quantity",
              label: "Reserve",
              render: (row) => formatNumber(row.reserved_quantity),
            },
            {
              key: "available_quantity",
              label: "Disponible",
              render: (row) => formatNumber(row.available_quantity),
            },
            {
              key: "blocked_quantity",
              label: "Bloque",
              render: (row) => formatNumber(row.blocked_quantity),
            },
            {
              key: "usage_rate",
              label: "Occupation",
              render: (row) => `${formatNumber(row.usage_rate)}%`,
            },
          ]}
        />
      </Panel>
    ),
    documents: (
      <Panel title="Documents" description="Volume reel des documents rattaches a vos reservations.">
        {renderBars(statistics.document_rows, "volume", formatNumber)}
      </Panel>
    ),
    cash: (
      <Panel title="Caisse" description="Comparatif clair entre revenus de location suivis et cautions, sans melanger les deux.">
        {renderBars(statistics.cash_rows, "amount", formatCurrency)}
      </Panel>
    ),
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Statistiques</p>
            <h3>Des statistiques reelles reliees a vos reservations, documents et encaissements.</h3>
            <p>La caution reste toujours isolee du chiffre d'affaires pour garder un pilotage financier propre.</p>
          </div>
          <div className="page-header-actions">
            <select value={String(windowDays)} onChange={(event) => setWindowDays(Number(event.target.value))}>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
            </select>
          </div>
        </div>

        <section className="metric-grid">
          <MetricCard icon="euro" label="CA confirme" value={formatCurrency(statistics.metrics.confirmed_revenue)} helper="Locations confirmees, cautions exclues" tone="success" />
          <MetricCard icon="calendar" label="Reservations confirmees" value={statistics.metrics.confirmed_reservations} helper="Dossiers sur la periode" tone="info" />
          <MetricCard icon="document" label="Documents a suivre" value={statistics.metrics.documents_to_follow} helper="Docs non clos ou a preparer" tone="warning" />
          <MetricCard icon="bill" label="Encaissements location" value={formatCurrency(statistics.metrics.revenue_to_collect)} helper="Montants de location a suivre" tone="success" />
        </section>

        {error ? (
          <Panel title="Erreur de chargement" description={error}>
            <div className="empty-state">
              <strong>Impossible de charger les statistiques</strong>
              <span>Verifiez la connexion au service puis rechargez la page.</span>
            </div>
          </Panel>
        ) : loading ? (
          <Panel title="Chargement des statistiques" description="Analyse des donnees en cours.">
            <div className="empty-state">
              <strong>Chargement en cours</strong>
              <span>Les reservations, documents et ecritures de caisse arrivent dans quelques instants.</span>
            </div>
          </Panel>
        ) : (
          <section className="subnav-layout">
            <SecondaryNav
              title="Navigation statistiques"
              groups={navigationGroups}
              activeId={activeSection}
              onChange={setActiveSection}
            />

            <div className="page-stack">{sectionContent[activeSection]}</div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
