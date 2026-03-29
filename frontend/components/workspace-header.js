"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";
import BrandLogo from "./brand-logo";
import Icon from "./icon";
import QuickActionsMenu from "./quick-actions-menu";
import { getWorkspaceHomePath } from "../lib/access";
import {
  getAccountMenuItems,
  getMainNavigation,
  getQuickActionConfig,
} from "../lib/navigation";

const isActivePath = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const mainNavigation = getMainNavigation(user);
  const accountMenuItems = getAccountMenuItems(user);
  const quickActionConfig = getQuickActionConfig(user);
  const quickActionItems = quickActionConfig.items;

  return (
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <Link href={getWorkspaceHomePath(user)} className="brand-lockup">
          <BrandLogo className="brand-logo-header" />
          <span className="brand-lockup-copy">
            <small>Location & reservations</small>
          </span>
        </Link>

        <nav className="main-navigation" aria-label="Navigation principale">
          {mainNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`main-nav-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
            >
              <span className="main-nav-icon">
                <Icon name={item.icon} size={14} />
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="workspace-header-actions">
          {quickActionItems.length ? (
            <QuickActionsMenu
              items={quickActionItems}
              triggerLabel={quickActionConfig.triggerLabel}
            />
          ) : null}

          <details className="user-menu">
            <summary className="user-trigger">
              <span className="user-avatar">{user?.full_name?.slice(0, 2)?.toUpperCase() || "LK"}</span>
              <span className="user-meta">
                <strong>{user?.full_name || "Espace LOKIFY"}</strong>
                <small>{user?.email || "contact@lokify.app"}</small>
              </span>
              <Icon name="chevronDown" size={12} />
            </summary>
            <div className="user-popover">
              {accountMenuItems.map((item) => (
                <Link key={item.id} href={item.href} className="user-popover-link">
                  <Icon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </Link>
              ))}
              <button type="button" className="user-popover-link" onClick={logout}>
                <Icon name="logout" size={14} />
                <span>Se deconnecter</span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
