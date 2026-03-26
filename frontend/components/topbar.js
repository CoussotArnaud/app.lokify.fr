"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";

const titles = {
  "/dashboard": "Piloter votre activite",
  "/clients": "Centraliser vos clients",
  "/materiel": "Suivre le materiel disponible",
  "/reservations": "Organiser les reservations",
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
        <p className="eyebrow">Espace SaaS</p>
        <h2>{titles[pathname] || "LOKIFY"}</h2>
      </div>

      <div className="topbar-meta">
        <div>
          <strong>{user?.full_name || "Equipe LOKIFY"}</strong>
          <p>{dateLabel}</p>
        </div>
      </div>
    </header>
  );
}

