import { redirect } from "next/navigation";

export default function LegacyBillingCheckoutPage({ searchParams }) {
  const sessionId = searchParams?.sessionId;

  if (sessionId) {
    redirect(`/abonnement/paiement?sessionId=${encodeURIComponent(sessionId)}`);
  }

  redirect("/abonnement/paiement");
}
