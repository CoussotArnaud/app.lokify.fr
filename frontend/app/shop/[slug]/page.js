import { headers } from "next/headers";

import PublicStorefrontClient from "./public-storefront-client";
import { buildDefaultBookingForm } from "../../../lib/storefront-runtime";

export const dynamic = "force-dynamic";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const resolveApiBaseUrl = () => {
  const explicitApiUrl = normalizeUrl(
    process.env.NEXT_PUBLIC_API_URL || process.env.API_PROXY_TARGET
  );

  if (explicitApiUrl) {
    return /\/api$/i.test(explicitApiUrl) ? explicitApiUrl : `${explicitApiUrl}/api`;
  }

  const requestHeaders = headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const protocol = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${protocol}://${host}/api`;
};

const fetchInitialStorefront = async ({ slug, bookingForm }) => {
  const endpoint = new URL(
    `${resolveApiBaseUrl()}/public/storefront/${encodeURIComponent(slug)}`
  );
  endpoint.searchParams.set("start", bookingForm.start_date);
  endpoint.searchParams.set("end", bookingForm.end_date);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return {
        data: null,
        error: payload.message || "Impossible de charger cette boutique.",
      };
    }

    return {
      data: await response.json(),
      error: "",
    };
  } catch (_error) {
    return {
      data: null,
      error: "Impossible de charger cette boutique.",
    };
  }
};

export default async function PublicStorefrontPage({ params }) {
  const slug = Array.isArray(params?.slug) ? params.slug[0] : String(params?.slug || "");
  const initialBookingForm = buildDefaultBookingForm();

  const initialState = slug
    ? await fetchInitialStorefront({
        slug,
        bookingForm: initialBookingForm,
      })
    : {
        data: null,
        error: "Boutique introuvable.",
      };

  return (
    <PublicStorefrontClient
      slug={slug}
      initialBookingForm={initialBookingForm}
      initialStorefrontData={initialState.data}
      initialStorefrontError={initialState.error}
    />
  );
}
