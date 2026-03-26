"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import AccessDeniedState from "./access-denied-state";
import { useAuth } from "./auth-provider";
import BrandLogo from "./brand-logo";
import SubscriptionRequiredState from "./subscription-required-state";
import WorkspaceFooter from "./workspace-footer";
import WorkspaceHeader from "./workspace-header";
import { getAccessRestriction } from "../lib/access";

export default function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return (
      <div className="page-loader">
        <div className="page-loader-shell">
          <BrandLogo className="brand-logo-loader" />
          <p className="page-loader-copy">Chargement de votre espace LOKIFY...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="page-loader">
        <div className="page-loader-shell">
          <BrandLogo className="brand-logo-loader" />
          <p className="page-loader-copy">Redirection vers la connexion...</p>
        </div>
      </div>
    );
  }

  const accessRestriction = getAccessRestriction(pathname, user);

  return (
    <div className="workspace-shell">
      <WorkspaceHeader />
      <div className="workspace-main">
        <div className="workspace-content">
          {accessRestriction === null ? children : null}
          {accessRestriction === "subscription" ? <SubscriptionRequiredState user={user} /> : null}
          {accessRestriction === "role" ? <AccessDeniedState user={user} /> : null}
        </div>
        <WorkspaceFooter />
      </div>
    </div>
  );
}
