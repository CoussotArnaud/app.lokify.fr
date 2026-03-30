"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";
import { getWorkspaceUserLabel } from "../lib/access";

const titles = {
  "/dashboard": "Piloter votre activit\u00e9",
  "/clients": "Centraliser vos clients",
  "/materiel": "Suivre le mat\u00e9riel disponible",
  "/reservations": "Organiser les r\u00e9servations",
  "/planning": "Visualiser le planning",
};

export default function Topbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const userLabel = getWorkspaceUserLabel(user, "\u00c9quipe LOKIFY");

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
          <strong>{userLabel}</strong>
          <p>{dateLabel}</p>
        </div>
      </div>
    </header>
  );
}
