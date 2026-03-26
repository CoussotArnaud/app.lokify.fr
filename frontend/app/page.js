"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../components/auth-provider";
import BrandLogo from "../components/brand-logo";
import { getWorkspaceHomePath } from "../lib/access";

export default function HomePage() {
  const router = useRouter();
  const { ready, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    router.replace(isAuthenticated ? getWorkspaceHomePath(user) : "/login");
  }, [ready, isAuthenticated, router, user]);

  return (
    <div className="page-loader">
      <div className="page-loader-shell">
        <BrandLogo className="brand-logo-loader" />
        <p className="page-loader-copy">Preparation de votre environnement...</p>
      </div>
    </div>
  );
}
