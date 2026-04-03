"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../components/app-shell";
import Panel from "../../components/panel";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { getWorkspaceUserLabel, isSuperAdmin } from "../../lib/access";
import {
  MAX_IMAGE_UPLOAD_SIZE_BYTES,
  formatImageUploadSize,
  prepareImageUpload,
} from "../../lib/image-upload";
import { defaultReservationStatuses } from "../../lib/lokify-data";
import { buildStorefrontPath, buildStorefrontUrl } from "../../lib/storefront";
import { normalizeStorefrontHeroImageUrls } from "../../lib/storefront-hero-images";
import {
  deleteStorefrontTemporaryHeroImage,
  uploadStorefrontHeroImage,
} from "../../lib/storefront-hero-upload";

const initialPlatformForm = {
  publishableKey: "",
  secretKey: "",
  webhookSecret: "",
  priceIds: {
    essential: "",
    pro: "",
    premium: "",
  },
};

const initialProviderForm = {
  customerPaymentsEnabled: false,
};

const initialStorefrontForm = {
  slug: "",
  is_published: false,
  reservation_approval_mode: "manual",
  map_enabled: false,
  map_address: "",
  reviews_enabled: false,
  reviews_url: "",
  hero_images: [],
};

const MAX_STOREFRONT_HERO_IMAGES = 5;
const allowedStorefrontHeroPendingStatuses = new Set(["ready", "uploading", "error"]);

const initialAccountForm = {
  full_name: "",
  first_name: "",
  last_name: "",
  phone: "",
};

const initialLocalPreferences = {
  delivery_mode: true,
  customer_notifications: true,
  accounting_export: false,
};

const standardFrenchTaxRates = [
  { name: "TVA 20 %", rate: 20, defaultActive: true, helper: "Taux normal applique par defaut." },
  { name: "TVA 10 %", rate: 10, defaultActive: false, helper: "Taux reduit pour certaines prestations et locations." },
  { name: "TVA 5,5 %", rate: 5.5, defaultActive: false, helper: "Taux reduit specifique a certains cas autorises." },
  { name: "TVA 2,1 %", rate: 2.1, defaultActive: false, helper: "Taux tres specifique, a activer uniquement si necessaire." },
];

const buildTaxRateKey = (rate) => {
  const parsedRate = Number(rate);
  return Number.isFinite(parsedRate) ? parsedRate.toFixed(2) : "";
};

const roleLabelByAccount = {
  super_admin: "Super admin",
  provider: "Prestataire",
};

const stripeToneByStatus = {
  not_connected: "neutral",
  pending: "warning",
  action_required: "danger",
  ready: "success",
};

const onlinePaymentToneByStatus = {
  enabled: "success",
  disabled: "neutral",
};

const superAdminSettingSections = [
  {
    id: "profile",
    label: "Mon compte",
    title: "Reglages de votre compte super admin.",
    description:
      "Modifiez ici le nom affiche dans le dashboard et les informations de contact de ce compte.",
  },
  {
    id: "platform-payments",
    label: "Paiements plateforme",
    title: "Configuration des paiements de la plateforme.",
    description:
      "Les informations Stripe de la plateforme restent securisees et uniquement visibles dans cet espace.",
  },
];

const providerSettingSections = [
  {
    id: "profile",
    label: "Mon compte",
    title: "Reglages de votre compte.",
    description:
      "Modifiez ici le nom affiche dans le dashboard et les coordonnees de contact de votre compte.",
  },
  {
    id: "storefront",
    label: "Boutique en ligne",
    title: "Reglages de la boutique en ligne.",
    description:
      "Gerez ici le lien public, l'activation et la validation des reservations en ligne.",
  },
  {
    id: "payments",
    label: "Paiement en ligne",
    title: "Paiement en ligne de votre boutique.",
    description:
      "Connectez Stripe, verifiez l'etat du compte et activez ou non le paiement en ligne sur votre boutique.",
  },
  {
    id: "taxes",
    label: "TVA",
    title: "Configuration de la TVA catalogue.",
    description:
      "Configurez uniquement les taux utiles a votre catalogue, puis definissez votre TVA par defaut.",
  },
  {
    id: "statuses",
    label: "Statuts",
    title: "Statuts de reservations.",
    description:
      "Gardez des statuts simples, lisibles et personnalises pour votre organisation quotidienne.",
  },
  {
    id: "preferences",
    label: "Preferences",
    title: "Preferences du dashboard.",
    description:
      "Retrouvez ici les activations rapides utiles a votre organisation quotidienne.",
  },
];

const normalizePendingStorefrontHeroImage = (photo) => ({
  ...photo,
  uploadStatus: allowedStorefrontHeroPendingStatuses.has(
    String(photo?.uploadStatus || "").trim().toLowerCase()
  )
    ? String(photo.uploadStatus).trim().toLowerCase()
    : "ready",
  errorMessage: String(photo?.errorMessage || "").trim(),
});

const buildStorefrontHeroImageItems = (existingImages = [], pendingImages = []) => [
  ...existingImages.map((url) => ({
    key: `existing:${url}`,
    kind: "existing",
    url,
  })),
  ...pendingImages.map((photo) => {
    const normalizedPhoto = normalizePendingStorefrontHeroImage(photo);
    return {
      key: `pending:${normalizedPhoto.id}`,
      kind: "pending",
      photo: normalizedPhoto,
      url: normalizedPhoto.previewUrl,
    };
  }),
];

const buildStorefrontHeroImageStatusLabel = (photoItem) => {
  if (photoItem.kind !== "pending") {
    return "Enregistree";
  }

  const sizeLabel = formatImageUploadSize(photoItem.photo.sizeBytes);

  if (photoItem.photo.uploadStatus === "uploading") {
    return `Envoi en cours - ${sizeLabel}`;
  }

  if (photoItem.photo.uploadStatus === "error") {
    return "Erreur - reessayez l'enregistrement";
  }

  return `Prete a enregistrer - ${sizeLabel}`;
};

const splitStorefrontHeroImageItems = (items = []) => ({
  heroImages: items
    .filter((entry) => entry.kind === "existing")
    .map((entry) => entry.url),
  pendingImages: items
    .filter((entry) => entry.kind === "pending")
    .map((entry) => entry.photo),
});

const buildStorefrontHeroImageSequenceEntry = (entry) =>
  entry.kind === "existing" ? entry.url : `upload:${entry.photo.id}`;

const buildStorefrontHeroImageErrorMessage = (submissionError) => {
  if (!submissionError) {
    return "L'image n'a pas pu etre envoyee.";
  }

  if (
    submissionError.code === "catalog_image_too_large" ||
    submissionError.code === "request_entity_too_large" ||
    submissionError.statusCode === 413
  ) {
    return `Le fichier est trop volumineux. Taille maximale autorisee : ${Math.round(
      MAX_IMAGE_UPLOAD_SIZE_BYTES / (1024 * 1024)
    )} Mo.`;
  }

  if (submissionError.code === "storefront_image_limit") {
    return `Vous ne pouvez pas ajouter plus de ${MAX_STOREFRONT_HERO_IMAGES} images sur ce bloc photo.`;
  }

  if (submissionError.code === "catalog_image_type") {
    return "Format non pris en charge. Utilisez une image JPG, PNG ou WebP.";
  }

  if (submissionError.code === "network_error") {
    return "L'image n'a pas pu etre envoyee. Verifiez la connexion puis reessayez.";
  }

  if (submissionError.code === "catalog_image_processing_failed") {
    return "L'image a bien ete recue mais n'a pas pu etre finalisee. Essayez avec un JPG, PNG ou WebP standard.";
  }

  if (submissionError.code === "storefront_image_persist_failed") {
    return "Les images du bloc photo n'ont pas pu etre confirmees apres l'enregistrement. Reessayez pour forcer la sauvegarde finale.";
  }

  return submissionError.message || "L'image n'a pas pu etre envoyee.";
};

const hasStorefrontStatusValue = (value) => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return Boolean(value);
};

const SettingsPageFallback = () => (
  <AppShell>
    <div className="page-stack">
      <Panel title="Chargement des reglages" description="Preparation de la configuration.">
        <div className="empty-state">
          <strong>Lecture des reglages</strong>
          <span>Les informations apparaissent dans quelques instants.</span>
        </div>
      </Panel>
    </div>
  </AppShell>
);

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, replaceUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeSection, setActiveSection] = useState("profile");
  const [platformSettings, setPlatformSettings] = useState(null);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [storefrontSettings, setStorefrontSettings] = useState(null);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [platformForm, setPlatformForm] = useState(initialPlatformForm);
  const [providerForm, setProviderForm] = useState(initialProviderForm);
  const [storefrontForm, setStorefrontForm] = useState(initialStorefrontForm);
  const [pendingStorefrontHeroImages, setPendingStorefrontHeroImages] = useState([]);
  const [preparingStorefrontHeroImages, setPreparingStorefrontHeroImages] = useState(false);
  const [localPreferences, setLocalPreferences] = useState(initialLocalPreferences);
  const [reservationStatuses, setReservationStatuses] = useState(defaultReservationStatuses);
  const [savingStatuses, setSavingStatuses] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [savingTaxRate, setSavingTaxRate] = useState(false);
  const [savingStorefront, setSavingStorefront] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);
  const storefrontFormRef = useRef(initialStorefrontForm);
  const pendingStorefrontHeroImagesRef = useRef([]);
  const storefrontHeroImagePreparationRef = useRef(Promise.resolve());

  const loadSettings = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      if (isSuperAdmin(user)) {
        const response = await apiRequest("/admin/stripe/settings");
        setPlatformSettings(response.stripeSettings);
      } else {
        const [response, statusesResponse, taxRatesResponse, storefrontResponse] = await Promise.all([
          apiRequest("/customer-payments/settings"),
          apiRequest("/reservations/statuses"),
          apiRequest("/catalog/tax-rates").catch(() => ({ taxRates: [] })),
          apiRequest("/storefront/settings"),
        ]);
        setPaymentSettings(response);
        setReservationStatuses(statusesResponse.statuses || defaultReservationStatuses);
        setTaxRates(taxRatesResponse.taxRates || []);
        setStorefrontSettings(storefrontResponse.storefrontSettings);
        setProviderForm({
          customerPaymentsEnabled: Boolean(response.onlinePayment?.enabled),
        });
        setStorefrontForm({
          slug: storefrontResponse.storefrontSettings?.slug || "",
          is_published: Boolean(storefrontResponse.storefrontSettings?.is_published),
          reservation_approval_mode:
            storefrontResponse.storefrontSettings?.reservation_approval_mode || "manual",
          map_enabled: Boolean(storefrontResponse.storefrontSettings?.map_enabled),
          map_address: storefrontResponse.storefrontSettings?.map_address || "",
          reviews_enabled: Boolean(storefrontResponse.storefrontSettings?.reviews_enabled),
          reviews_url: storefrontResponse.storefrontSettings?.reviews_url || "",
          hero_images: normalizeStorefrontHeroImageUrls(storefrontResponse.storefrontSettings),
        });
        setPendingStorefrontHeroImages([]);
      }
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    loadSettings();
  }, [user?.id, user?.account_role]);

  useEffect(() => {
    storefrontFormRef.current = storefrontForm;
  }, [storefrontForm]);

  useEffect(() => {
    pendingStorefrontHeroImagesRef.current = pendingStorefrontHeroImages;
  }, [pendingStorefrontHeroImages]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setAccountForm({
      full_name: user.full_name || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
    });
  }, [user]);

  useEffect(() => {
    const validSectionIds = (isSuperAdmin(user)
      ? superAdminSettingSections
    : providerSettingSections
    ).map((section) => section.id);
    const requestedSection = searchParams.get("section");

    if (requestedSection && validSectionIds.includes(requestedSection) && requestedSection !== activeSection) {
      setActiveSection(requestedSection);
      return;
    }

    if (!validSectionIds.includes(activeSection)) {
      setActiveSection("profile");
    }
  }, [activeSection, searchParams, user]);

  useEffect(() => {
    if (isSuperAdmin(user) || loading) {
      return;
    }

    const stripeFlag = searchParams.get("stripe");

    if (!stripeFlag) {
      return;
    }

    const cleanedSearchParams = new URLSearchParams(searchParams.toString());
    cleanedSearchParams.delete("stripe");
    const cleanedUrl = cleanedSearchParams.toString()
      ? `/parametres?${cleanedSearchParams.toString()}`
      : "/parametres";

    if (stripeFlag === "return") {
      setFeedback({
        type: "success",
        message: "Le compte Stripe a ete mis a jour. Verifiez maintenant l'etat affiche puis activez le paiement en ligne si tout est pret.",
      });
      router.replace(cleanedUrl);
      void loadSettings();
      return;
    }

    if (stripeFlag === "refresh") {
      setFeedback({
        type: "success",
        message: "Le lien Stripe a ete regenere. Reprenez la configuration si necessaire.",
      });
      router.replace(cleanedUrl);
      void loadSettings();
    }
  }, [loading, router, searchParams, user]);

  const updatePlatformPriceId = (planId, value) => {
    setPlatformForm((current) => ({
      ...current,
      priceIds: {
        ...current.priceIds,
        [planId]: value,
      },
    }));
  };

  const togglePreference = (key) => {
    setLocalPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const managedTaxRates = standardFrenchTaxRates.map((taxRateDefinition) => {
    const matchingTaxRate = taxRates.find(
      (entry) => buildTaxRateKey(entry.rate) === buildTaxRateKey(taxRateDefinition.rate)
    );

    return {
      ...taxRateDefinition,
      id: matchingTaxRate?.id || "",
      is_active:
        matchingTaxRate?.is_active === undefined
          ? taxRateDefinition.defaultActive
          : Boolean(matchingTaxRate.is_active),
      is_default: Number(taxRateDefinition.rate) === 20,
    };
  });

  const updateReservationStatusForm = (code, field, value) => {
    setReservationStatuses((current) =>
      current.map((status) => (status.code === code ? { ...status, [field]: value } : status))
    );
  };

  const handleTaxRateToggle = async (taxRateDefinition) => {
    const matchingTaxRate = taxRates.find(
      (entry) => buildTaxRateKey(entry.rate) === buildTaxRateKey(taxRateDefinition.rate)
    );

    setSavingTaxRate(true);
    setFeedback(null);

    try {
      const response = await apiRequest(
        matchingTaxRate ? `/catalog/tax-rates/${matchingTaxRate.id}` : "/catalog/tax-rates",
        {
          method: matchingTaxRate ? "PUT" : "POST",
          body: {
            name: taxRateDefinition.name,
            rate: Number(taxRateDefinition.rate || 0),
            is_active: !taxRateDefinition.is_active,
            is_default: Number(taxRateDefinition.rate) === 20,
          },
        }
      );
      const savedTaxRate = response.taxRate;
      setTaxRates((current) =>
        [...current.filter((entry) => entry.id !== savedTaxRate.id), savedTaxRate].sort(
          (left, right) => Number(left.rate || 0) - Number(right.rate || 0)
        )
      );
      setFeedback({
        type: "success",
        message: "La configuration TVA a ete mise a jour.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingTaxRate(false);
    }
  };

  const handleAccountSave = async (event) => {
    event.preventDefault();
    setSavingAccount(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/auth/me", {
        method: "PUT",
        body: {
          ...accountForm,
        },
      });

      replaceUser(response.user);
      setFeedback({
        type: "success",
        message: "Le profil du compte a ete mis a jour avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/admin/stripe/settings", {
        method: "PUT",
        body: platformForm,
      });
      setPlatformSettings(response.stripeSettings);
      setPlatformForm(initialPlatformForm);

      setFeedback({
        type: "success",
        message: "Les reglages ont ete enregistres avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSectionChange = (nextSection) => {
    setActiveSection(nextSection);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("section", nextSection);
    router.replace(`/parametres?${nextSearchParams.toString()}`);
  };

  const handleOnlinePaymentToggle = async (nextValue) => {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/customer-payments/settings", {
        method: "PUT",
        body: {
          customerPaymentsEnabled: nextValue,
        },
      });
      setPaymentSettings(response);
      setProviderForm({
        customerPaymentsEnabled: Boolean(response.onlinePayment?.enabled),
      });
      setFeedback({
        type: "success",
        message: nextValue
          ? "Le paiement en ligne est maintenant active sur votre boutique."
          : "Le paiement en ligne a ete desactive sur votre boutique.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStripeConnect = async () => {
    setConnectingStripe(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/customer-payments/connect-link", {
        method: "POST",
      });
      window.location.href = response.url;
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
      setConnectingStripe(false);
    }
  };

  const handleStripeDisconnect = async () => {
    if (
      !window.confirm(
        "Deconnecter ce compte Stripe de Lokify ? Le paiement en ligne sera desactive sur votre boutique."
      )
    ) {
      return;
    }

    setDisconnectingStripe(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/customer-payments/disconnect", {
        method: "POST",
      });
      setPaymentSettings(response);
      setProviderForm({
        customerPaymentsEnabled: false,
      });
      setFeedback({
        type: "success",
        message: "Le compte Stripe a ete deconnecte de votre boutique.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setDisconnectingStripe(false);
    }
  };

  const storefrontHeroImageItems = buildStorefrontHeroImageItems(
    storefrontForm.hero_images,
    pendingStorefrontHeroImages
  );

  const updateStorefrontHeroImageCollections = (updater) => {
    const nextItems = updater(
      buildStorefrontHeroImageItems(
        storefrontFormRef.current.hero_images,
        pendingStorefrontHeroImagesRef.current
      )
    );
    const nextCollections = splitStorefrontHeroImageItems(nextItems);
    const nextStorefrontForm = {
      ...storefrontFormRef.current,
      hero_images: nextCollections.heroImages,
    };
    storefrontFormRef.current = nextStorefrontForm;
    pendingStorefrontHeroImagesRef.current = nextCollections.pendingImages;
    setStorefrontForm(nextStorefrontForm);
    setPendingStorefrontHeroImages(nextCollections.pendingImages);
  };

  const removeStorefrontHeroImageItem = (itemKey) => {
    updateStorefrontHeroImageCollections((currentItems) =>
      currentItems.filter((entry) => entry.key !== itemKey)
    );
  };

  const updatePendingStorefrontHeroImageStatuses = (
    photoIds = [],
    uploadStatus = "ready",
    errorMessage = ""
  ) => {
    const targetIds = new Set((Array.isArray(photoIds) ? photoIds : [photoIds]).filter(Boolean));

    if (!targetIds.size) {
      return;
    }

    updateStorefrontHeroImageCollections((currentItems) =>
      currentItems.map((entry) => {
        if (entry.kind !== "pending" || !targetIds.has(entry.photo.id)) {
          return entry;
        }

        return {
          ...entry,
          photo: normalizePendingStorefrontHeroImage({
            ...entry.photo,
            uploadStatus,
            errorMessage: uploadStatus === "error" ? errorMessage : "",
          }),
        };
      })
    );
  };

  const addStorefrontHeroImages = async (files) => {
    const selectedFiles = Array.from(files || []);

    if (!selectedFiles.length) {
      return;
    }

    const nextPreparation = storefrontHeroImagePreparationRef.current
      .catch(() => undefined)
      .then(async () => {
        const remainingSlots =
          MAX_STOREFRONT_HERO_IMAGES -
          (storefrontFormRef.current.hero_images.length + pendingStorefrontHeroImagesRef.current.length);

        if (remainingSlots <= 0) {
          setFeedback({
            type: "error",
            message: `Vous ne pouvez pas ajouter plus de ${MAX_STOREFRONT_HERO_IMAGES} images sur ce bloc photo.`,
          });
          return;
        }

        const preparedPhotos = [];
        const messages = [];

        for (const file of selectedFiles.slice(0, remainingSlots)) {
          try {
            const preparedPhoto = await prepareImageUpload(file, {
              maxSizeBytes: MAX_IMAGE_UPLOAD_SIZE_BYTES,
              includeDataUrl: true,
            });
            preparedPhotos.push(
              normalizePendingStorefrontHeroImage({
                ...preparedPhoto,
                uploadStatus: "ready",
                errorMessage: "",
              })
            );
          } catch (submissionError) {
            messages.push(buildStorefrontHeroImageErrorMessage(submissionError));
          }
        }

        if (selectedFiles.length > remainingSlots) {
          messages.push(
            `Vous ne pouvez pas ajouter plus de ${MAX_STOREFRONT_HERO_IMAGES} images sur ce bloc photo.`
          );
        }

        if (preparedPhotos.length) {
          updateStorefrontHeroImageCollections((currentItems) => [
            ...currentItems,
            ...buildStorefrontHeroImageItems([], preparedPhotos),
          ]);
          setFeedback({
            type: messages.length ? "error" : "success",
            message: messages[0] || `${preparedPhotos.length} image(s) prete(s) a etre enregistree(s).`,
          });
          return;
        }

        if (messages.length) {
          setFeedback({
            type: "error",
            message: messages[0],
          });
        }
      });

    storefrontHeroImagePreparationRef.current = nextPreparation;
    setPreparingStorefrontHeroImages(true);

    try {
      await nextPreparation;
    } finally {
      if (storefrontHeroImagePreparationRef.current === nextPreparation) {
        setPreparingStorefrontHeroImages(false);
      }
    }
  };

  const handleStorefrontSave = async (event) => {
    event.preventDefault();
    setSavingStorefront(true);
    setFeedback(null);

    await storefrontHeroImagePreparationRef.current.catch(() => undefined);

    const currentStorefrontForm = storefrontFormRef.current;
    const currentPendingStorefrontHeroImages = pendingStorefrontHeroImagesRef.current;
    const currentStorefrontHeroImageItems = buildStorefrontHeroImageItems(
      currentStorefrontForm.hero_images,
      currentPendingStorefrontHeroImages
    );
    const uploadedHeroImages = [];
    const expectedHeroImageCount = currentStorefrontHeroImageItems.length;
    const pendingPhotoIds = currentPendingStorefrontHeroImages.map((photo) => photo.id);

    try {
      updatePendingStorefrontHeroImageStatuses(pendingPhotoIds, "uploading");

      for (const pendingPhoto of currentPendingStorefrontHeroImages) {
        const uploadedPhoto = await uploadStorefrontHeroImage(pendingPhoto);
        uploadedHeroImages.push(uploadedPhoto);
      }

      const savePayload = {
        ...currentStorefrontForm,
        hero_image_uploads: uploadedHeroImages,
        hero_image_sequence: currentStorefrontHeroImageItems.map(
          buildStorefrontHeroImageSequenceEntry
        ),
      };
      const response = await apiRequest("/storefront/settings", {
        method: "PUT",
        body: savePayload,
      });
      const persistedResponse = await apiRequest("/storefront/settings");
      const persistedStorefrontSettings =
        persistedResponse.storefrontSettings || response.storefrontSettings;
      const responseHeroImages = normalizeStorefrontHeroImageUrls(response.storefrontSettings);
      const persistedHeroImages = normalizeStorefrontHeroImageUrls(persistedStorefrontSettings);
      const retainedHeroImageSet = new Set(currentStorefrontForm.hero_images);
      const persistedNewHeroImages = persistedHeroImages.filter(
        (imageUrl) => !retainedHeroImageSet.has(imageUrl)
      );
      const responseMatchesPersisted =
        responseHeroImages.length === persistedHeroImages.length &&
        responseHeroImages.every((imageUrl, index) => imageUrl === persistedHeroImages[index]);
      const persistedIncludesRetainedImages = currentStorefrontForm.hero_images.every((imageUrl) =>
        persistedHeroImages.includes(imageUrl)
      );
      const persistedIncludesUploadedImages =
        currentPendingStorefrontHeroImages.length === 0 ||
        persistedNewHeroImages.length >= currentPendingStorefrontHeroImages.length;

      if (
        persistedHeroImages.length !== expectedHeroImageCount ||
        !responseMatchesPersisted ||
        !persistedIncludesRetainedImages ||
        !persistedIncludesUploadedImages
      ) {
        const verificationError = new Error(
          "Les images du bloc photo n'ont pas pu etre confirmees apres l'enregistrement."
        );
        verificationError.code = "storefront_image_persist_failed";
        throw verificationError;
      }

      setStorefrontSettings(persistedStorefrontSettings);
      setStorefrontForm({
        slug: persistedStorefrontSettings?.slug || "",
        is_published: Boolean(persistedStorefrontSettings?.is_published),
        reservation_approval_mode:
          persistedStorefrontSettings?.reservation_approval_mode || "manual",
        map_enabled: Boolean(persistedStorefrontSettings?.map_enabled),
        map_address: persistedStorefrontSettings?.map_address || "",
        reviews_enabled: Boolean(persistedStorefrontSettings?.reviews_enabled),
        reviews_url: persistedStorefrontSettings?.reviews_url || "",
        hero_images: persistedHeroImages,
      });
      setPendingStorefrontHeroImages([]);
      setFeedback({
        type: "success",
        message: "Les reglages de la boutique en ligne ont ete enregistres.",
      });
    } catch (error) {
      updatePendingStorefrontHeroImageStatuses(
        pendingPhotoIds,
        "error",
        buildStorefrontHeroImageErrorMessage(error)
      );
      await Promise.allSettled(
        uploadedHeroImages.map((upload) =>
          deleteStorefrontTemporaryHeroImage(upload?.temp_object_key || upload?.tempObjectKey)
        )
      );
      setFeedback({
        type: "error",
        message: buildStorefrontHeroImageErrorMessage(error),
      });
    } finally {
      setSavingStorefront(false);
    }
  };

  const handleCopyStorefrontLink = async () => {
    if (!storefrontForm.slug) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        buildStorefrontUrl(storefrontForm.slug, window.location.origin)
      );
      setFeedback({
        type: "success",
        message: "Le lien public de votre boutique en ligne a ete copie.",
      });
    } catch (_error) {
      setFeedback({
        type: "error",
        message: "Impossible de copier le lien public pour le moment.",
      });
    }
  };

  const handleStatusSave = async (event) => {
    event.preventDefault();
    setSavingStatuses(true);
    setFeedback(null);

    try {
      const response = await apiRequest("/reservations/statuses", {
        method: "PUT",
        body: {
          statuses: reservationStatuses.map((status, index) => ({
            code: status.code,
            label: status.label,
            color: status.color,
            position: index,
          })),
        },
      });
      setReservationStatuses(response.statuses || reservationStatuses);
      setFeedback({
        type: "success",
        message: "Les statuts personnalises ont ete enregistres avec succes.",
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSavingStatuses(false);
    }
  };

  const isPlatformMode = isSuperAdmin(user);
  const currentWorkspaceUserLabel = getWorkspaceUserLabel(user, "Non configure");
  const settingSections = isPlatformMode ? superAdminSettingSections : providerSettingSections;
  const activeSectionConfig =
    settingSections.find((section) => section.id === activeSection) || settingSections[0];
  const storefrontPath = storefrontForm.slug ? buildStorefrontPath(storefrontForm.slug) : "";
  const stripeConnection = paymentSettings?.stripe || null;
  const onlinePayment = paymentSettings?.onlinePayment || null;
  const paymentOverview = paymentSettings?.overview || null;
  const storefrontHeroImageCount = storefrontHeroImageItems.length;
  const storefrontMapStatusActive = [
    storefrontForm.map_address,
    storefrontSettings?.map_latitude,
    storefrontSettings?.map_longitude,
    storefrontSettings?.map_lat,
    storefrontSettings?.map_lng,
    storefrontSettings?.latitude,
    storefrontSettings?.longitude,
  ].some(hasStorefrontStatusValue);
  const storefrontReviewsStatusActive = hasStorefrontStatusValue(storefrontForm.reviews_url);
  const storefrontPhotoStatusActive = storefrontHeroImageCount > 0;

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Paramètres</p>
            <h3>{activeSectionConfig?.title}</h3>
            <p>
              {isPlatformMode
                ? "Les informations de paiement restent sécurisées et uniquement visibles dans cet espace."
                : "Vos informations de paiement sont masquées, stockées côté serveur et réservées à votre espace."}
            </p>
          </div>
        </div>

        <div className="settings-category-strip" aria-label="Categories des reglages">
          <SegmentedTabs
            options={settingSections.map((section) => ({
              id: section.id,
              label: section.label,
            }))}
            value={activeSection}
            onChange={handleSectionChange}
            size="sm"
            ariaLabel="Categories des reglages"
          />
        </div>

        {feedback ? (
          <p className={`feedback ${feedback.type === "success" ? "success" : "error"}`}>
            {feedback.message}
          </p>
        ) : null}

        {loading ? (
          <Panel title="Chargement des réglages" description="Préparation de la configuration de paiement.">
            <div className="empty-state">
              <strong>Lecture des réglages</strong>
              <span>Les informations apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!loading && activeSection === "profile" ? (
          <Panel
            title="Mon compte"
            description={
              isPlatformMode
                ? "Le super admin s'affiche toujours comme Super Admin dans le dashboard. Les informations ci-dessous restent liees au compte."
                : "Ce nom est celui affiche en haut a droite du dashboard pour votre compte."
            }
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Libelle actuellement affiche</strong>
                <span className="muted-text">{currentWorkspaceUserLabel}</span>
              </article>
              <article className="detail-card">
                <strong>Email de connexion</strong>
                <span className="muted-text">{user?.email || "Non configure"}</span>
              </article>
              <article className="detail-card">
                <strong>Role</strong>
                <StatusPill tone={isPlatformMode ? "success" : "neutral"}>
                  {roleLabelByAccount[user?.account_role] || "Compte"}
                </StatusPill>
              </article>
              <article className="detail-card">
                <strong>Usage dashboard</strong>
                <span className="muted-text">
                  {isPlatformMode
                    ? 'Le menu du super admin affiche toujours "Super Admin".'
                    : "Le nom enregistre ici est reutilise dans le menu en haut a droite."}
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleAccountSave}>
              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="account-full-name">
                    {isPlatformMode ? "Nom interne du compte" : "Nom affiche"}
                  </label>
                  <input
                    id="account-full-name"
                    value={accountForm.full_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        full_name: event.target.value,
                      }))
                    }
                    placeholder={isPlatformMode ? "Nom interne du super admin" : "Nom du compte"}
                    required
                  />
                  <p className="field-hint">
                    {isPlatformMode
                      ? 'Ce champ reste stocke sur le compte, mais le dashboard super admin affiche toujours "Super Admin".'
                      : "C&apos;est ce texte qui apparait dans le dashboard et dans le menu utilisateur."}
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="account-phone">Telephone</label>
                  <input
                    id="account-phone"
                    type="tel"
                    value={accountForm.phone}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="06 12 34 56 78"
                  />
                </div>
              </div>

              <div className="form-grid two-columns">
                <div className="field">
                  <label htmlFor="account-first-name">Prenom</label>
                  <input
                    id="account-first-name"
                    value={accountForm.first_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        first_name: event.target.value,
                      }))
                    }
                    placeholder="Prenom"
                  />
                </div>

                <div className="field">
                  <label htmlFor="account-last-name">Nom</label>
                  <input
                    id="account-last-name"
                    value={accountForm.last_name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        last_name: event.target.value,
                      }))
                    }
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div className="detail-card">
                <strong>Organisation</strong>
                <p className="muted-text">
                  {isPlatformMode
                    ? 'Le compte conserve ses informations internes, mais l\'interface super admin affiche toujours "Super Admin".'
                    : "Chaque compte peut definir son propre nom affiche ici."}
                </p>
              </div>

              <button type="submit" className="button primary" disabled={savingAccount}>
                {savingAccount ? "Enregistrement..." : "Enregistrer mon profil"}
              </button>
            </form>
          </Panel>
        ) : null}

        {!loading && isPlatformMode && activeSection === "platform-payments" ? (
          <Panel
            title="Paiements plateforme"
            description="Utilisé pour gérer les abonnements des prestataires."
          >
            <div className="detail-grid">
              <article className="detail-card">
                <strong>Cle publique</strong>
                <span className="muted-text">
                  {platformSettings?.stripePublishableKeyPreview || "Non configurée"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Cle secrete</strong>
                <span className="muted-text">
                  {platformSettings?.stripeSecretKeyPreview || "Non configurée"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Webhook secret</strong>
                <span className="muted-text">
                  {platformSettings?.stripeWebhookSecretPreview || "Non configuré"}
                </span>
              </article>
              <article className="detail-card">
                <strong>Dernière mise à jour</strong>
                <span className="muted-text">
                  {platformSettings?.updatedBy || "Pas encore de mise à jour"}
                </span>
              </article>
            </div>

            <form className="form-grid" onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="platform-publishable">Clé publique Stripe</label>
                <input
                  id="platform-publishable"
                  value={platformForm.publishableKey}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      publishableKey: event.target.value,
                    }))
                  }
                  placeholder="pk_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-secret">Clé privée Stripe</label>
                <input
                  id="platform-secret"
                  type="password"
                  value={platformForm.secretKey}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      secretKey: event.target.value,
                    }))
                  }
                  placeholder="sk_..."
                />
              </div>

              <div className="field">
                <label htmlFor="platform-webhook">Secret de notification</label>
                <input
                  id="platform-webhook"
                  type="password"
                  value={platformForm.webhookSecret}
                  onChange={(event) =>
                    setPlatformForm((current) => ({
                      ...current,
                      webhookSecret: event.target.value,
                    }))
                  }
                  placeholder="whsec_..."
                />
              </div>

              {["essential", "pro", "premium"].map((planId) => (
                <div key={planId} className="field">
                  <label htmlFor={`price-${planId}`}>Référence tarifaire {planId}</label>
                  <input
                    id={`price-${planId}`}
                    value={platformForm.priceIds[planId]}
                    onChange={(event) => updatePlatformPriceId(planId, event.target.value)}
                    placeholder="price_..."
                  />
                  <small className="muted-text">
                    Enregistré: {platformSettings?.subscriptionPriceIds?.[planId]?.preview || "non configuré"}
                  </small>
                </div>
              ))}

              <button type="submit" className="button primary" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer la configuration de paiement"}
              </button>
            </form>
          </Panel>
        ) : null}

        {!loading && !isPlatformMode ? (
          <>
            {activeSection === "taxes" ? (
              <Panel
                title="TVA"
                description="Activez uniquement les TVA francaises que vous utilisez. La TVA 20 % reste la valeur par defaut du catalogue."
              >
              <div className="card-list">
                {managedTaxRates.map((taxRate) => (
                  <article key={taxRate.rate} className="detail-card">
                    <div className="row-actions">
                      <div>
                        <strong>{taxRate.name}</strong>
                        <p className="muted-text">{taxRate.helper}</p>
                      </div>
                      <StatusPill tone={taxRate.is_active ? "success" : "neutral"}>
                        {taxRate.is_active ? "Active" : "Inactive"}
                      </StatusPill>
                    </div>

                    <div className="row-actions">
                      <span className="muted-text">
                        {taxRate.is_default ? "TVA par defaut" : "TVA optionnelle"}
                      </span>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => void handleTaxRateToggle(taxRate)}
                        disabled={savingTaxRate}
                      >
                        {taxRate.is_active ? "Desactiver" : "Activer"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              </Panel>
            ) : null}

            {activeSection === "statuses" ? (
            <Panel
              title="Statuts réservations"
              description="Les 5 statuts restent simples, lisibles et personnalisables par prestataire."
            >
              <form className="form-grid" onSubmit={handleStatusSave}>
                <div className="card-list">
                  {reservationStatuses.map((status) => (
                    <article key={status.code} className="detail-card">
                      <div className="row-actions">
                        <strong>{status.code}</strong>
                        <StatusPill tone="neutral" color={status.color}>
                          {status.label}
                        </StatusPill>
                      </div>

                      <div className="form-grid two-columns">
                        <div className="field">
                          <label htmlFor={`status-label-${status.code}`}>Nom</label>
                          <input
                            id={`status-label-${status.code}`}
                            value={status.label}
                            onChange={(event) =>
                              updateReservationStatusForm(status.code, "label", event.target.value)
                            }
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`status-color-${status.code}`}>Couleur</label>
                          <input
                            id={`status-color-${status.code}`}
                            type="color"
                            value={status.color}
                            onChange={(event) =>
                              updateReservationStatusForm(status.code, "color", event.target.value)
                            }
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <button type="submit" className="button primary" disabled={savingStatuses}>
                  {savingStatuses ? "Enregistrement..." : "Enregistrer les statuts"}
                </button>
              </form>
            </Panel>
            ) : null}

            {activeSection === "payments" ? (
            <Panel
              title="Paiement en ligne"
              description="Connectez Stripe, verifiez l'etat du compte et choisissez si votre boutique doit proposer le paiement en ligne."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Etat du compte Stripe</strong>
                  <StatusPill tone={stripeToneByStatus[stripeConnection?.status] || "neutral"}>
                    {stripeConnection?.statusLabel || "Compte Stripe non connecte"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Paiement en ligne</strong>
                  <StatusPill tone={onlinePaymentToneByStatus[onlinePayment?.status] || "neutral"}>
                    {onlinePayment?.enabled ? "Active" : "Desactive"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Paiements actives</strong>
                  <span className="muted-text">
                    {stripeConnection?.chargesEnabled ? "Oui" : "Non"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Virements actives</strong>
                  <span className="muted-text">
                    {stripeConnection?.payoutsEnabled ? "Oui" : "Non"}
                  </span>
                </article>
              </div>

              <div className="card-list">
                <article className="detail-card">
                  <div className="row-actions">
                    <div>
                      <strong>Etat du compte Stripe</strong>
                      <p className="muted-text">
                        {stripeConnection?.displayName
                          ? `Compte connecte: ${stripeConnection.displayName}`
                          : "Connectez votre compte Stripe pour recevoir les paiements de votre boutique."}
                      </p>
                    </div>
                    <StatusPill tone={stripeToneByStatus[stripeConnection?.status] || "neutral"}>
                      {stripeConnection?.statusLabel || "Compte Stripe non connecte"}
                    </StatusPill>
                  </div>

                  <p className="muted-text">
                    {stripeConnection?.syncError ||
                      stripeConnection?.requirementsSummary ||
                      (stripeConnection?.chargesEnabled && stripeConnection?.payoutsEnabled
                        ? "Votre compte Stripe est pret a accepter les paiements et les virements."
                        : "Finalisez votre compte Stripe pour activer les paiements et les virements.")}
                  </p>

                  {stripeConnection?.requirementsDue?.length ? (
                    <ul className="public-shop-cart-issues">
                      {stripeConnection.requirementsDue.map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                  ) : null}

                  {stripeConnection?.disabledReason ? (
                    <p className="field-hint">Action requise Stripe: {stripeConnection.disabledReason}</p>
                  ) : null}

                  <div className="row-actions">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void handleStripeConnect()}
                      disabled={connectingStripe || disconnectingStripe || !stripeConnection?.platformReady}
                    >
                      {connectingStripe
                        ? "Ouverture..."
                        : stripeConnection?.connected
                          ? onlinePayment?.canEnable
                            ? "Mettre a jour Stripe"
                            : "Finaliser Stripe"
                          : "Connecter mon compte Stripe"}
                    </button>

                    {stripeConnection?.connected ? (
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => void handleStripeDisconnect()}
                        disabled={disconnectingStripe || connectingStripe}
                      >
                        {disconnectingStripe ? "Deconnexion..." : "Deconnecter"}
                      </button>
                    ) : null}
                  </div>

                  {!stripeConnection?.platformReady ? (
                    <p className="field-hint">
                      La configuration Stripe de la plateforme n&apos;est pas encore disponible.
                    </p>
                  ) : null}
                </article>

                <article className="detail-card">
                  <div className="row-actions">
                    <div>
                      <strong>Paiement en ligne</strong>
                      <p className="muted-text">
                        Lorsque le paiement en ligne est active, vos clients peuvent regler
                        directement leurs reservations sur votre boutique en ligne.
                      </p>
                    </div>
                    <StatusPill tone={onlinePaymentToneByStatus[onlinePayment?.status] || "neutral"}>
                      {providerForm.customerPaymentsEnabled
                        ? "Paiement en ligne active"
                        : "Paiement en ligne desactive"}
                    </StatusPill>
                  </div>

                  <p className="muted-text">
                    {onlinePayment?.message ||
                      "Connectez Stripe pour proposer ensuite le paiement en ligne sur votre boutique."}
                  </p>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => void handleOnlinePaymentToggle(true)}
                      disabled={
                        saving || providerForm.customerPaymentsEnabled || !onlinePayment?.canEnable
                      }
                    >
                      {saving && !providerForm.customerPaymentsEnabled
                        ? "Activation..."
                        : "Activer le paiement en ligne"}
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => void handleOnlinePaymentToggle(false)}
                      disabled={saving || !providerForm.customerPaymentsEnabled}
                    >
                      {saving && providerForm.customerPaymentsEnabled
                        ? "Desactivation..."
                        : "Desactiver le paiement en ligne"}
                    </button>
                  </div>

                  {!onlinePayment?.canEnable ? (
                    <p className="field-hint">
                      Le paiement en ligne reste bloque tant que le compte Stripe n&apos;est pas
                      connecte et finalise.
                    </p>
                  ) : null}
                </article>

                <article className="detail-card">
                  <div className="row-actions">
                    <div>
                      <strong>Etat general</strong>
                      <p className="muted-text">
                        Vue d&apos;ensemble de la disponibilite des paiements sur votre boutique.
                      </p>
                    </div>
                    <StatusPill tone={paymentOverview?.paymentAvailable ? "success" : "neutral"}>
                      {paymentOverview?.label || "Paiements indisponibles"}
                    </StatusPill>
                  </div>

                  <p className="muted-text">
                    {paymentOverview?.message ||
                      "Connectez Stripe et finalisez la configuration pour proposer le paiement en ligne."}
                  </p>

                  <div className="detail-grid">
                    <article className="detail-card">
                      <strong>Compte Stripe</strong>
                      <span className="muted-text">
                        {stripeConnection?.connected ? "Connecte" : "Non connecte"}
                      </span>
                    </article>
                    <article className="detail-card">
                      <strong>Paiement en ligne</strong>
                      <span className="muted-text">
                        {providerForm.customerPaymentsEnabled ? "Active" : "Desactive"}
                      </span>
                    </article>
                  </div>
                </article>
              </div>
            </Panel>
            ) : null}

            {activeSection === "storefront" ? (
            <Panel
              title="Boutique en ligne"
              description="Gerez ici le lien public, l'activation et le mode de validation des reservations en ligne."
            >
              <div className="detail-grid">
                <article className="detail-card">
                  <strong>Statut</strong>
                  <StatusPill tone={storefrontSettings?.is_published ? "success" : "neutral"}>
                    {storefrontSettings?.is_published ? "Publiee" : "Non publiee"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Slug public</strong>
                  <span className="muted-text">
                    {storefrontSettings?.slug || "Aucun slug disponible"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Validation</strong>
                  <span className="muted-text">
                    {storefrontSettings?.reservation_approval_mode === "automatic"
                      ? "Automatique"
                      : "Manuelle"}
                  </span>
                </article>
                <article className="detail-card">
                  <strong>Lien public</strong>
                  <span className="muted-text">{storefrontPath || "Indisponible"}</span>
                </article>
                <article className="detail-card">
                  <strong>Carte</strong>
                  <StatusPill tone={storefrontMapStatusActive ? "success" : "neutral"}>
                    {storefrontMapStatusActive ? "Actif" : "Inactif"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Avis Google</strong>
                  <StatusPill tone={storefrontReviewsStatusActive ? "success" : "neutral"}>
                    {storefrontReviewsStatusActive ? "Actif" : "Inactif"}
                  </StatusPill>
                </article>
                <article className="detail-card">
                  <strong>Bloc photo</strong>
                  <StatusPill tone={storefrontPhotoStatusActive ? "success" : "neutral"}>
                    {storefrontPhotoStatusActive ? "Actif" : "Inactif"}
                  </StatusPill>
                </article>
              </div>

              <form className="form-grid" onSubmit={handleStorefrontSave}>
                <div className="field">
                  <label htmlFor="storefront-slug">Slug boutique</label>
                  <input
                    id="storefront-slug"
                    value={storefrontForm.slug}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                    placeholder="ma-boutique"
                  />
                  <p className="field-hint">
                    URL publique: {storefrontPath || "/shop/votre-slug"}. Le slug est normalise,
                    unique et un changement de slug est limite dans le temps.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="storefront-approval-mode">Validation des reservations</label>
                  <select
                    id="storefront-approval-mode"
                    value={storefrontForm.reservation_approval_mode}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        reservation_approval_mode: event.target.value,
                      }))
                    }
                  >
                    <option value="manual">Manuelle</option>
                    <option value="automatic">Automatique</option>
                  </select>
                  <p className="field-hint">
                    En mode automatique, les reservations publiques passent directement en confirme.
                    En mode manuel, elles restent en attente de confirmation.
                  </p>
                </div>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={storefrontForm.is_published}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        is_published: event.target.checked,
                      }))
                    }
                  />
                  <span>Activer la boutique en ligne</span>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={storefrontForm.map_enabled}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        map_enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Afficher la carte et l&apos;adresse</span>
                </label>

                <div className="field">
                  <label htmlFor="storefront-map-address">Adresse pour la carte</label>
                  <input
                    id="storefront-map-address"
                    value={storefrontForm.map_address}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        map_address: event.target.value,
                      }))
                    }
                    placeholder="12 rue exemple, 75000 Paris"
                  />
                  <p className="field-hint">
                    Utilisee dans le bloc emplacement de la boutique publique.
                  </p>
                </div>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={storefrontForm.reviews_enabled}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        reviews_enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Afficher les avis Google</span>
                </label>

                <div className="field">
                  <label htmlFor="storefront-reviews-url">Lien Google avis</label>
                  <input
                    id="storefront-reviews-url"
                    value={storefrontForm.reviews_url}
                    onChange={(event) =>
                      setStorefrontForm((current) => ({
                        ...current,
                        reviews_url: event.target.value,
                      }))
                    }
                    placeholder="https://g.page/r/..."
                  />
                  <p className="field-hint">
                    Utilise pour le bouton et la redirection de la section avis.
                  </p>
                </div>

                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>Bloc photo public</h4>
                      <p>
                        Ajoutez jusqu&apos;a {MAX_STOREFRONT_HERO_IMAGES} images pour piloter le visuel
                        du hero public sans modifier sa mise en page.
                      </p>
                    </div>
                  </div>

                  <label className="button ghost" htmlFor="storefront-hero-images">
                    Ajouter des photos
                  </label>
                  <input
                    id="storefront-hero-images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(event) => {
                      void addStorefrontHeroImages(event.target.files);
                      event.target.value = "";
                    }}
                  />

                  <p className="field-hint">
                    JPG, PNG ou WebP. Taille maximale par fichier:{" "}
                    {Math.round(MAX_IMAGE_UPLOAD_SIZE_BYTES / (1024 * 1024))} Mo. Les images sont
                    optimisees automatiquement apres l&apos;envoi.
                  </p>

                  <div className="editor-section-grid two-columns">
                    <div className="detail-card catalog-media-summary-card">
                      <strong>Images enregistrees</strong>
                      <span className="muted-text">
                        {storefrontHeroImageCount
                          ? `${storefrontHeroImageCount} image(s) preparee(s) ou conservee(s) sur ${MAX_STOREFRONT_HERO_IMAGES}`
                          : "Aucune image specifique pour le moment."}
                      </span>
                    </div>

                    <div className="detail-card catalog-media-summary-card">
                      <strong>Comportement public</strong>
                      <span className="muted-text">
                        {storefrontHeroImageCount <= 1
                          ? "1 image: affichage fixe. 0 image: fallback actuel conserve."
                          : `${storefrontHeroImageCount} images: defilement automatique toutes les 4 secondes.`}
                      </span>
                    </div>
                  </div>

                  {storefrontHeroImageItems.length ? (
                    <div className="storefront-hero-thumb-grid" aria-label="Miniatures du bloc photo">
                      {storefrontHeroImageItems.map((photoItem, index) => (
                        <article key={photoItem.key} className="storefront-hero-thumb-card">
                          <div className="storefront-hero-thumb-media">
                            <img
                              src={photoItem.url}
                              alt={`Bloc photo boutique ${index + 1}`}
                            />
                          </div>
                          <div className="storefront-hero-thumb-body">
                            <div className="storefront-hero-thumb-row">
                              <strong>{`Image ${index + 1}`}</strong>
                              <span className="storefront-hero-thumb-order">{index + 1}</span>
                            </div>
                            <span
                              className="muted-text storefront-hero-thumb-status"
                              title={
                                photoItem.kind === "pending" &&
                                photoItem.photo.uploadStatus === "error"
                                  ? photoItem.photo.errorMessage ||
                                    "L'image n'a pas pu etre enregistree."
                                  : undefined
                              }
                            >
                              {buildStorefrontHeroImageStatusLabel(photoItem)}
                            </span>
                          </div>
                          <div className="storefront-hero-thumb-actions">
                            <button
                              type="button"
                              className="button subtle"
                              onClick={() => removeStorefrontHeroImageItem(photoItem.key)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>Aucune image personnalisee</strong>
                      <span>
                        Le bloc photo public continue d&apos;utiliser son comportement actuel tant
                        qu&apos;aucune image n&apos;est enregistree ici.
                      </span>
                    </div>
                  )}
                </div>

                <div className="row-actions">
                  <button
                    type="submit"
                    className="button primary"
                    disabled={savingStorefront || preparingStorefrontHeroImages}
                  >
                    {savingStorefront || preparingStorefrontHeroImages
                      ? storefrontHeroImageItems.length
                        ? "Import et enregistrement..."
                        : "Enregistrement..."
                      : "Enregistrer la boutique en ligne"}
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => void handleCopyStorefrontLink()}
                    disabled={!storefrontForm.slug}
                  >
                    Copier le lien
                  </button>
                  {storefrontPath ? (
                    <Link
                      href={storefrontPath}
                      className="button secondary"
                      target="_blank"
                      prefetch={false}
                    >
                      Voir ma boutique en ligne
                    </Link>
                  ) : null}
                </div>
              </form>
            </Panel>
            ) : null}

            {activeSection === "preferences" ? (
            <Panel
              title="Preferences"
              description="Activez uniquement les options utiles a votre organisation."
            >
              <div className="card-list">
                {[
                  ["delivery_mode", "Mode de livraison", "Afficher les tournees et options logistiques."],
                  ["customer_notifications", "Notification client", "Preparer les messages de suivi et de rappel."],
                  ["accounting_export", "Export comptable", "Structurer un export compatible avec vos outils comptables."],
                ].map(([key, label, helper]) => (
                  <label key={key} className="detail-card">
                    <strong>{label}</strong>
                    <div className="row-actions">
                      <input
                        type="checkbox"
                        checked={localPreferences[key]}
                        onChange={() => togglePreference(key)}
                      />
                      <span className="muted-text">{helper}</span>
                    </div>
                  </label>
                ))}
              </div>
            </Panel>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsPageContent />
    </Suspense>
  );
}
