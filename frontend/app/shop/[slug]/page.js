"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import BrandLogo from "../../../components/brand-logo";
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

export default function PublicStorefrontPage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : String(params?.slug || "");
  const [shopState, setShopState] = useState(initialShopState);
  const [bookingForm, setBookingForm] = useState({
    start_date: buildDateValue(1),
    end_date: buildDateValue(2),
  });
  const [cartEntries, setCartEntries] = useState([]);
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [productConfigurator, setProductConfigurator] = useState(null);
  const [visibleProductLimit, setVisibleProductLimit] = useState(initialVisibleProductCount);

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
  }, [slug, bookingForm.start_date, bookingForm.end_date]);

  const products = shopState.data?.products || [];
  const packs = shopState.data?.packs || [];
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
  const compactPeriodLabel = `${formatCompactDate(bookingForm.start_date)} - ${formatCompactDate(
    bookingForm.end_date
  )}`;
  const productById = new Map(products.map((product) => [product.id, product]));
  const packById = new Map(packs.map((pack) => [pack.id, pack]));

  useEffect(() => {
    const hasOpenModal = isCheckoutModalOpen || Boolean(productConfigurator);

    if (!hasOpenModal) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) {
        setIsCheckoutModalOpen(false);
        setProductConfigurator(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCheckoutModalOpen, productConfigurator, isSubmitting]);

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
    ? "Panier vide"
    : uniqueAvailabilityIssues.length
      ? "Verification requise"
      : shopState.loading
        ? "Mise a jour"
        : "Disponible";
  const visibleProducts = products.slice(0, visibleProductLimit);
  const showLoadMoreProducts = products.length > visibleProductLimit;
  const configuratorProduct = productConfigurator ? productById.get(productConfigurator.item_id) || null : null;

  const resetMessages = () => {
    setSubmitError("");
    setSuccessMessage("");
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

  const addPackToCart = (pack) => {
    if (normalizeNumber(pack.available_quantity) <= 0) {
      return;
    }

    commitCartEntry({
      entry_type: "pack",
      pack_id: pack.id,
      quantity: 1,
      option_ids: [],
    });
    resetMessages();
  };

  const closeCheckoutModal = () => {
    if (isSubmitting) {
      return;
    }

    setIsCheckoutModalOpen(false);
  };

  const openCheckoutModal = () => {
    resetMessages();

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
      const response = await apiRequest(`/public/storefront/${encodeURIComponent(slug)}/requests`, {
        method: "POST",
        auth: false,
        body: {
          customer: customerForm,
          start_date: bookingForm.start_date,
          end_date: bookingForm.end_date,
          notes: customerForm.notes,
          cart_items: cartEntries.map((entry) => ({
            entry_type: entry.entry_type,
            item_id: entry.item_id || undefined,
            pack_id: entry.pack_id || undefined,
            quantity: clampPositiveQuantity(entry.quantity, 1),
            option_ids: normalizeOptionIds(entry.option_ids),
          })),
        },
      });

      setSuccessMessage(
        response.reservation.status === "confirmed"
          ? `Reservation ${response.reservation.reference} confirmee.`
          : `Reservation ${response.reservation.reference} enregistree et en attente de confirmation.`
      );
      setCustomerForm(initialCustomerForm);
      setCartEntries([]);
      setIsCheckoutModalOpen(false);
      setProductConfigurator(null);
    } catch (error) {
      setSubmitError(error.message || "Impossible d'enregistrer cette reservation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="storefront-page public-shop-page public-shop-v4">
      <header className="public-shop-topbar">
        <div className="public-shop-topbar-inner">
          <div className="public-shop-topbar-brand">
            <BrandLogo className="public-shop-topbar-logo" />
          </div>

          <nav className="public-shop-topbar-nav" aria-label="Navigation boutique">
            <a href="#shop-products">Produits</a>
            {packs.length ? <a href="#shop-packs">Packs</a> : null}
            <a href="#shop-cart">Panier</a>
            <a href="#shop-details">Informations</a>
          </nav>

          <div className="public-shop-topbar-actions">
            <StatusPill tone={shopState.error ? "neutral" : "success"}>
              Boutique publique
            </StatusPill>
            <Link href={publicPath} className="button ghost">
              Lien direct
            </Link>
          </div>
        </div>
      </header>

      <div className="storefront-shell public-shop-shell">
        {shopState.error ? <p className="feedback error">{shopState.error}</p> : null}
        {successMessage ? <p className="feedback success">{successMessage}</p> : null}

        <section className="public-shop-stage">
          <main className="public-shop-main-column">
            <p className="public-shop-breadcrumb">Lokify / {storefrontName}</p>

            <section className="public-shop-provider-shell" id="shop-details">
              <div className="public-shop-provider-row">
                <div className="public-shop-provider-mark" aria-hidden="true">
                  {storefrontName.slice(0, 1).toUpperCase()}
                </div>

                <div className="public-shop-provider-copy">
                  <p className="eyebrow">Reservation en ligne</p>
                  <h1>{storefrontName}</h1>
                  <div className="public-shop-provider-meta">
                    <span>{providerLocation}</span>
                    <span>{visibleProductCount} produit(s) visibles</span>
                    {packs.length ? <span>{visiblePackCount} pack(s) actifs</span> : null}
                    <span>{selectableProductCount + selectablePackCount} element(s) reservables</span>
                  </div>
                  <p>
                    Choisissez vos dates, ajoutez plusieurs produits, packs et options, puis
                    verifiez l'ensemble du panier avant d'envoyer votre demande.
                  </p>
                </div>
              </div>
            </section>

            <nav className="public-shop-tab-nav" aria-label="Sections boutique">
              <a href="#shop-products" className="active">
                Produits
              </a>
              {packs.length ? <a href="#shop-packs">Packs</a> : null}
              <a href="#shop-cart">Panier</a>
              <a href="#shop-details">Informations</a>
            </nav>

            <div className="public-shop-toolbar public-shop-toolbar-wide">
              <article className="public-shop-toolbar-card">
                <span>Catalogue</span>
                <strong>{visibleProductCount + visiblePackCount} element(s) publics</strong>
                <p>{visibleProductCount} produits et {visiblePackCount} packs visibles.</p>
              </article>
              <article className="public-shop-toolbar-card">
                <span>Periode</span>
                <strong>{compactPeriodLabel}</strong>
                <p>{durationDays} jour(s) calcules a la journee.</p>
              </article>
              <article className="public-shop-toolbar-card">
                <span>Panier</span>
                <strong>{resolvedCartEntries.length} ligne(s)</strong>
                <p>{totalRequestedQuantity} element(s) ajoutes au total.</p>
              </article>
            </div>

            <section id="shop-products" className="public-shop-catalogue-section public-shop-section-block">
              <div className="public-shop-section-head">
                <div>
                  <p className="eyebrow">Catalogue</p>
                  <h2>Produits disponibles</h2>
                  <p>Ajoutez plusieurs produits au panier, puis ajustez les quantites a droite.</p>
                </div>
              </div>

              {shopState.loading ? (
                <div className="empty-state public-shop-loading-state">
                  <strong>Chargement de la boutique</strong>
                  <span>Les disponibilites se recalculent pour la periode choisie.</span>
                </div>
              ) : products.length ? (
                <>
                  <div className="public-shop-product-grid">
                    {visibleProducts.map((product) => {
                      const meta = availabilityMeta[product.status] || availabilityMeta.available;
                      const hasOptions = Array.isArray(product.options) && product.options.length > 0;
                      const availabilityLabel =
                        availabilityMessageByReason[product.availability_reason] || "Produit indisponible";

                      return (
                        <article key={product.id} className="public-shop-product-card">
                          <div className="public-shop-product-visual">
                            {product.thumbnail ? (
                              <img
                                src={product.thumbnail}
                                alt={product.public_name}
                                className="public-shop-product-media"
                              />
                            ) : (
                              <div className="public-shop-product-placeholder" aria-hidden="true">
                                <span>{product.public_name.slice(0, 1).toUpperCase()}</span>
                              </div>
                            )}

                            <div className="public-shop-product-visual-top">
                              <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                            </div>
                          </div>

                          <div className="public-shop-product-copy">
                            <div className="public-shop-product-head">
                              <div>
                                <strong>{product.public_name}</strong>
                                <p>{product.public_description}</p>
                              </div>
                            </div>

                            <div className="public-shop-product-pricing">
                              <div className="public-shop-product-price">
                                <strong>{formatCurrency(product.price)}</strong>
                                <span>A partir de / jour</span>
                              </div>

                              <div className="public-shop-product-secondary">
                                <span>Caution</span>
                                <strong>{formatCurrency(product.deposit)}</strong>
                              </div>
                            </div>

                            <div className="planning-inline-list public-shop-product-tags">
                              {product.category ? (
                                <span className="planning-mini-badge">{product.category}</span>
                              ) : null}
                              {product.sku ? <span className="planning-mini-badge">{product.sku}</span> : null}
                              {hasOptions ? (
                                <span className="planning-mini-badge">
                                  {product.options.length} option(s)
                                </span>
                              ) : null}
                            </div>

                            {product.long_description ? (
                              <p className="public-shop-product-long-description">
                                {product.long_description}
                              </p>
                            ) : null}

                            <div className="public-shop-product-card-foot">
                              <div className="public-shop-availability-copy">
                                <strong>{availabilityLabel}</strong>
                                <span>{product.available_quantity} unite(s) disponibles</span>
                              </div>

                              <button
                                type="button"
                                className={`button ${
                                  product.available_quantity > 0 ? "ghost" : "subtle"
                                }`}
                                onClick={() => addProductToCart(product)}
                                disabled={product.available_quantity <= 0}
                              >
                                {hasOptions ? "Configurer" : "Ajouter"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {showLoadMoreProducts ? (
                    <button
                      type="button"
                      className="button ghost public-shop-load-more"
                      onClick={() =>
                        setVisibleProductLimit((currentLimit) => currentLimit + initialVisibleProductCount)
                      }
                    >
                      Voir plus
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <strong>Aucun produit public disponible</strong>
                  <span>Le prestataire n'a pas encore publie de produit reservable.</span>
                </div>
              )}
            </section>

            {packs.length ? (
              <section id="shop-packs" className="public-shop-catalogue-section public-shop-section-block">
                <div className="public-shop-section-head">
                  <div>
                    <p className="eyebrow">Packs</p>
                    <h2>Packs disponibles</h2>
                    <p>Ajoutez des compositions deja preparees au meme panier.</p>
                  </div>
                </div>

                <div className="public-shop-pack-grid">
                  {packs.map((pack) => {
                    const meta = availabilityMeta[pack.status] || availabilityMeta.available;
                    const availabilityLabel =
                      availabilityMessageByReason[pack.availability_reason] || "Pack indisponible";
                    const hasDiscount = normalizeNumber(pack.base_price) > normalizeNumber(pack.price);

                    return (
                      <article key={pack.id} id={`pack-${pack.id}`} className="public-shop-pack-card">
                        <div className="public-shop-product-head">
                          <div>
                            <span className="public-shop-card-type">Pack</span>
                            <strong>{pack.name}</strong>
                            <p>{pack.description || "Pack disponible a la reservation."}</p>
                          </div>
                          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                        </div>

                        <div className="public-shop-product-pricing">
                          <div className="public-shop-product-price">
                            <strong>{formatCurrency(pack.price)}</strong>
                            <span>Tarif pack / jour</span>
                          </div>

                          <div className="public-shop-product-secondary">
                            <span>Caution</span>
                            <strong>{formatCurrency(pack.deposit)}</strong>
                          </div>
                        </div>

                        <div className="planning-inline-list public-shop-product-tags">
                          <span className="planning-mini-badge">{pack.product_count} produit(s)</span>
                          {hasDiscount ? (
                            <span className="planning-mini-badge">
                              Au lieu de {formatCurrency(pack.base_price)}
                            </span>
                          ) : null}
                        </div>

                        <div className="public-shop-pack-products">
                          {pack.products.map((product) => (
                            <span key={`${pack.id}-${product.item_id}`} className="planning-mini-badge">
                              {product.public_name}
                            </span>
                          ))}
                        </div>

                        <div className="public-shop-product-card-foot">
                          <div className="public-shop-availability-copy">
                            <strong>{availabilityLabel}</strong>
                            <span>{pack.available_quantity} pack(s) disponibles</span>
                          </div>

                          <button
                            type="button"
                            className={`button ${pack.available_quantity > 0 ? "ghost" : "subtle"}`}
                            onClick={() => addPackToCart(pack)}
                            disabled={pack.available_quantity <= 0}
                          >
                            Ajouter le pack
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="public-shop-sidebar">
            <div className="public-shop-sidebar-sticky">
              <section className="public-shop-sidebar-card public-shop-booking-card">
                <div className="public-shop-sidebar-card-head">
                  <h2>Vos dates de location</h2>
                  <p>Les disponibilites se mettent a jour automatiquement quand vous changez la periode.</p>
                </div>

                <div className="public-shop-sidebar-fields">
                  <div className="field">
                    <label htmlFor="public-storefront-start-date">Date de debut</label>
                    <input
                      id="public-storefront-start-date"
                      type="date"
                      value={bookingForm.start_date}
                      onChange={(event) => {
                        setBookingForm((current) => ({ ...current, start_date: event.target.value }));
                        resetMessages();
                        setIsCheckoutModalOpen(false);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="public-storefront-end-date">Date de fin</label>
                    <input
                      id="public-storefront-end-date"
                      type="date"
                      value={bookingForm.end_date}
                      onChange={(event) => {
                        setBookingForm((current) => ({ ...current, end_date: event.target.value }));
                        resetMessages();
                        setIsCheckoutModalOpen(false);
                      }}
                    />
                  </div>
                </div>

                <div className="public-shop-cart-summary">
                  <div className="public-shop-cart-summary-row">
                    <span>Periode</span>
                    <strong>{compactPeriodLabel}</strong>
                  </div>
                  <div className="public-shop-cart-summary-row">
                    <span>Duree</span>
                    <strong>{durationDays} jour(s)</strong>
                  </div>
                </div>
              </section>

              <section id="shop-cart" className="public-shop-sidebar-card public-shop-cart-card">
                <div className="public-shop-cart-header">
                  <div>
                    <h2>Votre panier</h2>
                    <p>Le recapitulatif se met a jour en temps reel selon vos selections.</p>
                  </div>
                  <StatusPill tone={cartStatusTone}>{cartStatusLabel}</StatusPill>
                </div>

                <div className="public-shop-cart-summary">
                  <div className="public-shop-cart-summary-row">
                    <span>Produits</span>
                    <strong>{cartEntries.filter((entry) => entry.entry_type === "product").length}</strong>
                  </div>
                  <div className="public-shop-cart-summary-row">
                    <span>Packs</span>
                    <strong>{cartEntries.filter((entry) => entry.entry_type === "pack").length}</strong>
                  </div>
                  <div className="public-shop-cart-summary-row">
                    <span>Quantites</span>
                    <strong>{totalRequestedQuantity}</strong>
                  </div>
                </div>

                {cartHasEntries ? (
                  <div className="public-shop-cart-list">
                    {resolvedCartEntries.map((entry) => {
                      const editableProduct = entry.entry_type === "product" ? productById.get(entry.item_id) : null;
                      const hasEditableOptions =
                        editableProduct && Array.isArray(editableProduct.options) && editableProduct.options.length > 0;

                      return (
                        <article key={entry.id} className="public-shop-cart-item">
                          <div className="public-shop-cart-item-head">
                            <div>
                              <span className="public-shop-cart-item-type">{entry.entry_type_label}</span>
                              <strong>{entry.label}</strong>
                            </div>
                            <button
                              type="button"
                              className="public-shop-cart-control-button"
                              onClick={() => removeCartEntry(entry.id)}
                              aria-label={`Supprimer ${entry.label}`}
                            >
                              x
                            </button>
                          </div>

                          {entry.description ? (
                            <p className="muted-text public-shop-cart-item-meta">{entry.description}</p>
                          ) : null}

                          {entry.selected_options.length ? (
                            <div className="public-shop-cart-item-options">
                              {entry.selected_options.map((option) => (
                                <span key={`${entry.id}-${option.id}`} className="planning-mini-badge">
                                  {option.name}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {entry.included_products.length ? (
                            <div className="public-shop-pack-products">
                              {entry.included_products.map((product) => (
                                <span
                                  key={`${entry.id}-${product.item_id}`}
                                  className="planning-mini-badge"
                                >
                                  {product.public_name}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="public-shop-cart-item-meta">
                            <span>{formatCurrency(entry.unit_price)} / jour</span>
                            <span>{formatCurrency(entry.entry_total)} estime(s)</span>
                            <span>{formatCurrency(entry.deposit_total)} caution</span>
                          </div>

                          <div className="public-shop-cart-controls">
                            <button
                              type="button"
                              className="public-shop-cart-control-button"
                              onClick={() => updateCartEntryQuantity(entry.id, entry.quantity - 1)}
                              aria-label={`Diminuer ${entry.label}`}
                            >
                              -
                            </button>
                            <input
                              className="public-shop-cart-control-input"
                              type="number"
                              min="1"
                              value={entry.quantity}
                              onChange={(event) => updateCartEntryQuantity(entry.id, event.target.value)}
                              aria-label={`Quantite pour ${entry.label}`}
                            />
                            <button
                              type="button"
                              className="public-shop-cart-control-button"
                              onClick={() => updateCartEntryQuantity(entry.id, entry.quantity + 1)}
                              aria-label={`Augmenter ${entry.label}`}
                            >
                              +
                            </button>

                            {hasEditableOptions ? (
                              <button
                                type="button"
                                className="button subtle"
                                onClick={() => openProductConfigurator(editableProduct, entry)}
                              >
                                Options
                              </button>
                            ) : null}
                          </div>

                          <div className="public-shop-cart-item-status">
                            <StatusPill tone={entry.is_available ? "success" : "danger"}>
                              {entry.is_available ? "Disponible" : "A verifier"}
                            </StatusPill>
                            {entry.issue_messages.length ? (
                              <ul className="public-shop-cart-issues">
                                {entry.issue_messages.map((message) => (
                                  <li key={`${entry.id}-${message}`}>{message}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="public-shop-cart-empty">
                    <strong>Votre panier est vide</strong>
                    <span>Ajoutez un ou plusieurs produits ou packs pour preparer votre demande.</span>
                  </div>
                )}

                <div className="public-shop-cart-totals">
                  <div className="public-shop-cart-summary-row">
                    <span>Montant estime</span>
                    <strong>{formatCurrency(totalEstimatedAmount)}</strong>
                  </div>
                  <div className="public-shop-cart-summary-row">
                    <span>Caution estimee</span>
                    <strong>{formatCurrency(totalEstimatedDeposit)}</strong>
                  </div>
                  <div className="public-shop-cart-summary-row">
                    <span>Total lignes</span>
                    <strong>{resolvedCartEntries.length}</strong>
                  </div>
                </div>

                {uniqueAvailabilityIssues.length ? (
                  <ul className="public-shop-cart-issues">
                    {uniqueAvailabilityIssues.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}

                {!isCheckoutModalOpen && submitError ? (
                  <p className="feedback error public-shop-inline-feedback">{submitError}</p>
                ) : null}

                <button
                  type="button"
                  className="button primary public-shop-sidebar-cta"
                  onClick={openCheckoutModal}
                  disabled={shopState.loading || !cartHasEntries}
                >
                  {shopState.loading ? "Mise a jour..." : "Verifier la disponibilite du panier"}
                </button>
              </section>

              <section className="public-shop-sidebar-callout">
                <strong>Besoin d'une demande personnalisee ?</strong>
                <span>
                  Ajoutez une note dans le formulaire final si vous avez une contrainte ou une
                  precision logistique.
                </span>
              </section>
            </div>
          </aside>
        </section>

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
                  disabled={isSubmitting}
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
                  <p className="eyebrow">Reservation</p>
                  <h2 id="public-shop-modal-title">Finalisez votre demande</h2>
                  <p>Renseignez vos coordonnees pour envoyer l'ensemble du panier au prestataire.</p>
                </div>

                <button
                  type="button"
                  className="public-shop-modal-close"
                  onClick={closeCheckoutModal}
                  disabled={isSubmitting}
                  aria-label="Fermer la fenetre"
                >
                  ×
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
                    La demande sera creee avec le panier complet, les quantites, les options et la
                    periode selectionnee.
                  </p>

                  <button
                    type="submit"
                    className="button primary"
                    disabled={isSubmitting || !cartReadyForCheckout}
                  >
                    {isSubmitting ? "Enregistrement..." : "Envoyer ma demande"}
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
