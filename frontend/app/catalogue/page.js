"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import AppShell from "../../components/app-shell";
import Icon from "../../components/icon";
import ModalShell from "../../components/modal-shell";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import ToggleSwitch from "../../components/toggle-switch";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { apiRequest } from "../../lib/api";
import { formatCurrency } from "../../lib/date";
import { consumeFlashMessage } from "../../lib/flash-message";
import { buildStorefrontUrl } from "../../lib/storefront";

const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
const filters = [
  { id: "all", label: "Tout" },
  { id: "available", label: "Disponible" },
  { id: "unavailable", label: "Indisponible" },
  { id: "out_of_stock", label: "Rupture" },
];

const searchable = (values) => values.filter(Boolean).join(" ").toLowerCase();
const sortByLabel = (left, right) => String(left || "").localeCompare(String(right || ""), "fr", { sensitivity: "base" });
const matchesFilter = (filter, key) => filter === "all" || filter === key;
const formatCountLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const initials = (value) =>
  String(value || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "LK";

const buildCategoryRows = (categories, products) => {
  const map = new Map();
  categories.forEach((category) => {
    const id = String(category.slug || category.id || "").trim();
    if (!id) return;
    map.set(id, { id, label: category.name || "Categorie", productCount: 0, isUncategorized: false });
  });
  products.forEach((product) => {
    const id = String(product.categorySlug || "").trim();
    if (!id) return;
    if (!map.has(id)) map.set(id, { id, label: product.category || "Categorie", productCount: 0, isUncategorized: false });
  });
  const rows = Array.from(map.values())
    .map((category) => ({ ...category, productCount: products.filter((product) => String(product.categorySlug || "").trim() === category.id).length }))
    .sort((left, right) => sortByLabel(left.label, right.label));
  const uncategorizedCount = products.filter((product) => !String(product.categorySlug || "").trim()).length;
  if (uncategorizedCount) rows.push({ id: UNCATEGORIZED_CATEGORY_ID, label: "Sans categorie", productCount: uncategorizedCount, isUncategorized: true });
  return rows;
};

const isStockManagedProduct = (product) => {
  const totalStock = Number(product.stock || 0);
  const availableUnits = Number(product.availableUnits || 0);
  return Boolean(product.profile?.serial_tracking || totalStock > 1 || Number(product.reservedUnits || 0) > 0 || Number(product.unavailableUnits || 0) > 0 || availableUnits !== totalStock);
};

const buildProductPayload = (product, overrides = {}) => ({
  internal_description: product.profile?.internal_description || "",
  tax_rate_id: product.tax_rate_id || null,
  vat: product.vat ?? null,
  serial_tracking: Boolean(product.profile?.serial_tracking),
  assignment_order: product.profile?.assignment_order || "auto",
  availability_note: product.profile?.availability_note || "",
  category_slug: product.categorySlug || null,
  category_name: product.category || null,
  subcategory: product.profile?.subcategory || "",
  features: product.profile?.features || "",
  custom_filters: product.profile?.custom_filters || "",
  documents: Array.isArray(product.profile?.documents) ? product.profile.documents : [],
  questionnaire: product.profile?.questionnaire || "",
  inspection_template: product.profile?.inspection_template || "",
  price_weekend: Number(product.profile?.price_weekend ?? product.price ?? 0),
  price_week: Number(product.profile?.price_week ?? product.price ?? 0),
  price_custom: product.price_custom || { label: "", amount: null },
  online_visible: Boolean(product.online_visible),
  is_active: product.isActive,
  reservable: product.reservable ?? true,
  public_name: product.public_name || product.name,
  public_description: product.public_description || "",
  long_description: product.long_description || "",
  photos: Array.isArray(product.profile?.photos) ? product.profile.photos : [],
  related_enabled: Boolean(product.profile?.related_enabled),
  related_product_ids: Array.isArray(product.profile?.related_product_ids) ? product.profile.related_product_ids : [],
  related_sort_note: product.profile?.related_sort_note || "",
  catalog_mode: product.catalog_mode || "location",
  sku: product.sku || "",
  options: Array.isArray(product.options) ? product.options : [],
  variants: Array.isArray(product.variants) ? product.variants : [],
  ...overrides,
});

const buildPackPayload = (pack, overrides = {}) => ({
  name: pack.name || "",
  description: pack.description || "",
  discount_type: pack.discount_type || "none",
  discount_value: Number(pack.discount_value || 0),
  product_ids: (Array.isArray(pack.linkedProducts) ? pack.linkedProducts : []).slice().sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)).map((product) => product.id || product.item_id).filter(Boolean),
  is_active: Boolean(pack.is_active),
  ...overrides,
});

const getPackMeta = (pack) => ({
  tone: pack.is_active ? "success" : "danger",
  label: pack.is_active ? "Disponible" : "Indisponible",
  filterKey: pack.is_active ? "available" : "unavailable",
  coverImage: pack.cover_image || (Array.isArray(pack.linkedProducts) ? pack.linkedProducts.find((product) => product.thumbnail)?.thumbnail || "" : ""),
});

const getProductMeta = (product) => {
  if (!isStockManagedProduct(product)) return { stockManaged: false, tone: product.isActive ? "success" : "danger", label: product.isActive ? "Disponible" : "Indisponible", filterKey: product.isActive ? "available" : "unavailable", stockLabel: "Toggle manuel", hint: product.isActive ? "Activation manuelle." : "Coupe manuelle." };
  const total = Number(product.stock || 0);
  const available = Number(product.availableUnits || 0);
  const ratio = `${available}/${total}`;
  if (!product.isActive) return { stockManaged: true, tone: "danger", label: `Indisponible ${ratio}`, filterKey: "unavailable", stockLabel: ratio, hint: "Produit desactive." };
  if (available <= 0) return { stockManaged: true, tone: "danger", label: `Rupture ${ratio}`, filterKey: "out_of_stock", stockLabel: ratio, hint: "Aucune unite disponible." };
  if (available < total) return { stockManaged: true, tone: "warning", label: `Stock faible ${ratio}`, filterKey: "available", stockLabel: ratio, hint: "Disponibilite partielle." };
  return { stockManaged: true, tone: "success", label: `Disponible ${ratio}`, filterKey: "available", stockLabel: ratio, hint: "Stock complet." };
};

function ActionMenu({ triggerClassName, triggerLabel, triggerTitle, items }) {
  if (!items.length) return null;
  return (
    <details className="quick-actions-menu catalog-action-menu">
      <summary className={triggerClassName} aria-label={triggerTitle}>{triggerLabel}</summary>
      <div className="quick-actions-popover catalog-action-popover">
        {items.map((item) => item.href ? (
          <Link key={item.id} href={item.href} className="user-popover-link catalog-action-link"><strong>{item.label}</strong></Link>
        ) : (
          <button key={item.id} type="button" className="user-popover-link catalog-action-link" onClick={item.onClick} disabled={item.disabled}><strong>{item.label}</strong></button>
        ))}
      </div>
    </details>
  );
}

function Media({ src, label, kind = "product" }) {
  return (
    <div className={`catalog-card-media catalog-card-media-${kind}`.trim()}>
      {src ? <img src={src} alt={label} /> : <div className="catalog-card-media-placeholder"><span>{initials(label)}</span></div>}
    </div>
  );
}

function Badge({ tone, label }) {
  return (
    <StatusPill tone={tone}>
      <span className="catalog-status-pill-content">
        <span className={`catalog-status-dot tone-${tone}`} />
        <span>{label}</span>
      </span>
    </StatusPill>
  );
}

export default function CataloguePage() {
  const workspace = useLokifyWorkspace();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [storefrontSlug, setStorefrontSlug] = useState("");
  const [isBatching, setIsBatching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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

  const categoryRows = useMemo(() => buildCategoryRows(workspace.categories, workspace.products), [workspace.categories, workspace.products]);
  useEffect(() => {
    if (!categoryRows.length) return void setSelectedCategory("");
    if (!categoryRows.some((category) => category.id === selectedCategory)) setSelectedCategory(categoryRows[0].id);
  }, [categoryRows, selectedCategory]);

  useEffect(() => {
    let cancelled = false;
    const loadStorefrontSettings = async () => {
      try {
        const response = await apiRequest("/storefront/settings");
        if (!cancelled) setStorefrontSlug(response.storefrontSettings?.slug || "");
      } catch (_error) {
        if (!cancelled) setStorefrontSlug("");
      }
    };
    void loadStorefrontSettings();
    return () => { cancelled = true; };
  }, []);

  const selectedCategoryRecord = categoryRows.find((category) => category.id === selectedCategory) || null;

  const packCards = useMemo(() => workspace.packs.filter((pack) => !deferredSearch || searchable([pack.name, pack.description]).includes(deferredSearch)).map((pack) => ({ ...pack, ui: getPackMeta(pack) })).filter((pack) => matchesFilter(availabilityFilter, pack.ui.filterKey)).sort((left, right) => sortByLabel(left.name, right.name)), [availabilityFilter, deferredSearch, workspace.packs]);

  const productCards = useMemo(() => {
    if (!selectedCategoryRecord) return [];
    return workspace.products
      .filter((product) => selectedCategoryRecord.isUncategorized ? !String(product.categorySlug || "").trim() : String(product.categorySlug || "").trim() === selectedCategoryRecord.id)
      .filter((product) => !deferredSearch || searchable([product.public_name, product.name, product.category || "Sans categorie", product.sku, product.public_description]).includes(deferredSearch))
      .map((product) => ({ ...product, ui: getProductMeta(product) }))
      .filter((product) => matchesFilter(availabilityFilter, product.ui.filterKey))
      .sort((left, right) => sortByLabel(left.public_name || left.name, right.public_name || right.name));
  }, [availabilityFilter, deferredSearch, selectedCategoryRecord, workspace.products]);

  const baseProductCards = useMemo(() => {
    if (!selectedCategoryRecord) return [];
    return workspace.products
      .filter((product) => selectedCategoryRecord.isUncategorized ? !String(product.categorySlug || "").trim() : String(product.categorySlug || "").trim() === selectedCategoryRecord.id)
      .filter((product) => !deferredSearch || searchable([product.public_name, product.name, product.category || "Sans categorie", product.sku, product.public_description]).includes(deferredSearch))
      .map((product) => ({ ...product, ui: getProductMeta(product) }));
  }, [deferredSearch, selectedCategoryRecord, workspace.products]);

  const filterCounts = useMemo(() => {
    const counts = { all: 0, available: 0, unavailable: 0, out_of_stock: 0 };
    workspace.packs.filter((pack) => !deferredSearch || searchable([pack.name, pack.description]).includes(deferredSearch)).map(getPackMeta).forEach((meta) => { counts.all += 1; counts[meta.filterKey] += 1; });
    baseProductCards.forEach((product) => { counts.all += 1; counts[product.ui.filterKey] += 1; });
    return counts;
  }, [baseProductCards, deferredSearch, workspace.packs]);

  const packCountLabel = formatCountLabel(packCards.length, "pack");
  const productCountLabel = formatCountLabel(productCards.length, "produit");
  const hasSearchOrFilter = Boolean(deferredSearch) || availabilityFilter !== "all";
  const activeCategorySummary = selectedCategoryRecord
    ? productCards.length
      ? `${productCountLabel} dans cette cat\u00e9gorie`
      : "Aucun produit dans cette cat\u00e9gorie"
    : "Aucune cat\u00e9gorie s\u00e9lectionn\u00e9e";
  const manualProducts = productCards.filter((product) => !product.ui.stockManaged);
  const isBusy = workspace.loading || workspace.mutating || isBatching;
  const selectedCategoryHref = selectedCategoryRecord && !selectedCategoryRecord.isUncategorized ? `/catalogue/produits/nouveau?category=${encodeURIComponent(selectedCategoryRecord.id)}` : "/catalogue/produits/nouveau";
  const resetMessages = () => { setError(""); setFeedback(""); };

  const runBatchMutation = async (callback, successMessage) => {
    resetMessages();
    setIsBatching(true);
    try {
      await callback();
      await workspace.reload();
      setFeedback(successMessage);
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsBatching(false);
    }
  };

  const handlePackToggle = async (pack, nextValue) => {
    resetMessages();
    try {
      await workspace.saveCatalogPack(buildPackPayload(pack, { is_active: nextValue }), pack.id);
      setFeedback(nextValue ? "Pack rendu disponible." : "Pack rendu indisponible.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleProductToggle = async (product, nextValue) => {
    if (product.ui.stockManaged) return;
    resetMessages();
    try {
      await workspace.saveItemProfile(product.id, buildProductPayload(product, { is_active: nextValue }));
      setFeedback(nextValue ? "Produit rendu disponible." : "Produit rendu indisponible.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleDuplicatePack = async (packId) => {
    resetMessages();
    try {
      await workspace.duplicateCatalogPack(packId);
      setFeedback("Pack duplique.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleDuplicateProduct = async (productId) => {
    resetMessages();
    try {
      await workspace.duplicateItem(productId);
      setFeedback("Produit duplique.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleGeneratePackLink = async (pack) => {
    if (!storefrontSlug) {
      setError("Le lien public de la boutique n'est pas encore configure.");
      setFeedback("");
      return;
    }
    const packUrl = `${buildStorefrontUrl(storefrontSlug, window.location.origin)}#pack-${pack.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(packUrl);
        setFeedback("Lien du pack copie.");
        setError("");
        return;
      }
      window.prompt("Copiez ce lien", packUrl);
      setFeedback("Lien du pack genere.");
      setError("");
    } catch (_error) {
      window.prompt("Copiez ce lien", packUrl);
      setFeedback("Lien du pack genere.");
      setError("");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    resetMessages();
    try {
      if (pendingDelete.type === "pack") {
        await workspace.deleteCatalogPack(pendingDelete.id);
        setFeedback("Pack supprime.");
      } else {
        await workspace.deleteItem(pendingDelete.id);
        setFeedback("Produit supprime.");
      }
      setPendingDelete(null);
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const globalActionItems = [
    { id: "packs-enable", label: "Activer les packs visibles", onClick: () => void runBatchMutation(() => Promise.all(packCards.map((pack) => apiRequest(`/catalog/packs/${pack.id}`, { method: "PUT", body: buildPackPayload(pack, { is_active: true }) }))), "Tous les packs visibles sont disponibles."), disabled: !packCards.length || isBusy },
    { id: "packs-disable", label: "Desactiver les packs visibles", onClick: () => void runBatchMutation(() => Promise.all(packCards.map((pack) => apiRequest(`/catalog/packs/${pack.id}`, { method: "PUT", body: buildPackPayload(pack, { is_active: false }) }))), "Tous les packs visibles sont indisponibles."), disabled: !packCards.length || isBusy },
    { id: "products-enable", label: "Activer les produits manuels visibles", onClick: () => void runBatchMutation(() => Promise.all(manualProducts.map((product) => apiRequest(`/catalog/item-profiles/${product.id}`, { method: "PUT", body: buildProductPayload(product, { is_active: true }) }))), "Les produits manuels visibles sont disponibles."), disabled: !manualProducts.length || isBusy },
    { id: "products-disable", label: "Desactiver les produits manuels visibles", onClick: () => void runBatchMutation(() => Promise.all(manualProducts.map((product) => apiRequest(`/catalog/item-profiles/${product.id}`, { method: "PUT", body: buildProductPayload(product, { is_active: false }) }))), "Les produits manuels visibles sont indisponibles."), disabled: !manualProducts.length || isBusy },
  ];

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header catalog-header">
          <div className="catalog-header-copy">
            <p className="eyebrow">Catalogue</p>
            <h3>{"G\u00e9rez vos produits, packs et disponibilit\u00e9s"}</h3>
            <p>{"Retrouvez rapidement les packs, les cat\u00e9gories actives et les produits visibles dans la vue en cours."}</p>
          </div>
          <div className="page-header-actions catalog-actions">
            <button type="button" className="button ghost" onClick={() => { setFeedback("Le bouton Scanner est conserve, mais le module n'est pas encore raccorde."); setError(""); }}>Scanner</button>
            <Link href="/catalogue/categories/nouveau" className="button ghost">{"Ajouter cat\u00e9gorie"}</Link>
            <Link href="/catalogue/packs/nouveau" className="button ghost">Ajouter pack</Link>
            <ActionMenu triggerClassName="button ghost quick-actions-trigger catalog-global-actions-trigger" triggerLabel={<><span>ACTIONS</span><Icon name="dots" size={16} /></>} triggerTitle="Actions globales" items={globalActionItems} />
          </div>
        </div>

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <Panel title={"Recherche et filtres"} description={"Recherche, filtres et rep\u00e8res rapides."} className="catalog-premium-toolbar-panel" actions={<div className="toolbar-group catalog-toolbar-metrics"><StatusPill tone="info">{packCountLabel}</StatusPill><StatusPill tone="info">{productCountLabel}</StatusPill></div>}>
          <div className="catalog-toolbar-shell">
            <SearchInput value={search} onChange={setSearch} placeholder={"Rechercher un pack, un produit, une r\u00e9f\u00e9rence"} className="catalog-premium-search" />
            <div className="catalog-filter-strip" role="tablist" aria-label={"Filtres de disponibilit\u00e9"}>
              {filters.map((filter) => <button key={filter.id} type="button" className={`catalog-filter-chip ${availabilityFilter === filter.id ? "active" : ""}`.trim()} onClick={() => setAvailabilityFilter(filter.id)} aria-pressed={availabilityFilter === filter.id}><span>{filter.label}</span><strong>{filterCounts[filter.id] || 0}</strong></button>)}
            </div>
            <div className="catalog-summary-strip">
              <article className="catalog-summary-card">
                <span>Packs visibles</span>
                <strong>{packCountLabel}</strong>
                <small>{packCards.length ? "Dans la vue actuelle." : "Aucun pack dans cette vue."}</small>
              </article>
              <article className="catalog-summary-card is-active">
                <span>{"Cat\u00e9gorie active"}</span>
                <strong>{selectedCategoryRecord?.label || "Aucune"}</strong>
                <small>{activeCategorySummary}</small>
              </article>
              <article className={`catalog-summary-card ${productCards.length ? "is-accent" : ""}`.trim()}>
                <span>{"Produits filtr\u00e9s"}</span>
                <strong>{productCountLabel}</strong>
                <small>{productCards.length ? "Visible dans la vue courante." : "Aucun produit pour ce filtre."}</small>
              </article>
            </div>
          </div>
        </Panel>

        <Panel title="Packs" description="Offres commerciales et actions rapides." className={`catalog-packs-panel ${!workspace.loading && !packCards.length ? "is-empty" : ""}`.trim()} actions={<StatusPill tone={packCards.length ? "success" : "neutral"}>{packCountLabel}</StatusPill>}>
          {workspace.loading ? (
            <div className="catalog-pack-grid">{Array.from({ length: 3 }).map((_, index) => <article key={`pack-skeleton-${index}`} className="catalog-premium-card catalog-skeleton-card"><div className="catalog-skeleton-block catalog-skeleton-media" /><div className="catalog-skeleton-stack"><div className="catalog-skeleton-row"><div className="catalog-skeleton-block catalog-skeleton-pill" /><div className="catalog-skeleton-block catalog-skeleton-mini" /></div><div className="catalog-skeleton-block catalog-skeleton-title" /><div className="catalog-skeleton-block catalog-skeleton-text" /><div className="catalog-skeleton-block catalog-skeleton-chip" /></div></article>)}</div>
          ) : packCards.length ? (
            <div className="catalog-pack-grid">
              {packCards.map((pack) => (
                <article key={pack.id} className={`catalog-premium-card catalog-pack-card-premium tone-${pack.ui.tone}`.trim()}>
                  <Link href={`/catalogue/packs/nouveau?pack=${pack.id}`} className="catalog-card-media-link">
                    <Media src={pack.ui.coverImage} label={pack.name} kind="pack" />
                    <div className="catalog-card-media-overlay"><Badge tone={pack.ui.tone} label={pack.ui.label} /></div>
                  </Link>
                  <div className="catalog-card-content">
                    <div className="catalog-card-head">
                      <div className="catalog-card-copy">
                        <Link href={`/catalogue/packs/nouveau?pack=${pack.id}`} className="catalog-card-title-link"><h4>{pack.name}</h4></Link>
                        <p>{pack.description || "Pack disponible a la vente ou a la location dans votre catalogue."}</p>
                      </div>
                      <div className="catalog-card-actions-cluster">
                        <div className="catalog-card-toggle-cluster"><span className="catalog-toggle-caption">Disponibilite</span><ToggleSwitch checked={Boolean(pack.is_active)} compact disabled={isBusy} label={pack.is_active ? "Disponible" : "Indisponible"} onChange={(nextValue) => void handlePackToggle(pack, nextValue)} /></div>
                        <div className="row-actions catalog-hover-actions">
                          <ActionMenu triggerClassName="action-button catalog-menu-trigger" triggerLabel={<Icon name="dots" size={16} />} triggerTitle={`Actions rapides pack ${pack.name}`} items={[{ id: `duplicate-pack-${pack.id}`, label: "Dupliquer", onClick: () => void handleDuplicatePack(pack.id), disabled: isBusy }, { id: `link-pack-${pack.id}`, label: "Generer un lien", onClick: () => void handleGeneratePackLink(pack) }]} />
                          <button type="button" className="action-button danger catalog-delete-button" onClick={() => setPendingDelete({ type: "pack", id: pack.id, name: pack.name })} disabled={isBusy} aria-label={`Supprimer le pack ${pack.name}`}><Icon name="trash" size={16} /></button>
                          <Link href={`/catalogue/packs/nouveau?pack=${pack.id}`} className="action-button">Voir</Link>
                        </div>
                      </div>
                    </div>
                    <div className="catalog-pack-meta-grid">
                      <div className="catalog-metric-chip"><span>Produits</span><strong>{pack.linkedProducts.length}</strong></div>
                      <div className="catalog-metric-chip"><span>Prix final</span><strong>{formatCurrency(pack.discountedPrice)}</strong></div>
                      <div className="catalog-metric-chip"><span>Prix de base</span><strong>{formatCurrency(pack.totalPrice)}</strong></div>
                    </div>
                    <div className="catalog-tag-strip">
                      {pack.linkedProducts.slice(0, 4).map((product) => <span key={`${pack.id}-${product.id || product.item_id}`} className="catalog-inline-tag">{product.public_name || product.name}</span>)}
                      {pack.linkedProducts.length > 4 ? <span className="catalog-inline-tag">+{pack.linkedProducts.length - 4}</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="catalog-empty-pack-state">
              <div className="catalog-empty-pack-state-copy">
                <strong>Aucun pack</strong>
                <span>{hasSearchOrFilter ? "Aucun pack ne correspond \u00e0 cette vue." : "Ajoutez un pack pour commencer."}</span>
              </div>
              <Link href="/catalogue/packs/nouveau" className="button ghost">{"Ajouter un pack"}</Link>
            </div>
          )}
        </Panel>

        <Panel title={"Cat\u00e9gories et produits"} description={"Acc\u00e8s rapide aux cat\u00e9gories et aux produits de la vue courante."} className={`catalog-products-panel ${productCards.length ? "has-products" : ""}`.trim()} actions={<div className="toolbar-group">{selectedCategoryRecord ? <StatusPill tone={productCards.length ? "success" : "neutral"}>{`${selectedCategoryRecord.label} - ${productCountLabel}`}</StatusPill> : null}<Link href={selectedCategoryHref} className="button primary">Ajouter produit</Link></div>}>
          <div className="catalog-category-tabs" role="tablist" aria-label={"Cat\u00e9gories du catalogue"}>
            {categoryRows.map((category) => <button key={category.id} type="button" className={`catalog-category-tab ${selectedCategory === category.id ? "active" : ""}`.trim()} onClick={() => setSelectedCategory(category.id)} aria-pressed={selectedCategory === category.id}><span>{category.label}</span><strong>{category.productCount}</strong></button>)}
          </div>
          {selectedCategoryRecord ? (
            <div className={`catalog-products-context ${productCards.length ? "has-products" : ""}`.trim()}>
              <div className="catalog-products-context-copy">
                <strong>{selectedCategoryRecord.label}</strong>
                <span>{activeCategorySummary}</span>
              </div>
              <StatusPill tone={productCards.length ? "success" : "neutral"}>
                {productCards.length ? "Visible maintenant" : "Vue vide"}
              </StatusPill>
            </div>
          ) : null}
          {workspace.loading ? (
            <div className="catalog-product-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={`product-skeleton-${index}`} className="catalog-product-row catalog-product-row-skeleton">
                  <div className="catalog-skeleton-block catalog-product-row-skeleton-media" />
                  <div className="catalog-product-row-main">
                    <div className="catalog-product-row-copy">
                      <div className="catalog-skeleton-row">
                        <div className="catalog-skeleton-block catalog-skeleton-pill" />
                        <div className="catalog-skeleton-block catalog-skeleton-mini" />
                      </div>
                      <div className="catalog-skeleton-block catalog-skeleton-title" />
                      <div className="catalog-skeleton-block catalog-skeleton-text" />
                    </div>
                    <div className="catalog-product-row-metrics">
                      <div className="catalog-skeleton-block catalog-product-row-skeleton-metric" />
                      <div className="catalog-skeleton-block catalog-product-row-skeleton-metric" />
                      <div className="catalog-skeleton-block catalog-product-row-skeleton-metric" />
                    </div>
                  </div>
                  <div className="catalog-product-row-side">
                    <div className="catalog-skeleton-block catalog-product-row-skeleton-pill" />
                    <div className="catalog-skeleton-block catalog-product-row-skeleton-actions" />
                  </div>
                </article>
              ))}
            </div>
          ) : productCards.length ? (
            <div className="catalog-product-list">
              {productCards.map((product) => (
                <article key={product.id} className={`catalog-product-row tone-${product.ui.tone}`.trim()}>
                  <Link href={`/catalogue/produits/nouveau?product=${product.id}&mode=edit`} className="catalog-product-row-media-link">
                    <Media src={product.thumbnail} label={product.public_name || product.name} kind="row" />
                  </Link>
                  <div className="catalog-product-row-main">
                    <div className="catalog-product-row-copy">
                      <div className="catalog-card-topline">
                        <Badge tone={product.ui.tone} label={product.ui.label} />
                        <span className="catalog-inline-tag subtle">{product.category || "Sans categorie"}</span>
                      </div>
                      <Link href={`/catalogue/produits/nouveau?product=${product.id}&mode=edit`} className="catalog-card-title-link"><h4>{product.public_name || product.name}</h4></Link>
                      <p>{product.public_description || "Fiche produit sans description courte pour le moment."}</p>
                    </div>
                    <div className="catalog-product-row-metrics">
                      <div className="catalog-product-row-metric"><span>{"R\u00e9f\u00e9rence"}</span><strong>{product.sku || "\u00c0 d\u00e9finir"}</strong></div>
                      <div className="catalog-product-row-metric"><span>Prix</span><strong>{formatCurrency(product.price || 0)}</strong></div>
                      <div className="catalog-product-row-metric"><span>Stock</span><strong>{product.ui.stockManaged ? product.ui.stockLabel : "Manuel"}</strong></div>
                    </div>
                  </div>
                  <div className="catalog-product-row-side">
                    <div className="catalog-product-row-availability">
                      {product.ui.stockManaged ? (
                        <>
                          <Badge tone={product.ui.tone} label={product.ui.label} />
                          <p className={`catalog-stock-caption tone-${product.ui.tone}`.trim()}>{product.ui.hint}</p>
                        </>
                      ) : (
                        <>
                          <Badge tone={product.ui.tone} label={product.ui.label} />
                          <ToggleSwitch checked={Boolean(product.isActive)} compact disabled={isBusy} label={product.isActive ? "Disponible" : "Indisponible"} onChange={(nextValue) => void handleProductToggle(product, nextValue)} />
                        </>
                      )}
                    </div>
                    <div className="row-actions catalog-product-row-actions">
                        <ActionMenu triggerClassName="action-button catalog-menu-trigger" triggerLabel={<Icon name="dots" size={16} />} triggerTitle={`Actions rapides produit ${product.public_name || product.name}`} items={[{ id: `edit-product-${product.id}`, label: "Modifier", href: `/catalogue/produits/nouveau?product=${product.id}&mode=edit` }, { id: `duplicate-product-${product.id}`, label: "Dupliquer", onClick: () => void handleDuplicateProduct(product.id), disabled: isBusy }]} />
                        <button type="button" className="action-button danger catalog-delete-button" onClick={() => setPendingDelete({ type: "product", id: product.id, name: product.public_name || product.name })} disabled={isBusy} aria-label={`Supprimer le produit ${product.public_name || product.name}`}><Icon name="trash" size={16} /></button>
                        <Link href={`/catalogue/produits/nouveau?product=${product.id}&mode=view`} className="action-button">Voir</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state catalog-empty-state-premium"><strong>Aucun produit dans cette vue</strong><span>{"Changez de cat\u00e9gorie, ajustez vos filtres ou ajoutez un produit."}</span></div>}
        </Panel>
      </div>

      <ModalShell open={Boolean(pendingDelete)} title={pendingDelete?.type === "pack" ? "Supprimer ce pack" : "Supprimer ce produit"} description={pendingDelete ? `Confirmez la suppression de "${pendingDelete.name}".` : ""} onClose={() => setPendingDelete(null)} footer={<><div><h4>Confirmation</h4><p>La logique ne change pas, seule la confirmation est plus propre.</p></div><div className="row-actions"><button type="button" className="button ghost" onClick={() => setPendingDelete(null)}>Annuler</button><button type="button" className="action-button danger" onClick={() => void confirmDelete()}>Supprimer</button></div></>}>
        <div className="catalog-delete-modal-copy">
          <div className="catalog-delete-modal-icon"><Icon name="trash" size={18} /></div>
          <div className="stack"><strong>{pendingDelete?.name}</strong><span className="muted-text">Vous pouvez encore revenir en arriere avant validation.</span></div>
        </div>
      </ModalShell>
    </AppShell>
  );
}
