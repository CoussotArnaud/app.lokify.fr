"use client";

import { useState } from "react";

import AppShell from "../../components/app-shell";
import MetricCard from "../../components/metric-card";
import Panel from "../../components/panel";
import SecondaryNav from "../../components/secondary-nav";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { formatCurrency, formatNumber } from "../../lib/date";

const navigationGroups = [
  {
    title: "Global",
    items: [
      { id: "revenue", label: "Chiffre d'affaires", helper: "Lecture globale et tendances." },
      { id: "categories", label: "Categories de produits", helper: "Performance par famille." },
    ],
  },
  {
    title: "Reservations",
    items: [
      { id: "reservations", label: "Reservations", helper: "Volumes et statuts." },
      { id: "deliveries", label: "Livraison", helper: "Charge logistique et tournees." },
    ],
  },
  {
    title: "Produits",
    items: [
      { id: "products", label: "Zoom sur vos produits", helper: "Occupation et capacite." },
      { id: "bestsellers", label: "Best sellers", helper: "Produits les plus demandes." },
    ],
  },
  {
    title: "Boutique en ligne",
    items: [{ id: "online", label: "Activite", helper: "Demandes et signaux web." }],
  },
  {
    title: "Marketing",
    items: [
      { id: "clients", label: "Vos clients", helper: "Segmentation de la base." },
      { id: "promotions", label: "Code promotionnel", helper: "Suivi des offres." },
    ],
  },
];

const renderBars = (rows, maxValue, formatter = (value) => value) => (
  <div className="bars-list">
    {rows.map((row) => (
      <div key={row.id || row.label} className="bar-row">
        <header>
          <strong>{row.label}</strong>
          <span>{formatter(row.value ?? row.amount ?? row.volume ?? row.revenue)}</span>
        </header>
        <div className="bar-track">
          <div
            className="bar-fill"
            style={{
              width: `${Math.max(8, Math.round((((row.value ?? row.amount ?? row.volume ?? row.revenue) || 0) / Math.max(maxValue, 1)) * 100))}%`,
            }}
          />
        </div>
      </div>
    ))}
  </div>
);

export default function StatisticsPage() {
  const workspace = useLokifyWorkspace();
  const [activeSection, setActiveSection] = useState("revenue");
  const [periodLabel, setPeriodLabel] = useState("30 jours");

  const sectionContent = {
    revenue: (
      <Panel title="Chiffre d'affaires" description="Une lecture executive plus aeree du CA confirme.">
        {workspace.statistics.revenueByDay.length ? (
          renderBars(workspace.statistics.revenueByDay, workspace.statistics.maxRevenue, formatCurrency)
        ) : (
          <div className="empty-state">
            <strong>Pas encore d'historique suffisant</strong>
            <span>Les prochains encaissements alimenteront cette zone.</span>
          </div>
        )}
      </Panel>
    ),
    categories: (
      <Panel title="Categories de produits" description="Identifiez les familles qui portent le plus votre activite.">
        {renderBars(
          workspace.statistics.categoryRows.map((row) => ({ ...row, value: row.revenue })),
          Math.max(...workspace.statistics.categoryRows.map((row) => row.revenue), 1),
          formatCurrency
        )}
      </Panel>
    ),
    reservations: (
      <Panel title="Reservations" description="Lecture par statut pour piloter les priorites commerciales et operationnelles.">
        {renderBars(
          workspace.statistics.reservationStatusRows.map((row) => ({ ...row, value: row.volume })),
          Math.max(...workspace.statistics.reservationStatusRows.map((row) => row.volume), 1),
          formatNumber
        )}
      </Panel>
    ),
    deliveries: (
      <Panel title="Livraisons" description="La charge logistique reste lisible sans densifier la page.">
        {renderBars(
          workspace.statistics.deliveryRows.map((row) => ({ ...row, value: row.volume })),
          Math.max(...workspace.statistics.deliveryRows.map((row) => row.volume), 1),
          formatNumber
        )}
      </Panel>
    ),
    products: (
      <Panel title="Zoom sur vos produits" description="Occupation du parc, capacite mobilisable et potentiel restant.">
        <div className="kpi-band">
          <div className="kpi-tile">
            <strong>{workspace.metrics.rentedUnits}</strong>
            <span>produits actuellement engages</span>
          </div>
          <div className="kpi-tile">
            <strong>{workspace.metrics.availableUnits}</strong>
            <span>unites encore disponibles</span>
          </div>
          <div className="kpi-tile">
            <strong>{workspace.metrics.unavailableUnits}</strong>
            <span>indisponibles ou en maintenance</span>
          </div>
          <div className="kpi-tile">
            <strong>{workspace.metrics.parkUsageRate}%</strong>
            <span>taux d'occupation du parc</span>
          </div>
        </div>
      </Panel>
    ),
    bestsellers: (
      <Panel title="Best sellers" description="Les produits les plus demandes restent immediatement identifiables.">
        {renderBars(
          workspace.statistics.bestsellerRows.map((row) => ({ ...row, value: row.volume })),
          Math.max(...workspace.statistics.bestsellerRows.map((row) => row.volume), 1),
          formatNumber
        )}
      </Panel>
    ),
    online: (
      <Panel title="Activite boutique en ligne" description="Une base propre pour suivre votre futur front de location.">
        {renderBars(
          workspace.statistics.onlineRows.map((row) => ({ ...row, value: row.value })),
          Math.max(...workspace.statistics.onlineRows.map((row) => row.value), 1),
          formatNumber
        )}
      </Panel>
    ),
    clients: (
      <Panel title="Vos clients" description="Lecture segmentee de la base relationnelle pour le marketing et la conversion.">
        {renderBars(
          workspace.statistics.clientRows.map((row) => ({ ...row, value: row.value })),
          Math.max(...workspace.statistics.clientRows.map((row) => row.value), 1),
          formatNumber
        )}
      </Panel>
    ),
    promotions: (
      <Panel title="Codes promotionnels" description="Suivi des remises et des revenus generes par les offres.">
        {renderBars(
          workspace.statistics.promotionRows.map((row) => ({ ...row, value: row.revenue })),
          Math.max(...workspace.statistics.promotionRows.map((row) => row.revenue), 1),
          formatCurrency
        )}
      </Panel>
    ),
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Statistiques</p>
            <h3>Un pilotage plus lisible, plus aere et plus coherent avec le reste du SaaS.</h3>
            <p>Les sections sont mieux structurees et utilisent mieux la largeur disponible pour une lecture immediate.</p>
          </div>
          <div className="page-header-actions">
            <select value={periodLabel} onChange={(event) => setPeriodLabel(event.target.value)}>
              <option value="7 jours">7 jours</option>
              <option value="30 jours">30 jours</option>
              <option value="90 jours">90 jours</option>
            </select>
          </div>
        </div>

        <section className="metric-grid">
          <MetricCard icon="euro" label="Chiffre d'affaires" value={formatCurrency(workspace.metrics.totalRevenue)} helper={`Periode ${periodLabel.toLowerCase()}`} tone="success" />
          <MetricCard icon="chart" label="Rentabilite" value={formatCurrency(workspace.metrics.profitability)} helper="Projection a partir de la base actuelle" tone="info" />
          <MetricCard icon="box" label="Produits sortis" value={workspace.metrics.rentedUnits} helper="Unites engagees" tone="warning" />
          <MetricCard icon="catalog" label="Parc loue" value={`${workspace.metrics.parkUsageRate}%`} helper="Taux d'occupation du stock" tone="success" />
        </section>

        <section className="subnav-layout">
          <SecondaryNav title="Navigation statistiques" groups={navigationGroups} activeId={activeSection} onChange={setActiveSection} />

          <div className="page-stack">
            <Panel title="Vue de synthese" description="Une bande de recap avant d'entrer dans la sous-section choisie.">
              <div className="kpi-band">
                <div className="kpi-tile">
                  <strong>{workspace.reservations.length}</strong>
                  <span>reservations analysees</span>
                </div>
                <div className="kpi-tile">
                  <strong>{workspace.clients.length}</strong>
                  <span>clients dans la base</span>
                </div>
                <div className="kpi-tile">
                  <strong>{workspace.deliveries.length}</strong>
                  <span>tournees structurees</span>
                </div>
                <div className="kpi-tile">
                  <strong>{workspace.products.length}</strong>
                  <span>produits suivis</span>
                </div>
              </div>
            </Panel>

            {sectionContent[activeSection]}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
