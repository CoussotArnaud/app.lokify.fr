"use client";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { formatCurrency, formatDateTime } from "../../lib/date";

export default function InvoicesPage() {
  const workspace = useLokifyWorkspace();
  const invoices = workspace.invoiceDocuments || [];
  const dueInvoices = invoices.filter((invoice) => invoice.status === "due");
  const locationAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const depositAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.deposit_amount || 0), 0);

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Factures</p>
            <h3>Retrouvez vos documents de facturation lies aux reservations.</h3>
            <p>Le montant de location reste distinct de la caution pour une lecture claire des dossiers.</p>
          </div>
        </div>

        <div className="kpi-band">
          <div className="kpi-tile">
            <strong>{dueInvoices.length}</strong>
            <span>facture(s) a suivre</span>
          </div>
          <div className="kpi-tile">
            <strong>{formatCurrency(locationAmount)}</strong>
            <span>location suivie</span>
          </div>
          <div className="kpi-tile">
            <strong>{formatCurrency(depositAmount)}</strong>
            <span>cautions visibles a part</span>
          </div>
        </div>

        <Panel title="Factures liees aux reservations" description="References, reservation source, client, montant de location et caution separee.">
          <DataTable
            rows={invoices}
            emptyMessage={workspace.loading ? "Chargement des factures..." : "Aucune facture a suivre."}
            columns={[
              { key: "reference", label: "Facture" },
              { key: "reservation_reference", label: "Reservation" },
              { key: "client", label: "Client" },
              { key: "product", label: "Produit" },
              {
                key: "issued_at",
                label: "Date",
                render: (row) => formatDateTime(row.issued_at),
              },
              {
                key: "amount",
                label: "Location",
                render: (row) => formatCurrency(row.amount),
              },
              {
                key: "deposit_amount",
                label: "Caution",
                render: (row) => formatCurrency(row.deposit_amount),
              },
              {
                key: "status",
                label: "Statut",
                render: (row) => (
                  <StatusPill tone={row.status_tone || "neutral"}>{row.status_label}</StatusPill>
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
