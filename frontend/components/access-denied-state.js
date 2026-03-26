"use client";

import Link from "next/link";

import { getWorkspaceHomePath, isProvider, isSuperAdmin } from "../lib/access";

export default function AccessDeniedState({ user }) {
  const homePath = getWorkspaceHomePath(user);
  const title = isSuperAdmin(user)
    ? "Cet espace n'appartient pas au super admin."
    : isProvider(user)
      ? "Cet espace n'est pas disponible pour votre role."
      : "Acces non autorise.";
  const description = isSuperAdmin(user)
    ? "Utilisez les sections Prestataires, Abonnements ou Parametres pour administrer la plateforme."
    : "Votre session ne dispose pas des droits necessaires pour ouvrir cette page.";

  return (
    <div className="subscription-required-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Acces controle</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      <section className="panel subscription-required-panel">
        <div className="panel-body">
          <div className="row-actions subscription-required-actions">
            <Link href={homePath} className="button primary">
              Revenir a mon espace
            </Link>
            <Link href="/parametres" className="button ghost">
              Ouvrir Parametres
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
