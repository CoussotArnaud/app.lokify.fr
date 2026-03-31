"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import SecondaryNav from "../../../../components/secondary-nav";
import StatusPill from "../../../../components/status-pill";
import useLokifyWorkspace from "../../../../hooks/use-lokify-workspace";
import {
  MAX_CATALOG_IMAGE_SIZE_BYTES,
  MAX_CATALOG_ITEM_PHOTOS,
  MIN_CATALOG_IMAGE_HEIGHT,
  MIN_CATALOG_IMAGE_WIDTH,
  formatCatalogImageSize,
  prepareCatalogImage,
} from "../../../../lib/catalog-image";
import { consumeFlashMessage, setFlashMessage } from "../../../../lib/flash-message";
import {
  readCatalogDraft,
  removeCatalogDraft,
  saveCatalogDraft,
  slugifyLabel,
} from "../../../../lib/workspace-store";

const navigationGroups = [
  {
    title: "Fiche produit",
    items: [
      { id: "general", label: "General", helper: "Nom, descriptions, categorie." },
      { id: "pricing", label: "Tarifs", helper: "Base, week-end, semaine, TVA." },
      { id: "options", label: "Options", helper: "Options payantes et variantes." },
      { id: "stock", label: "Stock", helper: "Quantite, dispo, reservation." },
      { id: "storefront", label: "Boutique", helper: "Visibilite et photos." },
    ],
  },
];

const createLocalId = (prefix) =>
  globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const standardFrenchTaxRateKeys = ["20.00", "10.00", "5.50", "2.10"];
const buildTaxRateKey = (rate) => {
  const parsedRate = Number(rate);
  return Number.isFinite(parsedRate) ? parsedRate.toFixed(2) : "";
};

const buildEmptyForm = (defaultTaxRateId = "") => ({
  name: "",
  public_name: "",
  public_description: "",
  long_description: "",
  category_slug: "",
  category_name: "",
  price_day: 0,
  price_weekend: 0,
  price_week: 0,
  price_custom_label: "",
  price_custom_amount: "",
  tax_rate_id: defaultTaxRateId,
  vat: null,
  stock: 1,
  status: "available",
  deposit: 0,
  serial_tracking: false,
  assignment_order: "auto",
  availability_note: "",
  internal_description: "",
  is_active: true,
  online_visible: false,
  is_featured: false,
  reservable: true,
  catalog_mode: "location",
  photos: [],
  options: [],
  variants: [],
  related_enabled: false,
  related_product_ids: [],
  related_sort_note: "",
  custom_filters: "",
  documents: [],
  questionnaire: "",
  inspection_template: "",
  subcategory: "",
  features: "",
  sku: "",
});

const buildFormFromProduct = (product, defaultTaxRateId = "") => {
  if (!product) {
    return buildEmptyForm(defaultTaxRateId);
  }

  return {
    ...buildEmptyForm(defaultTaxRateId),
    name: product.name || "",
    public_name: product.public_name || product.name || "",
    public_description: product.public_description || "",
    long_description: product.long_description || "",
    category_slug: product.categorySlug || "",
    category_name: product.category || "",
    price_day: Number(product.price || 0),
    price_weekend: Number(product.profile?.price_weekend || product.price || 0),
    price_week: Number(product.profile?.price_week || product.price || 0),
    price_custom_label: product.price_custom?.label || "",
    price_custom_amount:
      product.price_custom?.amount === null || product.price_custom?.amount === undefined
        ? ""
        : Number(product.price_custom.amount),
    tax_rate_id: product.tax_rate_id || defaultTaxRateId,
    vat: product.vat ?? null,
    stock: Number(product.stock || 0),
    status: product.status || "available",
    deposit: Number(product.deposit || 0),
    serial_tracking: Boolean(product.profile?.serial_tracking),
    assignment_order: product.profile?.assignment_order || "auto",
    availability_note: product.profile?.availability_note || "",
    internal_description: product.profile?.internal_description || "",
    is_active: product.isActive,
    online_visible: Boolean(product.online_visible),
    is_featured: Boolean(product.is_featured ?? product.profile?.is_featured),
    reservable: product.reservable ?? true,
    catalog_mode: product.catalog_mode || "location",
    photos: Array.isArray(product.profile?.photos) ? product.profile.photos : [],
    options: Array.isArray(product.options) ? product.options : [],
    variants: Array.isArray(product.variants) ? product.variants : [],
    related_enabled: Boolean(product.profile?.related_enabled),
    related_product_ids: Array.isArray(product.profile?.related_product_ids)
      ? product.profile.related_product_ids
      : [],
    related_sort_note: product.profile?.related_sort_note || "",
    custom_filters: product.profile?.custom_filters || "",
    documents: Array.isArray(product.profile?.documents) ? product.profile.documents : [],
    questionnaire: product.profile?.questionnaire || "",
    inspection_template: product.profile?.inspection_template || "",
    subcategory: product.profile?.subcategory || "",
    features: product.profile?.features || "",
    sku: product.sku || "",
  };
};

const withStableIds = (entries = [], prefix) =>
  entries.map((entry) => ({
    ...entry,
    id: entry.id || createLocalId(prefix),
  }));

const buildItemProfilePayload = (form, selectedCategory, normalizedTaxRateId) => ({
  internal_description: form.internal_description,
  tax_rate_id: normalizedTaxRateId,
  vat: normalizedTaxRateId ? null : null,
  serial_tracking: form.serial_tracking,
  assignment_order: form.assignment_order,
  availability_note: form.availability_note,
  category_slug: form.category_slug || null,
  category_name: form.category_name || selectedCategory?.name || null,
  subcategory: form.subcategory,
  features: form.features,
  custom_filters: form.custom_filters,
  documents: form.documents.filter(Boolean),
  questionnaire: form.questionnaire,
  inspection_template: form.inspection_template,
  price_weekend: Number(form.price_weekend || 0),
  price_week: Number(form.price_week || 0),
  price_custom: {
    label: form.price_custom_label,
    amount: form.price_custom_amount === "" ? null : Number(form.price_custom_amount),
  },
  online_visible: form.online_visible,
  is_featured: form.is_featured,
  is_active: form.is_active,
  reservable: form.reservable,
  public_name: form.public_name || form.name,
  public_description: form.public_description,
  long_description: form.long_description,
  photos: form.photos,
  related_enabled: form.related_enabled,
  related_product_ids: form.related_product_ids,
  related_sort_note: form.related_sort_note,
  catalog_mode: form.catalog_mode,
  sku: form.sku || "",
  options: form.options.filter((option) => option.name),
  variants: form.variants
    .filter((variant) => variant.name)
    .map((variant) => ({
      ...variant,
      stock: variant.stock === "" ? null : Number(variant.stock),
    })),
});

const buildImageUploadErrorMessage = (submissionError) => {
  if (!submissionError) {
    return "L'image n'a pas pu etre envoyee.";
  }

  if (
    submissionError.code === "catalog_image_too_large" ||
    submissionError.code === "request_entity_too_large" ||
    submissionError.statusCode === 413
  ) {
    return `L'image depasse la taille maximale autorisee de ${Math.round(
      MAX_CATALOG_IMAGE_SIZE_BYTES / (1024 * 1024)
    )} Mo.`;
  }

  if (submissionError.code === "catalog_image_too_small") {
    return "L'image est trop petite pour etre exploitable.";
  }

  if (submissionError.code === "catalog_image_dimensions") {
    return `L'image doit mesurer au moins ${MIN_CATALOG_IMAGE_WIDTH} x ${MIN_CATALOG_IMAGE_HEIGHT} px.`;
  }

  if (submissionError.code === "network_error") {
    return "L'image n'a pas pu etre envoyee. Verifiez la connexion ou reessayez avec un fichier plus leger.";
  }

  return submissionError.message || "L'image n'a pas pu etre envoyee.";
};

const buildCatalogProductPhotoWarning = (photoUploadFailures = [], keptExistingPhotos = false) => {
  if (!Array.isArray(photoUploadFailures) || !photoUploadFailures.length) {
    return "";
  }

  const firstFailureMessage = buildImageUploadErrorMessage(photoUploadFailures[0]);
  const baseMessage =
    photoUploadFailures.length === 1
      ? firstFailureMessage
      : "Certaines images n'ont pas pu etre envoyees.";

  return keptExistingPhotos
    ? `${baseMessage} Les photos deja presentes ont ete conservees.`
    : baseMessage;
};

const buildPhotoSequenceEntry = (entry) =>
  entry.kind === "existing" ? entry.url : `upload:${entry.photo.id}`;

const buildProductPhotoItems = (existingPhotos = [], pendingPhotos = []) => [
  ...existingPhotos.map((photoUrl) => ({
    key: `existing:${photoUrl}`,
    kind: "existing",
    url: photoUrl,
  })),
  ...pendingPhotos.map((photo) => ({
    key: `pending:${photo.id}`,
    kind: "pending",
    photo,
    url: photo.previewUrl,
  })),
];

const splitProductPhotoItems = (items = []) => ({
  photos: items
    .filter((entry) => entry.kind === "existing")
    .map((entry) => entry.url),
  pendingPhotos: items
    .filter((entry) => entry.kind === "pending")
    .map((entry) => entry.photo),
});

function ProductEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useLokifyWorkspace();
  const [activeSection, setActiveSection] = useState("general");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [autosaveMessage, setAutosaveMessage] = useState("");
  const [form, setForm] = useState(buildEmptyForm());
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedKeyRef = useRef("");
  const editingId = searchParams.get("product") || "";
  const preselectedCategorySlug = searchParams.get("category") || "";
  const editorMode = searchParams.get("mode") === "view" ? "view" : "edit";
  const isReadOnly = Boolean(editingId) && editorMode === "view";
  const product = workspace.products.find((entry) => entry.id === editingId) || null;
  const draftKey = editingId ? `product:${editingId}` : "product:new";

  const categories = workspace.categories
    .filter((category) => category.slug || category.name)
    .map((category) => ({
      slug: category.slug || slugifyLabel(category.name),
      name: category.name,
    }))
    .filter((category, index, array) => array.findIndex((entry) => entry.slug === category.slug) === index);
  const taxRates = workspace.taxRates || [];
  const preselectedCategory =
    categories.find((category) => category.slug === preselectedCategorySlug) || null;
  const availableTaxRates = taxRates.filter(
    (taxRate) =>
      standardFrenchTaxRateKeys.includes(buildTaxRateKey(taxRate.rate)) && Boolean(taxRate.is_active)
  );
  const inactiveSelectedTaxRate =
    form.tax_rate_id && !availableTaxRates.some((taxRate) => taxRate.id === form.tax_rate_id)
      ? taxRates.find((taxRate) => taxRate.id === form.tax_rate_id) || null
      : null;
  const legacyTaxLabel =
    !form.tax_rate_id && form.vat !== null && form.vat !== undefined ? `TVA actuelle ${form.vat}%` : "";
  const photoItems = buildProductPhotoItems(form.photos, pendingPhotos);
  const primaryPhotoItem = photoItems[0] || null;

  useEffect(() => {
    const flashMessage = consumeFlashMessage();
    if (!flashMessage) {
      return;
    }

    if (flashMessage.type === "error") {
      setError(flashMessage.message);
      setFeedback("");
      return;
    }

    setFeedback(flashMessage.message);
    setError("");
  }, []);

  useEffect(() => {
    if (workspace.loading) {
      return;
    }

    const baseForm = buildFormFromProduct(product, workspace.defaultTaxRate?.id || "");
    if (!product && preselectedCategory) {
      baseForm.category_slug = preselectedCategory.slug;
      baseForm.category_name = preselectedCategory.name;
    }
    const draft = readCatalogDraft(draftKey, null);
    const nextForm = draft ? { ...baseForm, ...draft } : baseForm;
    nextForm.options = withStableIds(nextForm.options, "option");
    nextForm.variants = withStableIds(nextForm.variants, "variant");

    const nextKey = JSON.stringify({
      draftKey,
        productId: product?.id || "",
        updatedAt: product?.profile?.updated_at || product?.updated_at || "",
        defaultTaxRateId: workspace.defaultTaxRate?.id || "",
        preselectedCategorySlug: preselectedCategory?.slug || "",
      });

    if (initializedKeyRef.current === nextKey) {
      return;
    }

    initializedKeyRef.current = nextKey;
    setForm(nextForm);
    setPendingPhotos([]);
  }, [draftKey, preselectedCategory, product, workspace.defaultTaxRate, workspace.loading]);

  useEffect(() => {
    if (!initializedKeyRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveCatalogDraft(draftKey, form);
      setAutosaveMessage("Brouillon auto-enregistre localement.");
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [draftKey, form]);

  const setValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updatePhotoCollections = (updater) => {
    const nextItems = updater(buildProductPhotoItems(form.photos, pendingPhotos));
    const nextCollections = splitProductPhotoItems(nextItems);
    setForm((current) => ({
      ...current,
      photos: nextCollections.photos,
    }));
    setPendingPhotos(nextCollections.pendingPhotos);
  };

  const movePhotoItem = (itemKey, direction) => {
    updatePhotoCollections((currentItems) => {
      const currentIndex = currentItems.findIndex((entry) => entry.key === itemKey);
      const targetIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= currentItems.length
      ) {
        return currentItems;
      }

      const nextItems = [...currentItems];
      const [movedItem] = nextItems.splice(currentIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
      return nextItems;
    });
  };

  const promotePhotoItem = (itemKey) => {
    updatePhotoCollections((currentItems) => {
      const currentIndex = currentItems.findIndex((entry) => entry.key === itemKey);
      if (currentIndex <= 0) {
        return currentItems;
      }

      const nextItems = [...currentItems];
      const [movedItem] = nextItems.splice(currentIndex, 1);
      nextItems.unshift(movedItem);
      return nextItems;
    });
  };

  const removePhotoItem = (itemKey) => {
    updatePhotoCollections((currentItems) =>
      currentItems.filter((entry) => entry.key !== itemKey)
    );
  };

  const addPhotos = async (files) => {
    const selectedFiles = Array.from(files || []);
    const remainingSlots =
      MAX_CATALOG_ITEM_PHOTOS - (form.photos.length + pendingPhotos.length);

    if (!selectedFiles.length) {
      return;
    }

    if (remainingSlots <= 0) {
      setError(
        `Vous ne pouvez pas ajouter plus de ${MAX_CATALOG_ITEM_PHOTOS} images sur ce produit.`
      );
      setFeedback("");
      return;
    }

    const nextPendingPhotos = [];
    const messages = [];

    for (const file of selectedFiles.slice(0, remainingSlots)) {
      try {
        const preparedPhoto = await prepareCatalogImage(file);
        nextPendingPhotos.push(preparedPhoto);
      } catch (submissionError) {
        messages.push(buildImageUploadErrorMessage(submissionError));
      }
    }

    if (selectedFiles.length > remainingSlots) {
      messages.push(
        `Seules ${MAX_CATALOG_ITEM_PHOTOS} images peuvent etre conservees sur une fiche produit.`
      );
    }

    if (nextPendingPhotos.length) {
      updatePhotoCollections((currentItems) => [
        ...currentItems,
        ...buildProductPhotoItems([], nextPendingPhotos),
      ]);
      setFeedback(
        `${nextPendingPhotos.length} image(s) prete(s) a etre envoyee(s) lors de l'enregistrement.`
      );
      setError(messages[0] || "");
      return;
    }

    if (messages.length) {
      setError(messages[0]);
      setFeedback("");
    }
  };

  const addOption = () => {
    setForm((current) => ({
      ...current,
      options: [...current.options, { id: createLocalId("option"), name: "", price: 0, required: false }],
    }));
  };

  const addVariant = () => {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { id: createLocalId("variant"), name: "", price: 0, stock: "" }],
    }));
  };

  const updateCollectionItem = (collection, itemId, field, value) => {
    setForm((current) => ({
      ...current,
      [collection]: current[collection].map((entry) =>
        entry.id === itemId ? { ...entry, [field]: value } : entry
      ),
    }));
  };

  const removeCollectionItem = (collection, itemId) => {
    setForm((current) => ({
      ...current,
      [collection]: current[collection].filter((entry) => entry.id !== itemId),
    }));
  };

  const handleDuplicate = async () => {
    if (!editingId) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.duplicateItem(editingId);
      setFeedback("Produit duplique.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isReadOnly) {
      return;
    }

    setError("");
    setFeedback("");
    setIsSubmitting(true);

    try {
      const selectedCategory = categories.find((category) => category.slug === form.category_slug);
      const normalizedTaxRateId = availableTaxRates.some((taxRate) => taxRate.id === form.tax_rate_id)
        ? form.tax_rate_id
        : null;
      const response = await workspace.saveCatalogProduct(
        {
          item: {
            name: form.name,
            category: form.category_name || selectedCategory?.name || "",
            stock: Number(form.stock || 0),
            status: form.status,
            price: Number(form.price_day || 0),
            deposit: Number(form.deposit || 0),
          },
          profile: buildItemProfilePayload(form, selectedCategory, normalizedTaxRateId),
          photo_uploads: pendingPhotos.map((pendingPhoto) => ({
            client_id: pendingPhoto.id,
            data_url: pendingPhoto.dataUrl,
            file_name: pendingPhoto.fileName,
          })),
          photo_sequence: photoItems.map(buildPhotoSequenceEntry),
        },
        editingId || null
      );

      const savedProductId = response?.item?.id || editingId;
      const savedPhotos = Array.isArray(response?.itemProfile?.photos)
        ? response.itemProfile.photos
        : form.photos;
      const uploadWarningMessage = buildCatalogProductPhotoWarning(
        response?.photoUploadFailures,
        response?.keptExistingPhotos
      );

      setForm((current) => ({
        ...current,
        photos: savedPhotos,
      }));
      setPendingPhotos([]);

      removeCatalogDraft(draftKey);
      setAutosaveMessage("Brouillon synchronise.");

      if (uploadWarningMessage) {
        if (!editingId) {
          setFlashMessage({
            type: "error",
            message: `Le produit a bien ete cree mais ${uploadWarningMessage.charAt(0).toLowerCase()}${uploadWarningMessage.slice(1)}`,
          });
          router.replace(`/catalogue/produits/nouveau?product=${savedProductId}&mode=edit`);
          return;
        }

        setFeedback("Produit mis a jour.");
        setError(uploadWarningMessage);
        return;
      }

      if (!editingId) {
        setFlashMessage({ type: "success", message: "Produit cree." });
        router.replace("/catalogue");
        return;
      }

      setFeedback("Produit mis a jour.");
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Catalogue / Produit</p>
            <h3>{editingId ? (isReadOnly ? "Consulter un produit" : "Modifier un produit") : "Ajouter un produit"}</h3>
            <p>Edition compacte, sans categorie imposee, avec options, variantes, tarification avancee et parametres prets pour la boutique et la reservation.</p>
          </div>
          <div className="page-header-actions">
            {editingId && !isReadOnly ? (
              <button type="button" className="button ghost" onClick={handleDuplicate}>
                Dupliquer
              </button>
            ) : null}
            {editingId && isReadOnly ? (
              <Link href={`/catalogue/produits/nouveau?product=${editingId}&mode=edit`} className="button secondary">
                Passer en edition
              </Link>
            ) : null}
            <Link href="/catalogue" className="button ghost">
              Retour au catalogue
            </Link>
          </div>
        </div>

        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}
        {autosaveMessage ? <p className="feedback">{autosaveMessage}</p> : null}

        <section className="subnav-layout">
          <SecondaryNav title="Menu produit" groups={navigationGroups} activeId={activeSection} onChange={setActiveSection} />

          <Panel
            title={form.public_name || form.name || "Nouveau produit"}
            description="Le panneau de droite reste dense mais compact, pour limiter les espaces perdus."
            actions={
              <StatusPill tone={isReadOnly ? "neutral" : "info"}>
                {editingId ? (isReadOnly ? "Lecture" : "Edition") : "Nouveau"}
              </StatusPill>
            }
          >
            <form className="form-grid catalog-compact-form" onSubmit={handleSubmit}>
              <fieldset disabled={isReadOnly} className="catalog-form-fieldset">
                {activeSection === "general" ? (
                  <div className="editor-section-grid">
                    <div className="editor-section-grid two-columns">
                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>Informations generales</h4>
                            <p>Nom, description courte et description longue prêtes pour la boutique.</p>
                          </div>
                        </div>

                        <div className="field">
                          <label htmlFor="product-name">Nom du produit</label>
                          <input
                            id="product-name"
                            value={form.name}
                            onChange={(event) => setValue("name", event.target.value)}
                            required
                          />
                        </div>

                        <div className="field">
                          <label htmlFor="product-short-description">Description courte</label>
                          <textarea
                            id="product-short-description"
                            value={form.public_description}
                            onChange={(event) => setValue("public_description", event.target.value)}
                            placeholder="Texte court visible dans le catalogue et la boutique."
                          />
                        </div>
                      </div>

                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>Structure catalogue</h4>
                            <p>La categorie reste facultative et totalement libre.</p>
                          </div>
                        </div>

                        <div className="field">
                          <label htmlFor="product-category">Categorie</label>
                          <select
                            id="product-category"
                            value={form.category_slug}
                            onChange={(event) => {
                              const nextCategory = categories.find((category) => category.slug === event.target.value);
                              setForm((current) => ({
                                ...current,
                                category_slug: event.target.value,
                                category_name: nextCategory?.name || "",
                              }));
                            }}
                          >
                            <option value="">Sans categorie</option>
                            {categories.map((category) => (
                              <option key={category.slug} value={category.slug}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label htmlFor="product-public-name">Nom public</label>
                          <input
                            id="product-public-name"
                            value={form.public_name}
                            onChange={(event) => setValue("public_name", event.target.value)}
                            placeholder="Si vide, le nom du produit sera utilise."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="section-block">
                      <div className="section-block-header">
                        <div>
                          <h4>Description longue</h4>
                          <p>Texte plus detaille pour la future boutique en ligne et les fiches produit.</p>
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="product-long-description">Description longue</label>
                        <textarea
                          id="product-long-description"
                          value={form.long_description}
                          onChange={(event) => setValue("long_description", event.target.value)}
                          placeholder="Usage, contenu, points forts, conditions..."
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {activeSection === "pricing" ? (
                  <div className="editor-section-grid">
                    <div className="editor-section-grid two-columns">
                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>Tarification</h4>
                            <p>Prix de base et tarification avancee jour / week-end / semaine.</p>
                          </div>
                        </div>

                        <div className="form-grid two-columns">
                          <div className="field">
                            <label htmlFor="price-day">Prix de base</label>
                            <input
                              id="price-day"
                              type="number"
                              min="0"
                              value={form.price_day}
                              onChange={(event) => setValue("price_day", Number(event.target.value))}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="product-deposit">Caution</label>
                            <input
                              id="product-deposit"
                              type="number"
                              min="0"
                              value={form.deposit}
                              onChange={(event) => setValue("deposit", Number(event.target.value))}
                            />
                          </div>
                        </div>

                        <div className="form-grid two-columns">
                          <div className="field">
                            <label htmlFor="price-weekend">Prix week-end</label>
                            <input
                              id="price-weekend"
                              type="number"
                              min="0"
                              value={form.price_weekend}
                              onChange={(event) => setValue("price_weekend", Number(event.target.value))}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="price-week">Prix semaine</label>
                            <input
                              id="price-week"
                              type="number"
                              min="0"
                              value={form.price_week}
                              onChange={(event) => setValue("price_week", Number(event.target.value))}
                            />
                          </div>
                        </div>

                        <div className="form-grid two-columns">
                          <div className="field">
                            <label htmlFor="custom-price-label">Prix personnalise</label>
                            <input
                              id="custom-price-label"
                              value={form.price_custom_label}
                              onChange={(event) => setValue("price_custom_label", event.target.value)}
                              placeholder="Ex. forfait salon, tarif sur demande"
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="custom-price-amount">Montant personnalise</label>
                            <input
                              id="custom-price-amount"
                              type="number"
                              min="0"
                              value={form.price_custom_amount}
                              onChange={(event) => setValue("price_custom_amount", event.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>TVA & mode</h4>
                            <p>Le produit ne propose que les TVA configurees par le prestataire.</p>
                          </div>
                        </div>

                        <div className="field">
                          <label htmlFor="product-tax-rate">TVA</label>
                          <select
                            id="product-tax-rate"
                            value={form.tax_rate_id}
                            onChange={(event) => setValue("tax_rate_id", event.target.value)}
                          >
                              <option value="">Selectionner une TVA</option>
                              {availableTaxRates.map((taxRate) => (
                                  <option key={taxRate.id} value={taxRate.id}>
                                    {taxRate.label}
                                  </option>
                                ))}
                            </select>
                            {inactiveSelectedTaxRate ? (
                              <p className="field-hint">
                                La TVA actuellement associee n&apos;est plus active dans Parametres &gt; TVA.
                              </p>
                            ) : null}
                          </div>

                        <div className="field">
                          <label htmlFor="catalog-mode">Mode catalogue</label>
                          <select
                            id="catalog-mode"
                            value={form.catalog_mode}
                            onChange={(event) => setValue("catalog_mode", event.target.value)}
                          >
                            <option value="location">Location</option>
                            <option value="sale">Vente</option>
                            <option value="resale">Revente</option>
                          </select>
                        </div>

                        <div className="detail-card">
                          <strong>Gestion TVA</strong>
                          <span className="muted-text">
                            Configurez vos taux dans Parametres. Aucun taux standard Lokify n'est impose.
                          </span>
                        </div>
                        {legacyTaxLabel ? (
                          <div className="detail-card">
                            <strong>TVA historique detectee</strong>
                            <span className="muted-text">
                              {legacyTaxLabel}. Associez-la a un taux configure dans Parametres pour normaliser la fiche.
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                {activeSection === "options" ? (
                  <div className="editor-section-grid">
                    <div className="section-block">
                      <div className="section-block-header">
                        <div>
                          <h4>Options produit</h4>
                          <p>Ajoutez des options obligatoires ou facultatives, avec prix dedie.</p>
                        </div>
                      </div>

                      <div className="card-list catalog-mini-list">
                        {form.options.map((option) => (
                          <article key={option.id} className="detail-card catalog-inline-card">
                            <div className="editor-section-grid two-columns">
                              <div className="field">
                                <label htmlFor={`option-name-${option.id}`}>Nom</label>
                                <input
                                  id={`option-name-${option.id}`}
                                  value={option.name}
                                  onChange={(event) =>
                                    updateCollectionItem("options", option.id, "name", event.target.value)
                                  }
                                  placeholder="Ex. livraison, fumee, accessoires"
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`option-price-${option.id}`}>Prix</label>
                                <input
                                  id={`option-price-${option.id}`}
                                  type="number"
                                  min="0"
                                  value={option.price}
                                  onChange={(event) =>
                                    updateCollectionItem("options", option.id, "price", Number(event.target.value))
                                  }
                                />
                              </div>
                            </div>
                            <div className="row-actions">
                              <label className="row-actions">
                                <input
                                  type="checkbox"
                                  checked={Boolean(option.required)}
                                  onChange={(event) =>
                                    updateCollectionItem("options", option.id, "required", event.target.checked)
                                  }
                                />
                                <span className="muted-text">Option obligatoire</span>
                              </label>
                              <button
                                type="button"
                                className="button ghost"
                                onClick={() => removeCollectionItem("options", option.id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          </article>
                        ))}
                        {!form.options.length ? (
                          <div className="empty-state">
                            <strong>Aucune option</strong>
                            <span>Ajoutez ici les services ou accessoires associes.</span>
                          </div>
                        ) : null}
                      </div>

                      <button type="button" className="button ghost" onClick={addOption}>
                        + Ajouter une option
                      </button>
                    </div>

                    <div className="section-block">
                      <div className="section-block-header">
                        <div>
                          <h4>Variantes</h4>
                          <p>Chaque variante peut avoir son nom, son prix et son stock optionnel.</p>
                        </div>
                      </div>

                      <div className="card-list catalog-mini-list">
                        {form.variants.map((variant) => (
                          <article key={variant.id} className="detail-card catalog-inline-card">
                            <div className="editor-section-grid three-columns">
                              <div className="field">
                                <label htmlFor={`variant-name-${variant.id}`}>Nom</label>
                                <input
                                  id={`variant-name-${variant.id}`}
                                  value={variant.name}
                                  onChange={(event) =>
                                    updateCollectionItem("variants", variant.id, "name", event.target.value)
                                  }
                                  placeholder="Ex. 200 tirages"
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`variant-price-${variant.id}`}>Prix</label>
                                <input
                                  id={`variant-price-${variant.id}`}
                                  type="number"
                                  min="0"
                                  value={variant.price}
                                  onChange={(event) =>
                                    updateCollectionItem("variants", variant.id, "price", Number(event.target.value))
                                  }
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`variant-stock-${variant.id}`}>Stock</label>
                                <input
                                  id={`variant-stock-${variant.id}`}
                                  type="number"
                                  min="0"
                                  value={variant.stock}
                                  onChange={(event) =>
                                    updateCollectionItem("variants", variant.id, "stock", event.target.value)
                                  }
                                  placeholder="Optionnel"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              className="button ghost"
                              onClick={() => removeCollectionItem("variants", variant.id)}
                            >
                              Supprimer
                            </button>
                          </article>
                        ))}
                        {!form.variants.length ? (
                          <div className="empty-state">
                            <strong>Aucune variante</strong>
                            <span>Ajoutez des paliers de volume, formats ou editions.</span>
                          </div>
                        ) : null}
                      </div>

                      <button type="button" className="button ghost" onClick={addVariant}>
                        + Ajouter une variante
                      </button>
                    </div>
                  </div>
                ) : null}

                {activeSection === "stock" ? (
                  <div className="editor-section-grid">
                    <div className="editor-section-grid two-columns">
                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>Stock & disponibilite</h4>
                            <p>Structure compatible planning, blocage de stock et futures dates de reservation.</p>
                          </div>
                        </div>

                        <div className="form-grid two-columns">
                          <div className="field">
                            <label htmlFor="product-stock">Quantite</label>
                            <input
                              id="product-stock"
                              type="number"
                              min="0"
                              value={form.stock}
                              onChange={(event) => setValue("stock", Number(event.target.value))}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="product-status">Disponibilite</label>
                            <select
                              id="product-status"
                              value={form.status}
                              onChange={(event) => setValue("status", event.target.value)}
                            >
                              <option value="available">Disponible</option>
                              <option value="reserved">Reserve</option>
                              <option value="maintenance">Maintenance</option>
                              <option value="unavailable">Indisponible</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-grid two-columns">
                          <div className="field">
                            <label htmlFor="assignment-order">Ordre d'attribution</label>
                            <select
                              id="assignment-order"
                              value={form.assignment_order}
                              onChange={(event) => setValue("assignment_order", event.target.value)}
                            >
                              <option value="auto">Automatique</option>
                              <option value="manual">Manuel</option>
                              <option value="fifo">FIFO</option>
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor="availability-note">Note de disponibilite</label>
                            <input
                              id="availability-note"
                              value={form.availability_note}
                              onChange={(event) => setValue("availability_note", event.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="section-block">
                        <div className="section-block-header">
                          <div>
                            <h4>Parametres produit</h4>
                            <p>Activation, reservation et visibilite sans rigidifier le workflow.</p>
                          </div>
                        </div>

                        <label className="detail-card">
                          <strong>Produit actif</strong>
                          <div className="row-actions">
                            <input
                              type="checkbox"
                              checked={form.is_active}
                              onChange={(event) => setValue("is_active", event.target.checked)}
                            />
                            <span className="muted-text">Coupe le produit sans supprimer l'historique.</span>
                          </div>
                        </label>

                        <label className="detail-card">
                          <strong>Reservable</strong>
                          <div className="row-actions">
                            <input
                              type="checkbox"
                              checked={form.reservable}
                              onChange={(event) => setValue("reservable", event.target.checked)}
                            />
                            <span className="muted-text">Preparation du moteur de reservation.</span>
                          </div>
                        </label>

                        <label className="detail-card">
                          <strong>Suivi par unite</strong>
                          <div className="row-actions">
                            <input
                              type="checkbox"
                              checked={form.serial_tracking}
                              onChange={(event) => setValue("serial_tracking", event.target.checked)}
                            />
                            <span className="muted-text">Compatibilite atelier / tracking unitaire.</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="internal-note">Note interne</label>
                      <textarea
                        id="internal-note"
                        value={form.internal_description}
                        onChange={(event) => setValue("internal_description", event.target.value)}
                        placeholder="Logistique, points de vigilance, preparation..."
                      />
                    </div>
                  </div>
                ) : null}

                {activeSection === "storefront" ? (
                  <div className="editor-section-grid">
                    <div className="section-block">
                      <div className="section-block-header">
                        <div>
                          <h4>Boutique en ligne</h4>
                          <p>La premiere image devient l'image principale du catalogue et de la boutique.</p>
                        </div>
                      </div>

                      <label className="detail-card">
                        <strong>Visible en ligne</strong>
                        <div className="row-actions">
                          <input
                            type="checkbox"
                            checked={form.online_visible}
                            onChange={(event) => setValue("online_visible", event.target.checked)}
                          />
                          <span className="muted-text">Active la fiche cote boutique lorsque vous le souhaitez.</span>
                        </div>
                      </label>

                      <label className="detail-card">
                        <strong>Ajouter aux produits phares</strong>
                        <div className="row-actions">
                          <input
                            type="checkbox"
                            checked={form.is_featured}
                            onChange={(event) => setValue("is_featured", event.target.checked)}
                          />
                          <span className="muted-text">
                            Affiche le produit dans la section premium de la boutique publique.
                          </span>
                        </div>
                      </label>

                      <label className="button ghost" htmlFor="product-photos">
                        Ajouter des images
                      </label>
                      <input
                        id="product-photos"
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(event) => {
                          void addPhotos(event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <p className="field-hint">
                        JPG, PNG ou WebP. Taille max {Math.round(MAX_CATALOG_IMAGE_SIZE_BYTES / (1024 * 1024))} Mo.
                        Dimensions minimales {MIN_CATALOG_IMAGE_WIDTH} x {MIN_CATALOG_IMAGE_HEIGHT} px.
                      </p>

                      <div className="editor-section-grid two-columns">
                        <div className="detail-card catalog-media-summary-card">
                          <strong>Image principale</strong>
                          <span className="muted-text">
                            Utilisee dans le catalogue, les listings et les cartes produit.
                          </span>
                          {primaryPhotoItem ? (
                            <div className="thumbnail-card">
                              <div className="thumbnail-media">
                                <img
                                  src={primaryPhotoItem.url}
                                  alt={form.public_name || form.name || "Produit"}
                                />
                              </div>
                              <div className="stack">
                                <strong>
                                  {primaryPhotoItem.kind === "pending"
                                    ? "Nouvelle image principale"
                                    : "Image principale actuelle"}
                                </strong>
                                <span className="muted-text">
                                  {primaryPhotoItem.kind === "pending"
                                    ? `${primaryPhotoItem.photo.width} x ${primaryPhotoItem.photo.height} px - ${formatCatalogImageSize(primaryPhotoItem.photo.sizeBytes)}`
                                    : "La boutique et le catalogue utiliseront cette image en premier."}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="empty-state">
                              <strong>Aucune image principale</strong>
                              <span>Ajoutez une premiere image pour representer le produit partout.</span>
                            </div>
                          )}
                        </div>

                        <div className="detail-card catalog-media-summary-card">
                          <strong>Galerie produit</strong>
                          <span className="muted-text">
                            Les autres images apparaissent dans la fiche produit cote boutique.
                          </span>
                          <div className="stack">
                            <span className="muted-text">
                              Glissez visuellement l'ordre avec les boutons. La premiere image reste la plus importante.
                            </span>
                            <span className="muted-text">
                              {photoItems.length
                                ? `${photoItems.length} image(s) preparee(s) sur ${MAX_CATALOG_ITEM_PHOTOS}`
                                : "Aucune image ajoutee pour le moment."}
                            </span>
                          </div>
                        </div>
                      </div>

                      {photoItems.length ? (
                        <div className="thumbnail-grid catalog-gallery-grid">
                          {photoItems.map((photoItem, index) => (
                            <div key={photoItem.key} className="thumbnail-card">
                              <div className="thumbnail-media">
                                <img
                                  src={photoItem.url}
                                  alt={`${form.public_name || form.name || "Produit"} ${index + 1}`}
                                />
                              </div>
                              <div className="stack">
                                <strong>
                                  {index === 0 ? "Image principale" : `Galerie ${index}`}
                                </strong>
                                <span className="muted-text">
                                  {photoItem.kind === "pending"
                                    ? `${photoItem.photo.width} x ${photoItem.photo.height} px - ${formatCatalogImageSize(photoItem.photo.sizeBytes)}`
                                    : "Image deja enregistree"}
                                </span>
                                <span className="muted-text">
                                  {photoItem.kind === "pending" ? "En attente d'envoi" : "Deja visible apres sauvegarde"}
                                </span>
                              </div>
                              <div className="row-actions thumbnail-actions">
                                {index > 0 ? (
                                  <button
                                    type="button"
                                    className="button subtle"
                                    onClick={() => promotePhotoItem(photoItem.key)}
                                  >
                                    Mettre en avant
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="button subtle"
                                  onClick={() => movePhotoItem(photoItem.key, -1)}
                                  disabled={index === 0}
                                >
                                  Monter
                                </button>
                                <button
                                  type="button"
                                  className="button subtle"
                                  onClick={() => movePhotoItem(photoItem.key, 1)}
                                  disabled={index === photoItems.length - 1}
                                >
                                  Descendre
                                </button>
                                <button
                                  type="button"
                                  className="button subtle"
                                  onClick={() => removePhotoItem(photoItem.key)}
                                >
                                  Retirer
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </fieldset>

              <div className="row-actions form-actions-bar">
                {!isReadOnly ? (
                  <button type="submit" className="button primary" disabled={workspace.mutating || isSubmitting}>
                    {workspace.mutating || isSubmitting ? "Enregistrement..." : editingId ? "Sauvegarder le produit" : "Creer le produit"}
                  </button>
                ) : null}
                <Link href="/catalogue" className="button ghost">
                  Retour
                </Link>
              </div>
            </form>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}

export default function ProductEditorPage() {
  return (
    <Suspense fallback={null}>
      <ProductEditorPageContent />
    </Suspense>
  );
}
