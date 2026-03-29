"use client";

import { useEffect, useRef, useState } from "react";

import { apiRequest } from "../lib/api";
import { isValidSiret, normalizeSiret } from "../lib/siret";

const initialVerificationState = {
  status: "idle",
  lookupStatus: "idle",
  message: "",
  checkedSiret: "",
  checkedAt: null,
  company: null,
};

const buildErrorState = (normalizedSiret, error) => {
  const code = String(error?.code || "").trim();
  const status =
    code === "siret_not_found"
      ? "not_found"
      : code === "siret_closed"
        ? "closed"
        : code === "sirene_timeout"
          ? "temporary_error"
          : code === "sirene_ssl_error"
            ? "temporary_error"
            : code === "sirene_api_error"
              ? "temporary_error"
              : code === "sirene_auth_error" ||
                  code === "sirene_not_configured" ||
                  code === "sirene_legacy_auth_deprecated" ||
                  code === "siret_verification_rate_limited"
                ? "temporary_error"
                : code === "siret_invalid" || code === "siret_required"
                  ? "invalid"
                  : "temporary_error";

  return {
    status,
    lookupStatus: status,
    message: error?.message || "La verification du SIRET a echoue.",
    checkedSiret: normalizedSiret,
    checkedAt: null,
    company: null,
  };
};

const buildInvalidState = (normalizedSiret, message) => ({
  status: "invalid",
  lookupStatus: "invalid",
  message,
  checkedSiret: normalizedSiret,
  checkedAt: null,
  company: null,
});

export default function useSiretVerification({
  value,
  enabled = true,
  onCompanyResolved,
} = {}) {
  const normalizedSiret = normalizeSiret(value);
  const [verification, setVerification] = useState(initialVerificationState);
  const requestSequenceRef = useRef(0);

  const applySuccessState = (response, checkedSiret) => {
    const nextState = {
      status: response.lookupStatus === "closed" ? "closed" : "verified",
      lookupStatus: response.lookupStatus || "verified",
      message: response.message || "SIRET valide.",
      checkedSiret,
      checkedAt: response.checkedAt || null,
      company: response.company || null,
    };

    setVerification(nextState);
    if (response.company) {
      onCompanyResolved?.(response.company, checkedSiret);
    }

    return nextState;
  };

  const verifyNow = async (nextValue = value) => {
    const checkedSiret = normalizeSiret(nextValue);

    if (!checkedSiret) {
      setVerification(initialVerificationState);
      return initialVerificationState;
    }

    if (checkedSiret.length !== 14 || !isValidSiret(checkedSiret)) {
      const nextState = buildInvalidState(
        checkedSiret,
        "Le numero de SIRET est invalide."
      );
      setVerification(nextState);
      return nextState;
    }

    if (
      verification.checkedSiret === checkedSiret &&
      verification.status !== "idle" &&
      verification.status !== "loading"
    ) {
      return verification;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    setVerification({
      status: "loading",
      lookupStatus: "loading",
      message: "Verification Insee en cours...",
      checkedSiret,
      checkedAt: null,
      company: null,
    });

    try {
      const response = await apiRequest("/auth/verify-siret", {
        method: "POST",
        body: {
          siret: checkedSiret,
        },
        auth: false,
      });

      if (requestSequence !== requestSequenceRef.current) {
        return null;
      }

      return applySuccessState(response, checkedSiret);
    } catch (error) {
      const nextState = buildErrorState(checkedSiret, error);

      if (requestSequence === requestSequenceRef.current) {
        setVerification(nextState);
      }

      return nextState;
    }
  };

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (!normalizedSiret) {
      if (verification.status !== "idle") {
        setVerification(initialVerificationState);
      }
      return undefined;
    }

    if (normalizedSiret.length < 14) {
      if (verification.status !== "idle" || verification.checkedSiret) {
        setVerification(initialVerificationState);
      }
      return undefined;
    }

    if (normalizedSiret.length > 14) {
      setVerification(
        buildInvalidState(normalizedSiret, "Le numero de SIRET doit contenir 14 chiffres.")
      );
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void verifyNow(normalizedSiret);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, normalizedSiret]);

  return {
    normalizedSiret,
    verification,
    verifyNow,
    resetVerification: () => setVerification(initialVerificationState),
  };
}
