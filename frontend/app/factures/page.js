"use client";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { formatCurrency, formatDateTime } from "../../lib/date";

export default function InvoicesPage() {
  const workspace = useLokifyWorkspace();
  const invoices = workspace.reservations.map((reservation) => ({
    id: reservation.id,
    reference: `FAC-${reservation.id.slice(0, 6).toUpperCase()}`,
    client: reservation.client_name,
    amount: reservation.total_amount,
    issued_at: reservation.start_date,
    status: reservation.status === "confirmed" || reservation.status === "completed" ? "A regler" : "En preparation",
  }));

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Factures</p>
            <h3>Une base propre pour le suivi de la facturation sans casser votre espace actuel.</h3>
            <p>La structure est volontairement simple, lisible et deja connectee a vos reservations.</p>
          </div>
        </div>

        <Panel title="Factures a suivre" description="References, clients, dates et statuts dans une vue plus claire.">
          <DataTable
            rows={invoices}
            emptyMessage="Aucune facture a suivre."
            columns={[
              { key: "reference", label: "Reference" },
              { key: "client", label: "Client" },
              { key: "issued_at", label: "Date", render: (row) => formatDateTime(row.issued_at) },
              { key: "amount", label: "Montant", render: (row) => formatCurrency(row.amount) },
              {
                key: "status",
                label: "Statut",
                render: (row) => <StatusPill tone={row.status === "A regler" ? "warning" : "neutral"}>{row.status}</StatusPill>,
              },
            ]}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
