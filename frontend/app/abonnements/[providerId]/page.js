import { redirect } from "next/navigation";

const appendSearchParams = (searchParams = {}) => {
  const nextSearchParams = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((entry) => nextSearchParams.append(key, entry));
      return;
    }

    if (value) {
      nextSearchParams.set(key, value);
    }
  });

  if (!nextSearchParams.has("from")) {
    nextSearchParams.set("from", "subscriptions");
  }

  const queryString = nextSearchParams.toString();
  return queryString ? `?${queryString}` : "";
};

export default function SubscriptionProviderRedirectPage({ params, searchParams }) {
  redirect(`/prestataires/${params.providerId}${appendSearchParams(searchParams)}`);
}
