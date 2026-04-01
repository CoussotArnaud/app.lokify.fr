"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import StorefrontCatalogStage from "../../../components/storefront/catalog";
import {
  StorefrontCategoriesSection,
  StorefrontFeaturedSection,
  StorefrontFooter,
  StorefrontGuideSection,
  StorefrontHero,
  StorefrontReassuranceStrip,
  StorefrontReviewsSection,
  StorefrontTopbar,
} from "../../../components/storefront/sections";
import StatusPill from "../../../components/status-pill";
import { apiRequest } from "../../../lib/api";
import { formatCurrency } from "../../../lib/date";
import { buildStorefrontPath } from "../../../lib/storefront";

const buildDateValue = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const initialShopState = {
  loading: true,
  error: "",
  data: null,
};

const initialCustomerForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

const availabilityMeta = {
  available: {
    label: "Disponible",
    tone: "success",
  },
  limited: {
    label: "Disponibilite limitee",
    tone: "warning",
  },
  unavailable: {
    label: "Indisponible",
    tone: "danger",
  },
};

const availabilityMessageByReason = {
  available: "Disponible a la reservation",
  period: "Produit indisponible sur cette periode",
  stock: "Produit en rupture de stock",
};

const defaultStorefrontReviewCards = [
  {
    id: "review-1",
    author: "Parcours rassurant",
    copy: "Le choix des dates, la lecture du panier et la demande finale sont restes tres simples du debut a la fin.",
  },
  {
    id: "review-2",
    author: "Selection bien presentee",
    copy: "Les produits sont faciles a comparer, les tarifs sont clairs et la boutique donne envie de reserver.",
  },
  {
    id: "review-3",
    author: "Validation sans friction",
    copy: "On comprend vite comment avancer, avec les bons reperes sur la disponibilite, la logistique et la validation.",
  },
];

const getDurationInDays = (startDateValue, endDateValue) => {
  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 1;
  }

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

const formatCompactDate = (value) => {
  if (!value) {
    return "--";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

const initialVisibleProductCount = 50;

const normalizeNumber = (value, fallback = 0) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const buildCartEntryId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildCartEntrySignature = (entry) => {
  const optionKey = [...new Set(Array.isArray(entry.option_ids) ? entry.option_ids : [])]
    .filter(Boolean)
    .sort()
    .join(",");

  return [
    String(entry.entry_type || "product"),
    String(entry.item_id || ""),
    String(entry.pack_id || ""),
    optionKey,
  ].join("::");
};

const clampPositiveQuantity = (value, fallback = 1) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

const normalizeOptionIds = (value) =>
  [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))].sort();

const buildAvailabilityMessage = (label, reason) =>
  reason === "stock"
    ? `${label} est en rupture de stock.`
    : `${label} est indisponible sur cette periode.`;

const getStorefrontDraftStorageKey = (slug) => {
  const normalizedSlug = String(slug || "").trim();
  return normalizedSlug ? `lokify:storefront:public:${normalizedSlug}` : "";
};

const buildStorefrontLiveStatus = () => {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const isOpen = currentDay !== 0 && currentHour >= 9 && currentHour < 19;

  return {
    isOpen,
    label: isOpen ? "Actuellement ouvert" : "Actuellement ferme",
    tone: isOpen ? "success" : "neutral",
  };
};

export default function PublicStorefrontPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : String(params?.slug || "");
  const checkoutStatus = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id") || "";
  const searchParamsString = searchParams.toString();
  const draftStorageKey = getStorefrontDraftStorageKey(slug);
  const [shopState, setShopState] = useState(initialShopState);
  const [bookingForm, setBookingForm] = useState({
    start_date: buildDateValue(1),
    end_date: buildDateValue(2),
    start_time: "10:00",
    end_time: "10:00",
  });
  const [cartEntries, setCartEntries] = useState([]);
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalizingCheckout, setIsFinalizingCheckout] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [productConfigurator, setProductConfigurator] = useState(null);
  const [productPreview, setProductPreview] = useState(null);
  const [visibleProductLimit, setVisibleProductLimit] = useState(initialVisibleProductCount);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [showCatalog, setShowCatalog] = useState(true);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");
  const [featuredOffset, setFeaturedOffset] = useState(0);

  useEffect(() => {
    if (!draftStorageKey) {
      setDraftReady(false);
      return;
    }

    try {
      const rawDraft = window.sessionStorage.getItem(draftStorageKey);

      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft);

        if (parsedDraft?.bookingForm) {
          setBookingForm((current) => ({
            ...current,
            ...parsedDraft.bookingForm,
          }));
        }

        if (Array.isArray(parsedDraft?.cartEntries)) {
          setCartEntries(parsedDraft.cartEntries);
        }

        if (parsedDraft?.customerForm) {
          setCustomerForm((current) => ({
            ...current,
            ...parsedDraft.customerForm,
          }));
        }
      }
    } catch (_error) {
      // Ignore corrupted draft state and continue with the default storefront state.
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftReady || !draftStorageKey) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          bookingForm,
          cartEntries,
          customerForm,
        })
      );
    } catch (_error) {
      // Ignore storage write errors and keep the storefront usable.
    }
  }, [bookingForm, cartEntries, customerForm, draftReady, draftStorageKey]);

  useEffect(() => {
    if (!slug) {
      setShopState({
        loading: false,
        error: "Boutique introuvable.",
        data: null,
      });
      return;
    }

    const startDate = new Date(bookingForm.start_date);
    const endDate = new Date(bookingForm.end_date);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      setShopState({
        loading: false,
        error: "La date de fin doit etre posterieure a la date de debut.",
        data: null,
      });
      return;
    }

    let cancelled = false;

    const loadStorefront = async () => {
      setShopState((current) => ({
        ...current,
        loading: true,
        error: "",
      }));

      try {
        const response = await apiRequest(
          `/public/storefront/${encodeURIComponent(slug)}?start=${encodeURIComponent(
            bookingForm.start_date
          )}&end=${encodeURIComponent(bookingForm.end_date)}`,
          { auth: false }
        );

        if (cancelled) {
          return;
        }

        setShopState({
          loading: false,
          error: "",
          data: response,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setShopState({
          loading: false,
          error: error.message || "Impossible de charger cette boutique.",
          data: null,
        });
      }
    };

    void loadStorefront();

    return () => {
      cancelled = true;
    };
  }, [slug, bookingForm.start_date, bookingForm.end_date, reloadVersion]);

  const products = shopState.data?.products || [];
  const packs = shopState.data?.packs || [];
  const categories = Array.isArray(shopState.data?.categories) ? shopState.data.categories : [];
  const featuredProducts = Array.isArray(shopState.data?.featured_products)
    ? shopState.data.featured_products
    : [];
  const durationDays = getDurationInDays(bookingForm.start_date, bookingForm.end_date);
  const storefront = shopState.data?.storefront || null;
  const storefrontName = storefront?.display_name || "Boutique Lokify";
  const visibleProductCount = shopState.data?.summary?.visible_products || 0;
  const visiblePackCount = shopState.data?.summary?.visible_packs || packs.length;
  const selectableProductCount =
    shopState.data?.summary?.selectable_products ||
    products.filter((product) => normalizeNumber(product.available_quantity) > 0).length;
  const selectablePackCount =
    shopState.data?.summary?.selectable_packs ||
    packs.filter((pack) => normalizeNumber(pack.available_quantity) > 0).length;
  const publicPath = shopState.data?.storefront?.slug
    ? buildStorefrontPath(shopState.data.storefront.slug)
    : buildStorefrontPath(slug);
  const providerLocation = storefront?.city || "Boutique publique";
  const storefrontLiveStatus = buildStorefrontLiveStatus();
  const compactPeriodLabel = `${formatCompactDate(bookingForm.start_date)} - ${formatCompactDate(
    bookingForm.end_date
  )}`;
  const heroImage = featuredProducts[0]?.thumbnail || products[0]?.thumbnail || "";
  const mapAddress = storefront?.map_address || "";
  const mapEmbedUrl = mapAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapAddress)}&output=embed`
    : "";
  const reviewCards = storefront?.reviews_enabled ? defaultStorefrontReviewCards : [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const packById = new Map(packs.map((pack) => [pack.id, pack]));
  const paymentSummary = shopState.data?.online_payment || {
    enabled: false,
    mode: "request",
    label: "Validation sur demande",
    description: "Composez votre selection puis envoyez-la au prestataire pour confirmation.",
  };
  const checkoutActionLabel = paymentSummary.enabled
    ? "Finaliser et payer"
    : "Finaliser ma demande";
  const checkoutSubmitLabel = isSubmitting
    ? paymentSummary.enabled
      ? "Redirection..."
      : "Enregistrement..."
    : paymentSummary.enabled
      ? "Continuer vers le paiement"
      : "Envoyer ma demande";
  const clearDraft = () => {
    if (!draftStorageKey) {
      return;
    }

    try {
      window.sessionStorage.removeItem(draftStorageKey);
    } catch (_error) {
      // Ignore storage cleanup failures after checkout.
    }
  };
  const cleanCheckoutReturnParams = () => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    nextSearchParams.delete("checkout");
    nextSearchParams.delete("session_id");
    const nextQuery = nextSearchParams.toString();

    router.replace(nextQuery ? `${publicPath}?${nextQuery}` : publicPath);
  };

  useEffect(() => {
    const hasOpenModal =
      isCheckoutModalOpen || Boolean(productConfigurator) || Boolean(productPreview);

    if (!hasOpenModal) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting && !isFinalizingCheckout) {
        setIsCheckoutModalOpen(false);
        setProductConfigurator(null);
        setProductPreview(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCheckoutModalOpen, productConfigurator, productPreview, isFinalizingCheckout, isSubmitting]);

  useEffect(() => {
    if (!checkoutStatus) {
      return;
    }

    if (checkoutStatus === "cancel") {
      setSubmitError("Le paiement en ligne a ete annule. Vous pouvez reprendre votre panier.");
      setSuccessMessage("");
      setIsCheckoutModalOpen(false);
      cleanCheckoutReturnParams();
      return;
    }

    if (checkoutStatus !== "success" || !checkoutSessionId) {
      return;
    }

    let cancelled = false;

    const finalizeCheckout = async () => {
      setIsFinalizingCheckout(true);
      setSubmitError("");
      setSuccessMessage("");

      try {
        const response = await apiRequest(
          `/public/storefront/${encodeURIComponent(slug)}/checkout-sessions/${encodeURIComponent(
            checkoutSessionId
          )}/finalize`,
          { method: "POST", auth: false }
        );

        if (cancelled) {
          return;
        }

        clearDraft();
        setSuccessMessage(
          response.reservation?.status === "confirmed"
            ? `Paiement confirme. Reservation ${response.reservation.reference} enregistree.`
            : `Paiement confirme. Reservation ${response.reservation.reference} transmise au prestataire.`
        );
        setCustomerForm(initialCustomerForm);
        setCartEntries([]);
        setIsCheckoutModalOpen(false);
        setProductConfigurator(null);
        setReloadVersion((currentValue) => currentValue + 1);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSubmitError(error.message || "Impossible de confirmer ce paiement en ligne.");
      } finally {
        if (!cancelled) {
          setIsFinalizingCheckout(false);
          cleanCheckoutReturnParams();
        }
      }
    };

    void finalizeCheckout();

    return () => {
      cancelled = true;
    };
  }, [
    checkoutSessionId,
    checkoutStatus,
    draftStorageKey,
    publicPath,
    router,
    searchParamsString,
    slug,
  ]);

  useEffect(() => {
    setVisibleProductLimit(initialVisibleProductCount);
  }, [activeCategoryFilter]);

  useEffect(() => {
    setFeaturedOffset(0);
  }, [featuredProducts.length]);

  let totalEstimatedAmount = 0;
  let totalEstimatedDeposit = 0;
  let totalRequestedQuantity = 0;
  const requestedQuantityByItemId = new Map();

  const preliminaryCartEntries = cartEntries.map((entry) => {
    const quantity = clampPositiveQuantity(entry.quantity, 1);
    const optionIds = normalizeOptionIds(entry.option_ids);

    if (entry.entry_type === "pack") {
      const pack = packById.get(entry.pack_id) || null;
      const sourceItems = pack
        ? (Array.isArray(pack.products) ? pack.products : []).map((product) => ({
            item_id: product.item_id,
            public_name: product.public_name,
            requested_quantity: quantity,
          }))
        : [];
      const unitPrice = pack ? normalizeNumber(pack.price) : 0;
      const entryTotal = unitPrice * quantity * durationDays;
      const depositTotal = pack ? normalizeNumber(pack.deposit) * quantity : 0;

      totalEstimatedAmount += entryTotal;
      totalEstimatedDeposit += depositTotal;
      totalRequestedQuantity += quantity;
      sourceItems.forEach((item) => {
        requestedQuantityByItemId.set(
          item.item_id,
          (requestedQuantityByItemId.get(item.item_id) || 0) + quantity
        );
      });

      return {
        ...entry,
        quantity,
        option_ids: optionIds,
        label: pack?.name || "Pack indisponible",
        description: pack?.description || "",
        entry_type_label: "Pack",
        status: pack?.status || "unavailable",
        availability_reason: pack?.availability_reason || "period",
        available_quantity: normalizeNumber(pack?.available_quantity),
        unit_price: unitPrice,
        entry_total: entryTotal,
        deposit_total: depositTotal,
        source_items: sourceItems,
        selected_options: [],
        invalid_option_ids: [],
        missing_required_options: [],
        reference_missing: !pack,
        included_products: Array.isArray(pack?.products) ? pack.products : [],
      };
    }

    const product = productById.get(entry.item_id) || null;
    const availableOptions = Array.isArray(product?.options) ? product.options : [];
    const optionById = new Map(availableOptions.map((option) => [option.id, option]));
    const selectedOptions = optionIds.map((optionId) => optionById.get(optionId)).filter(Boolean);
    const invalidOptionIds = optionIds.filter((optionId) => !optionById.has(optionId));
    const missingRequiredOptions = availableOptions.filter(
      (option) => option.required && !optionIds.includes(option.id)
    );
    const optionsPrice = selectedOptions.reduce(
      (sum, option) => sum + normalizeNumber(option.price),
      0
    );
    const unitPrice = normalizeNumber(product?.price) + optionsPrice;
    const entryTotal = unitPrice * quantity * durationDays;
    const depositTotal = normalizeNumber(product?.deposit) * quantity;
    const sourceItems = product
      ? [
          {
            item_id: product.id,
            public_name: product.public_name,
            requested_quantity: quantity,
          },
        ]
      : [];

    totalEstimatedAmount += entryTotal;
    totalEstimatedDeposit += depositTotal;
    totalRequestedQuantity += quantity;
    sourceItems.forEach((item) => {
      requestedQuantityByItemId.set(
        item.item_id,
        (requestedQuantityByItemId.get(item.item_id) || 0) + quantity
      );
    });

    return {
      ...entry,
      quantity,
      option_ids: optionIds,
      label: product?.public_name || "Produit indisponible",
      description: product?.public_description || "",
      entry_type_label: "Produit",
      status: product?.status || "unavailable",
      availability_reason: product?.availability_reason || "period",
      available_quantity: normalizeNumber(product?.available_quantity),
      unit_price: unitPrice,
      entry_total: entryTotal,
      deposit_total: depositTotal,
      source_items: sourceItems,
      selected_options: selectedOptions,
      invalid_option_ids: invalidOptionIds,
      missing_required_options: missingRequiredOptions,
      reference_missing: !product,
      included_products: [],
    };
  });

  const availabilityIssues = [];
  preliminaryCartEntries.forEach((entry) => {
    if (entry.reference_missing) {
      availabilityIssues.push(`${entry.entry_type_label} "${entry.label}" n'est plus visible en boutique.`);
    }

    if (entry.invalid_option_ids.length) {
      availabilityIssues.push(`Une option choisie sur "${entry.label}" n'est plus disponible.`);
    }

    if (entry.missing_required_options.length) {
      availabilityIssues.push(
        `Les options obligatoires de "${entry.label}" doivent etre selectionnees avant validation.`
      );
    }
  });

  requestedQuantityByItemId.forEach((requestedQuantity, itemId) => {
    const product = productById.get(itemId);

    if (!product) {
      availabilityIssues.push("Un produit du panier n'est plus accessible.");
      return;
    }

    if (requestedQuantity > normalizeNumber(product.available_quantity)) {
      availabilityIssues.push(
        buildAvailabilityMessage(product.public_name, product.availability_reason || "period")
      );
    }
  });

  const uniqueAvailabilityIssues = [...new Set(availabilityIssues)];
  const resolvedCartEntries = preliminaryCartEntries.map((entry) => {
    const entryIssues = [];

    if (entry.reference_missing) {
      entryIssues.push(`${entry.entry_type_label} indisponible`);
    }

    if (entry.invalid_option_ids.length) {
      entryIssues.push("Options non disponibles");
    }

    if (entry.missing_required_options.length) {
      entryIssues.push("Options obligatoires manquantes");
    }

    entry.source_items.forEach((item) => {
      const product = productById.get(item.item_id);
      const requestedQuantity = requestedQuantityByItemId.get(item.item_id) || 0;

      if (product && requestedQuantity > normalizeNumber(product.available_quantity)) {
        entryIssues.push(
          buildAvailabilityMessage(product.public_name, product.availability_reason || "period")
        );
      }
    });

    return {
      ...entry,
      issue_messages: [...new Set(entryIssues)],
      is_available: entryIssues.length === 0,
    };
  });

  const cartHasEntries = resolvedCartEntries.length > 0;
  const cartReadyForCheckout =
    cartHasEntries && !shopState.loading && !shopState.error && !uniqueAvailabilityIssues.length;
  const cartStatusTone = !cartHasEntries
    ? "neutral"
    : uniqueAvailabilityIssues.length
      ? "danger"
      : shopState.loading
        ? "warning"
        : "success";
  const cartStatusLabel = !cartHasEntries
    ? "Pret a composer"
    : uniqueAvailabilityIssues.length
      ? "Verification requise"
      : shopState.loading
        ? "Analyse en cours"
        : "Panier pret";
  const filteredProducts =
    activeCategoryFilter === "all"
      ? products
      : products.filter((product) => product.category_slug === activeCategoryFilter);
  const visibleProducts = filteredProducts.slice(0, visibleProductLimit);
  const showLoadMoreProducts = filteredProducts.length > visibleProductLimit;
  const configuratorProduct = productConfigurator ? productById.get(productConfigurator.item_id) || null : null;
  const previewedProduct = productPreview ? productById.get(productPreview.item_id) || null : null;
  const previewPhotos = previewedProduct
    ? Array.isArray(previewedProduct.photos) && previewedProduct.photos.length
      ? previewedProduct.photos
      : previewedProduct.thumbnail
        ? [previewedProduct.thumbnail]
        : []
    : [];
  const activePreviewPhotoIndex =
    productPreview && previewPhotos.length
      ? Math.min(productPreview.activePhotoIndex || 0, previewPhotos.length - 1)
      : 0;
  const activePreviewPhoto = previewPhotos[activePreviewPhotoIndex] || "";
  const shouldShowCatalog = showCatalog || cartHasEntries;
  const featuredPageSize = 5;
  const visibleFeaturedProducts = featuredProducts.slice(
    featuredOffset,
    featuredOffset + featuredPageSize
  );

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const revealCatalog = (categorySlug = "all") => {
    setActiveCategoryFilter(categorySlug || "all");
    setShowCatalog(true);
    window.setTimeout(() => {
      scrollToSection("storefront-catalogue");
    }, 0);
  };

  const resetMessages = () => {
    setSubmitError("");
    setSuccessMessage("");
  };

  const handleBookingFieldChange = (field, value) => {
    setBookingForm((current) => ({
      ...current,
      [field]: value,
    }));
    resetMessages();
    setIsCheckoutModalOpen(false);
  };

  const commitCartEntry = (draftEntry) => {
    const normalizedDraft = {
      id: draftEntry.id || "",
      entry_type: draftEntry.entry_type === "pack" ? "pack" : "product",
      item_id: String(draftEntry.item_id || "").trim(),
      pack_id: String(draftEntry.pack_id || "").trim(),
      quantity: clampPositiveQuantity(draftEntry.quantity, 1),
      option_ids: normalizeOptionIds(draftEntry.option_ids),
    };

    setCartEntries((currentEntries) => {
      const remainingEntries = normalizedDraft.id
        ? currentEntries.filter((entry) => entry.id !== normalizedDraft.id)
        : [...currentEntries];
      const matchingIndex = remainingEntries.findIndex(
        (entry) => buildCartEntrySignature(entry) === buildCartEntrySignature(normalizedDraft)
      );

      if (matchingIndex >= 0) {
        const nextEntries = [...remainingEntries];
        nextEntries[matchingIndex] = {
          ...nextEntries[matchingIndex],
          quantity:
            clampPositiveQuantity(nextEntries[matchingIndex].quantity, 1) +
            normalizedDraft.quantity,
        };
        return nextEntries;
      }

      return [
        ...remainingEntries,
        {
          ...normalizedDraft,
          id: normalizedDraft.id || buildCartEntryId(),
        },
      ];
    });
  };

  const removeCartEntry = (entryId) => {
    resetMessages();
    setCartEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
  };

  const updateCartEntryQuantity = (entryId, nextQuantity) => {
    const parsedQuantity = Number(nextQuantity);

    if (!Number.isFinite(parsedQuantity)) {
      return;
    }

    if (parsedQuantity <= 0) {
      removeCartEntry(entryId);
      return;
    }

    resetMessages();
    setCartEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === entryId ? { ...entry, quantity: clampPositiveQuantity(parsedQuantity, 1) } : entry
      )
    );
  };

  const openProductConfigurator = (product, cartEntry = null) => {
    setShowCatalog(true);
    setProductPreview(null);
    const requiredOptionIds = (Array.isArray(product.options) ? product.options : [])
      .filter((option) => option.required)
      .map((option) => option.id);

    setProductConfigurator({
      cart_entry_id: cartEntry?.id || "",
      item_id: product.id,
      option_ids: normalizeOptionIds(
        cartEntry?.option_ids?.length ? cartEntry.option_ids : requiredOptionIds
      ),
    });
    resetMessages();
  };

  const closeProductConfigurator = () => {
    if (isSubmitting) {
      return;
    }

    setProductConfigurator(null);
  };

  const toggleConfiguratorOption = (optionId) => {
    setProductConfigurator((currentConfigurator) => {
      if (!currentConfigurator) {
        return currentConfigurator;
      }

      const nextOptionIds = currentConfigurator.option_ids.includes(optionId)
        ? currentConfigurator.option_ids.filter((entry) => entry !== optionId)
        : [...currentConfigurator.option_ids, optionId];

      return {
        ...currentConfigurator,
        option_ids: normalizeOptionIds(nextOptionIds),
      };
    });
  };

  const saveProductConfigurator = () => {
    if (!configuratorProduct || !productConfigurator) {
      return;
    }

    const requiredOptionIds = (Array.isArray(configuratorProduct.options) ? configuratorProduct.options : [])
      .filter((option) => option.required)
      .map((option) => option.id);

    commitCartEntry({
      id: productConfigurator.cart_entry_id || "",
      entry_type: "product",
      item_id: configuratorProduct.id,
      quantity:
        cartEntries.find((entry) => entry.id === productConfigurator.cart_entry_id)?.quantity || 1,
      option_ids: normalizeOptionIds([...productConfigurator.option_ids, ...requiredOptionIds]),
    });
    setProductConfigurator(null);
    resetMessages();
  };

  const addProductToCart = (product) => {
    if (normalizeNumber(product.available_quantity) <= 0) {
      return;
    }

    setShowCatalog(true);
    setProductPreview(null);

    if (Array.isArray(product.options) && product.options.length) {
      openProductConfigurator(product);
      return;
    }

    commitCartEntry({
      entry_type: "product",
      item_id: product.id,
      quantity: 1,
      option_ids: [],
    });
    resetMessages();
  };

  const openProductPreview = (product, activePhotoIndex = 0) => {
    setProductPreview({
      item_id: product.id,
      activePhotoIndex,
    });
    resetMessages();
  };

  const closeProductPreview = () => {
    if (isSubmitting || isFinalizingCheckout) {
      return;
    }

    setProductPreview(null);
  };

  const setPreviewPhotoIndex = (nextIndex) => {
    setProductPreview((currentPreview) =>
      currentPreview
        ? {
            ...currentPreview,
            activePhotoIndex: nextIndex,
          }
        : currentPreview
    );
  };

  const addPackToCart = (pack) => {
    if (normalizeNumber(pack.available_quantity) <= 0) {
      return;
    }

    setShowCatalog(true);
    commitCartEntry({
      entry_type: "pack",
      pack_id: pack.id,
      quantity: 1,
      option_ids: [],
    });
    resetMessages();
  };

  const closeCheckoutModal = () => {
    if (isSubmitting || isFinalizingCheckout) {
      return;
    }

    setIsCheckoutModalOpen(false);
  };

  const openCheckoutModal = () => {
    resetMessages();
    setShowCatalog(true);

    if (!cartHasEntries) {
      setSubmitError("Ajoutez au moins un element au panier.");
      return;
    }

    if (shopState.loading) {
      setSubmitError("Les disponibilites sont encore en cours de mise a jour.");
      return;
    }

    if (shopState.error) {
      setSubmitError(shopState.error);
      return;
    }

    if (uniqueAvailabilityIssues.length) {
      setSubmitError(uniqueAvailabilityIssues[0]);
      return;
    }

    setIsCheckoutModalOpen(true);
  };

  const buildCheckoutPayload = () => ({
    customer: customerForm,
    start_date: bookingForm.start_date,
    end_date: bookingForm.end_date,
    notes: customerForm.notes,
    preview_mode: false,
    cart_items: cartEntries.map((entry) => ({
      entry_type: entry.entry_type,
      item_id: entry.item_id || undefined,
      pack_id: entry.pack_id || undefined,
      quantity: clampPositiveQuantity(entry.quantity, 1),
      option_ids: normalizeOptionIds(entry.option_ids),
    })),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");

    if (!cartReadyForCheckout) {
      setSubmitError(uniqueAvailabilityIssues[0] || "Votre panier doit etre verifie avant envoi.");
      return;
    }

    if (!customerForm.first_name || !customerForm.last_name || !customerForm.email) {
      setSubmitError("Merci de renseigner vos coordonnees pour envoyer la demande.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = buildCheckoutPayload();

      if (paymentSummary.enabled) {
        const response = await apiRequest(
          `/public/storefront/${encodeURIComponent(slug)}/checkout`,
          {
            method: "POST",
            auth: false,
            body: payload,
          }
        );

        window.location.href = response.checkout.url;
        return;
      }

      const response = await apiRequest(
        `/public/storefront/${encodeURIComponent(slug)}/requests`,
        {
          method: "POST",
          auth: false,
          body: payload,
        }
      );

      clearDraft();
      setSuccessMessage(
        response.reservation.status === "confirmed"
          ? `Reservation ${response.reservation.reference} confirmee.`
          : `Reservation ${response.reservation.reference} enregistree et en attente de confirmation.`
      );
      setCustomerForm(initialCustomerForm);
      setCartEntries([]);
      setIsCheckoutModalOpen(false);
      setProductConfigurator(null);
      setReloadVersion((currentValue) => currentValue + 1);
    } catch (error) {
      setSubmitError(
        error.message ||
          (paymentSummary.enabled
            ? "Impossible d'ouvrir le paiement en ligne."
            : "Impossible d'enregistrer cette reservation.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="storefront-page public-shop-page public-shop-v4 public-shop-v5 public-shop-v6">
      <StorefrontTopbar
        publicPath={publicPath}
        hasReviews={Boolean(storefront?.reviews_enabled && storefront?.reviews_url)}
        revealCatalog={revealCatalog}
        scrollToSection={scrollToSection}
      />

      <div className="storefront-shell public-shop-shell">
        {shopState.error ? <p className="feedback error">{shopState.error}</p> : null}
        {isFinalizingCheckout ? (
          <p className="feedback success">Confirmation du paiement en cours...</p>
        ) : null}
        {successMessage ? <p className="feedback success">{successMessage}</p> : null}

        <StorefrontHero
          storefrontName={storefrontName}
          storefrontLiveStatus={storefrontLiveStatus}
          providerLocation={providerLocation}
          heroImage={heroImage}
          bookingForm={bookingForm}
          onBookingFieldChange={handleBookingFieldChange}
          paymentSummary={paymentSummary}
          revealCatalog={revealCatalog}
          scrollToSection={scrollToSection}
          isLoading={shopState.loading}
        />

        <StorefrontReassuranceStrip paymentSummary={paymentSummary} />
        <StorefrontCategoriesSection
          categories={categories}
          revealCatalog={revealCatalog}
          isLoading={shopState.loading}
        />
        <StorefrontFeaturedSection
          featuredProducts={featuredProducts}
          visibleFeaturedProducts={visibleFeaturedProducts}
          featuredOffset={featuredOffset}
          featuredPageSize={featuredPageSize}
          setFeaturedOffset={setFeaturedOffset}
          revealCatalog={revealCatalog}
          openProductPreview={openProductPreview}
          addProductToCart={addProductToCart}
          availabilityMeta={availabilityMeta}
        />

        <StorefrontGuideSection
          mapAddress={storefront?.map_enabled ? mapAddress : ''}
          mapEmbedUrl={mapEmbedUrl}
          revealCatalog={revealCatalog}
          paymentSummary={paymentSummary}
          storefrontName={storefrontName}
        />

        <StorefrontReviewsSection storefront={storefront} reviewCards={reviewCards} />

        <StorefrontCatalogStage
          shouldShowCatalog={shouldShowCatalog}
          storefrontName={storefrontName}
          providerLocation={providerLocation}
          visibleProductCount={visibleProductCount}
          visiblePackCount={visiblePackCount}
          compactPeriodLabel={compactPeriodLabel}
          durationDays={durationDays}
          totalRequestedQuantity={totalRequestedQuantity}
          visibleProducts={visibleProducts}
          showLoadMoreProducts={showLoadMoreProducts}
          setVisibleProductLimit={setVisibleProductLimit}
          initialVisibleProductCount={initialVisibleProductCount}
          products={products}
          packs={packs}
          categories={categories}
          activeCategoryFilter={activeCategoryFilter}
          revealCatalog={revealCatalog}
          shopState={shopState}
          availabilityMeta={availabilityMeta}
          availabilityMessageByReason={availabilityMessageByReason}
          openProductPreview={openProductPreview}
          addProductToCart={addProductToCart}
          addPackToCart={addPackToCart}
          bookingForm={bookingForm}
          paymentSummary={paymentSummary}
          totalEstimatedAmount={totalEstimatedAmount}
          totalEstimatedDeposit={totalEstimatedDeposit}
          cartStatusTone={cartStatusTone}
          cartStatusLabel={cartStatusLabel}
          cartEntries={cartEntries}
          resolvedCartEntries={resolvedCartEntries}
          cartHasEntries={cartHasEntries}
          uniqueAvailabilityIssues={uniqueAvailabilityIssues}
          submitError={submitError}
          openCheckoutModal={openCheckoutModal}
          checkoutActionLabel={checkoutActionLabel}
          isFinalizingCheckout={isFinalizingCheckout}
          removeCartEntry={removeCartEntry}
          updateCartEntryQuantity={updateCartEntryQuantity}
          productById={productById}
          openProductConfigurator={openProductConfigurator}
          scrollToSection={scrollToSection}
        />
        <StorefrontFooter
          storefrontName={storefrontName}
          providerLocation={providerLocation}
          publicPath={publicPath}
          paymentSummary={paymentSummary}
          mapAddress={mapAddress}
        />

        {productPreview && previewedProduct ? (
          <div
            className="public-shop-modal-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeProductPreview();
              }
            }}
          >
            <section
              className="public-shop-modal public-shop-product-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="public-shop-product-preview-title"
            >
              <div className="public-shop-modal-header">
                <div>
                  <p className="eyebrow">Fiche produit</p>
                  <h2 id="public-shop-product-preview-title">{previewedProduct.public_name}</h2>
                  <p>
                    Retrouvez toutes les images du produit, puis ajoutez-le au panier si la periode vous convient.
                  </p>
                </div>

                <button
                  type="button"
                  className="public-shop-modal-close"
                  onClick={closeProductPreview}
                  disabled={isSubmitting || isFinalizingCheckout}
                  aria-label="Fermer la fiche produit"
                >
                  x
                </button>
              </div>

              <div className="public-shop-product-preview-layout">
                <div className="public-shop-product-preview-gallery">
                  <div className="public-shop-product-preview-stage">
                    {activePreviewPhoto ? (
                      <img
                        src={activePreviewPhoto}
                        alt={previewedProduct.public_name}
                        className="public-shop-product-preview-image"
                      />
                    ) : (
                      <div className="public-shop-product-preview-placeholder" aria-hidden="true">
                        <span>{previewedProduct.public_name.slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}

                    {previewPhotos.length > 1 ? (
                      <div className="public-shop-product-preview-nav">
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() =>
                            setPreviewPhotoIndex(
                              activePreviewPhotoIndex === 0
                                ? previewPhotos.length - 1
                                : activePreviewPhotoIndex - 1
                            )
                          }
                        >
                          Precedente
                        </button>
                        <span>
                          {activePreviewPhotoIndex + 1} / {previewPhotos.length}
                        </span>
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() =>
                            setPreviewPhotoIndex(
                              activePreviewPhotoIndex === previewPhotos.length - 1
                                ? 0
                                : activePreviewPhotoIndex + 1
                            )
                          }
                        >
                          Suivante
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {previewPhotos.length > 1 ? (
                    <div className="public-shop-product-preview-thumbnails">
                      {previewPhotos.map((photo, index) => (
                        <button
                          key={`${previewedProduct.id}-preview-${index}`}
                          type="button"
                          className={`public-shop-product-preview-thumb ${
                            index === activePreviewPhotoIndex ? "active" : ""
                          }`.trim()}
                          onClick={() => setPreviewPhotoIndex(index)}
                        >
                          <img src={photo} alt={`${previewedProduct.public_name} ${index + 1}`} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="public-shop-product-preview-copy">
                  <StatusPill tone={(availabilityMeta[previewedProduct.status] || availabilityMeta.available).tone}>
                    {(availabilityMeta[previewedProduct.status] || availabilityMeta.available).label}
                  </StatusPill>

                  <p>{previewedProduct.public_description}</p>

                  {previewedProduct.long_description ? (
                    <p className="public-shop-product-preview-description">
                      {previewedProduct.long_description}
                    </p>
                  ) : null}

                  <div className="public-shop-product-pricing">
                    <div className="public-shop-product-price">
                      <strong>{formatCurrency(previewedProduct.price)}</strong>
                      <span>A partir de / jour</span>
                    </div>

                    <div className="public-shop-product-secondary">
                      <span>Caution</span>
                      <strong>{formatCurrency(previewedProduct.deposit)}</strong>
                    </div>
                  </div>

                  <div className="planning-inline-list public-shop-product-tags">
                    {previewedProduct.category ? (
                      <span className="planning-mini-badge">{previewedProduct.category}</span>
                    ) : null}
                    {previewedProduct.sku ? (
                      <span className="planning-mini-badge">{previewedProduct.sku}</span>
                    ) : null}
                    {Array.isArray(previewedProduct.options) && previewedProduct.options.length ? (
                      <span className="planning-mini-badge">
                        {previewedProduct.options.length} option(s)
                      </span>
                    ) : null}
                  </div>

                  <div className="detail-card">
                    <strong>
                      {availabilityMessageByReason[previewedProduct.availability_reason] || "Produit indisponible"}
                    </strong>
                    <span>
                      {previewedProduct.available_quantity} unite(s) disponibles pour cette periode.
                    </span>
                    {previewedProduct.availability_note ? (
                      <span>{previewedProduct.availability_note}</span>
                    ) : null}
                  </div>

                  <div className="public-shop-modal-actions">
                    <button type="button" className="button ghost" onClick={closeProductPreview}>
                      Fermer
                    </button>
                    <button
                      type="button"
                      className={`button ${
                        previewedProduct.available_quantity > 0 ? "primary" : "subtle"
                      }`}
                      onClick={() => addProductToCart(previewedProduct)}
                      disabled={previewedProduct.available_quantity <= 0}
                    >
                      {Array.isArray(previewedProduct.options) && previewedProduct.options.length
                        ? "Configurer ce produit"
                        : "Ajouter au panier"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {productConfigurator && configuratorProduct ? (
          <div
            className="public-shop-modal-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeProductConfigurator();
              }
            }}
          >
            <section
              className="public-shop-modal public-shop-option-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="public-shop-option-title"
            >
              <div className="public-shop-modal-header">
                <div>
                  <p className="eyebrow">Options</p>
                  <h2 id="public-shop-option-title">{configuratorProduct.public_name}</h2>
                  <p>Selectionnez les options a ajouter a ce produit avant de l'envoyer au panier.</p>
                </div>

                <button
                  type="button"
                  className="public-shop-modal-close"
                  onClick={closeProductConfigurator}
                  disabled={isSubmitting || isFinalizingCheckout}
                  aria-label="Fermer la fenetre options"
                >
                  x
                </button>
              </div>

              <div className="public-shop-option-list">
                {configuratorProduct.options.map((option) => {
                  const isChecked = productConfigurator.option_ids.includes(option.id);

                  return (
                    <label key={option.id} className="public-shop-option-row">
                      <div>
                        <strong>{option.name}</strong>
                        <span>{option.required ? "Option obligatoire" : "Option facultative"}</span>
                      </div>
                      <div>
                        <span>{option.price > 0 ? `+ ${formatCurrency(option.price)}` : "Inclus"}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={option.required}
                          onChange={() => toggleConfiguratorOption(option.id)}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="public-shop-modal-actions">
                <button type="button" className="button ghost" onClick={closeProductConfigurator}>
                  Annuler
                </button>
                <button type="button" className="button primary" onClick={saveProductConfigurator}>
                  {productConfigurator.cart_entry_id ? "Mettre a jour le panier" : "Ajouter au panier"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isCheckoutModalOpen ? (
          <div
            className="public-shop-modal-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeCheckoutModal();
              }
            }}
          >
            <section className="public-shop-modal" role="dialog" aria-modal="true" aria-labelledby="public-shop-modal-title">
              <div className="public-shop-modal-header">
                <div>
                  <p className="eyebrow">
                    {paymentSummary.enabled ? "Paiement en ligne" : "Reservation"}
                  </p>
                  <h2 id="public-shop-modal-title">
                    {paymentSummary.enabled
                      ? "Finalisez et payez votre reservation"
                      : "Finalisez votre demande"}
                  </h2>
                  <p>
                    {paymentSummary.enabled
                      ? "Renseignez vos coordonnees, puis vous serez redirige vers Stripe pour regler le montant de location."
                      : "Renseignez vos coordonnees pour envoyer l'ensemble du panier au prestataire."}
                  </p>
                </div>

                <button
                  type="button"
                  className="public-shop-modal-close"
                  onClick={closeCheckoutModal}
                  disabled={isSubmitting}
                  aria-label="Fermer la fenetre"
                >
                  x
                </button>
              </div>

              <div className="public-shop-modal-grid">
                <div className="public-shop-modal-summary">
                  <article className="detail-card public-shop-selected-product">
                    <span className="public-shop-selected-label">Periode</span>
                    <strong>{compactPeriodLabel}</strong>
                    <span className="muted-text">{durationDays} jour(s) de location.</span>
                  </article>

                  <div className="public-shop-modal-cart-list">
                    {resolvedCartEntries.map((entry) => (
                      <article key={`modal-${entry.id}`} className="detail-card public-shop-cart-item-compact">
                        <div className="public-shop-cart-item-head">
                          <div>
                            <span className="public-shop-cart-item-type">{entry.entry_type_label}</span>
                            <strong>{entry.label}</strong>
                          </div>
                          <span>x{entry.quantity}</span>
                        </div>
                        {entry.selected_options.length ? (
                          <div className="public-shop-cart-item-options">
                            {entry.selected_options.map((option) => (
                              <span key={`modal-${entry.id}-${option.id}`} className="planning-mini-badge">
                                {option.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {entry.included_products.length ? (
                          <div className="public-shop-pack-products">
                            {entry.included_products.map((product) => (
                              <span
                                key={`modal-${entry.id}-${product.item_id}`}
                                className="planning-mini-badge"
                              >
                                {product.public_name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="public-shop-cart-item-meta">
                          <span>{formatCurrency(entry.entry_total)} estime(s)</span>
                          <span>{formatCurrency(entry.deposit_total)} caution</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="public-shop-summary-grid">
                    <div className="detail-card">
                      <strong>{resolvedCartEntries.length}</strong>
                      <span className="muted-text">ligne(s)</span>
                    </div>
                    <div className="detail-card">
                      <strong>{formatCurrency(totalEstimatedAmount)}</strong>
                      <span className="muted-text">montant estime</span>
                    </div>
                    <div className="detail-card">
                      <strong>{formatCurrency(totalEstimatedDeposit)}</strong>
                      <span className="muted-text">caution estimee</span>
                    </div>
                  </div>
                </div>

                <form className="public-shop-request-form public-shop-modal-form" onSubmit={handleSubmit}>
                  <div className="form-grid two-columns public-shop-customer-grid">
                    <div className="field">
                      <label htmlFor="public-storefront-first-name">Prenom</label>
                      <input
                        id="public-storefront-first-name"
                        value={customerForm.first_name}
                        onChange={(event) =>
                          setCustomerForm((current) => ({ ...current, first_name: event.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="public-storefront-last-name">Nom</label>
                      <input
                        id="public-storefront-last-name"
                        value={customerForm.last_name}
                        onChange={(event) =>
                          setCustomerForm((current) => ({ ...current, last_name: event.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="public-storefront-email">Email</label>
                      <input
                        id="public-storefront-email"
                        type="email"
                        value={customerForm.email}
                        onChange={(event) =>
                          setCustomerForm((current) => ({ ...current, email: event.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="public-storefront-phone">Telephone</label>
                      <input
                        id="public-storefront-phone"
                        value={customerForm.phone}
                        onChange={(event) =>
                          setCustomerForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="public-storefront-address">Adresse</label>
                    <input
                      id="public-storefront-address"
                      value={customerForm.address}
                      onChange={(event) =>
                        setCustomerForm((current) => ({ ...current, address: event.target.value }))
                      }
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="public-storefront-notes">Message</label>
                    <textarea
                      id="public-storefront-notes"
                      value={customerForm.notes}
                      onChange={(event) =>
                        setCustomerForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </div>

                  {submitError ? <p className="feedback error">{submitError}</p> : null}

                  <p className="public-shop-submit-copy">
                    {paymentSummary.enabled
                      ? "Le montant de location sera regle en ligne. La caution reste affichee separement et pourra etre geree par le prestataire."
                      : "La demande sera creee avec le panier complet, les quantites, les options et la periode selectionnee."}
                  </p>

                  <button
                    type="submit"
                    className="button primary"
                    disabled={isSubmitting || isFinalizingCheckout || !cartReadyForCheckout}
                  >
                    {checkoutSubmitLabel}
                  </button>
                </form>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}








