"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";

const titles = {
  "/dashboard": "Piloter votre activité",
  "/clients": "Centraliser vos clients",
  "/materiel": "Suivre le matériel disponible",
  "/reservations": "Organiser les réservations",
  "/planning": "Visualiser le planning",
};

export default function Topbar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Espace Lokify</p>
        <h2>{titles[pathname] || "LOKIFY"}</h2>
      </div>

      <div className="topbar-meta">
        <div>
          <strong>{user?.full_name || "Équipe LOKIFY"}</strong>
          <p>{dateLabel}</p>
        </div>
      </div>
    </header>
  );
}
