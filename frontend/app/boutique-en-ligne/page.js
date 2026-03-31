"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { buildStorefrontPath } from "../../lib/storefront";

export default function ProviderStorefrontRedirectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [destination, setDestination] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const openStorefront = async () => {
      try {
        const response = await apiRequest("/storefront/settings");
        const slug = String(response.storefrontSettings?.slug || "").trim();

        if (!slug) {
          throw new Error(
            "Impossible d'ouvrir la boutique pour le moment. Verifiez d'abord le lien public dans les parametres."
          );
        }

        const nextDestination = buildStorefrontPath(slug);

        if (cancelled) {
          return;
        }

        setDestination(nextDestination);
        router.replace(nextDestination);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(nextError.message || "Impossible d'ouvrir la boutique en ligne.");
      }
    };

    void openStorefront();

    return () => {
      cancelled = true;
    };
  }, [router, user]);

  return (
    <AppShell>
      <Panel
        title={error ? "Boutique en ligne" : "Ouverture de votre boutique"}
        description={
          error
            ? "La redirection automatique n'a pas pu etre finalisee."
            : "Redirection automatique vers votre vraie boutique en ligne."
        }
      >
        <div className="empty-state">
          <strong>{error ? "Boutique indisponible" : "Ouverture en cours..."}</strong>
          <span>
            {error
              ? error
              : "La page intermediaire n'est plus utilisee. Vous allez etre redirige vers la vraie boutique publique."}
          </span>
        </div>

        <div className="row-actions">
          {destination ? (
            <Link
              href={destination}
              className="button primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir ma boutique
            </Link>
          ) : null}
          <Link href="/parametres?section=storefront" className="button ghost">
            Reglages boutique
          </Link>
        </div>
      </Panel>
    </AppShell>
  );
}
