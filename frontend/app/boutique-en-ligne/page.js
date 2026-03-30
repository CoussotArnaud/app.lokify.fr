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

    const openPreview = async () => {
      try {
        const response = await apiRequest("/storefront/settings");
        const slug = String(response.storefrontSettings?.slug || "").trim();

        if (!slug) {
          throw new Error(
            "Impossible d'ouvrir la boutique pour le moment. Verifiez d'abord le lien public dans les parametres."
          );
        }

        const nextDestination = `${buildStorefrontPath(slug)}?preview=1`;

        if (cancelled) {
          return;
        }

        setDestination(nextDestination);
        router.replace(nextDestination);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(nextError.message || "Impossible d'ouvrir l'apercu de la boutique.");
      }
    };

    void openPreview();

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
            : "Redirection automatique vers la vraie boutique en ligne en mode apercu."
        }
      >
        <div className="empty-state">
          <strong>{error ? "Apercu indisponible" : "Ouverture en cours..."}</strong>
          <span>
            {error
              ? error
              : "Votre ancienne page intermediaire n'est plus utilisee. Vous allez etre redirige vers la vraie boutique publique."}
          </span>
        </div>

        <div className="row-actions">
          {destination ? (
            <Link href={destination} className="button primary">
              Ouvrir l'apercu
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
