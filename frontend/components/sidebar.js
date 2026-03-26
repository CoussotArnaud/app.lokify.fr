"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";

const navigation = [
  { href: "/dashboard", label: "Dashboard", hint: "Vue globale" },
  { href: "/clients", label: "Clients", hint: "Base clients" },
  { href: "/materiel", label: "Materiel", hint: "Catalogue & stock" },
  { href: "/reservations", label: "Reservations", hint: "Suivi des contrats" },
  { href: "/planning", label: "Planning", hint: "Jour / semaine" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand-card">
        <p className="eyebrow">Gestion locative</p>
        <h1>LOKIFY</h1>
        <p className="brand-copy">
          Gere votre materiel, vos clients et vos reservations dans un espace unique.
        </p>
      </div>

      <nav className="sidebar-nav">
        {navigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </Link>
          );
        })}
      </nav>

      <button type="button" className="button ghost" onClick={logout}>
        Se deconnecter
      </button>
    </aside>
  );
}

