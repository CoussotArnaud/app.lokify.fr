"use client";

import { formatCurrency } from "../../lib/date";
import Icon from "../icon";
import StatusPill from "../status-pill";
import StorefrontEmptyState from "./empty-state";

const CatalogLoadingSkeleton = ({ count = 6 }) => (
  <div className="public-shop-v6-product-grid">
    {Array.from({ length: count }).map((_, index) => (
      <article
        key={`catalog-skeleton-${index}`}
        className="public-shop-v6-product-card storefront-skeleton-card"
        aria-hidden="true"
      >
        <div className="storefront-skeleton storefront-skeleton-media" />
        <div className="public-shop-v6-product-copy">
          <div className="storefront-skeleton storefront-skeleton-line storefront-skeleton-line-lg" />
          <div className="storefront-skeleton storefront-skeleton-line" />
          <div className="storefront-skeleton storefront-skeleton-line storefront-skeleton-line-sm" />
          <div className="storefront-skeleton storefront-skeleton-row">
            <div className="storefront-skeleton storefront-skeleton-pill" />
            <div className="storefront-skeleton storefront-skeleton-pill" />
          </div>
        </div>
      </article>
    ))}
  </div>
);

const CatalogMetricCard = ({ icon, label, value, helper }) => (
  <article className="public-shop-v6-metric-card">
    <div className="public-shop-v6-metric-icon" aria-hidden="true">
      <Icon name={icon} size={16} />
    </div>
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{helper}</p>
  </article>
);

const buildCatalogMetrics = ({
  visibleProductCount,
  visiblePackCount,
  compactPeriodLabel,
  durationDays,
  resolvedCartEntries,
  totalRequestedQuantity,
  isLoading,
}) => {
  if (isLoading && visibleProductCount + visiblePackCount === 0) {
    return [
      {
        icon: "catalog",
        label: "Selection",
        value: "En preparation",
        helper: "Le catalogue se charge pour vos dates.",
      },
      {
        icon: "calendar",
        label: "Periode",
        value: compactPeriodLabel,
        helper: `${durationDays} jour(s) pris en compte pour cette recherche`,
      },
      {
        icon: "shop",
        label: "Panier",
        value: "Pret a composer",
        helper: "Ajoutez les produits qui vous conviennent des qu'ils apparaissent.",
      },
    ];
  }

  return [
    {
      icon: "catalog",
      label: "Selection",
      value: `${visibleProductCount + visiblePackCount} offres`,
      helper: `${visibleProductCount} produits et ${visiblePackCount} packs disponibles`,
    },
    {
      icon: "calendar",
      label: "Periode",
      value: compactPeriodLabel,
      helper: `${durationDays} jour(s) calcules pour cette location`,
    },
    {
      icon: "shop",
      label: "Panier",
      value: `${resolvedCartEntries.length} ligne(s)`,
      helper: `${totalRequestedQuantity} element(s) selectionnes`,
    },
  ];
};

const CategoryFilterBar = ({ categories, activeCategoryFilter, revealCatalog }) => (
  <div className="public-shop-v6-filter-row" aria-label="Filtres categorie">
    <button
      type="button"
      className={`button ${activeCategoryFilter === "all" ? "primary" : "ghost"}`}
      onClick={() => revealCatalog("all")}
    >
      Tout voir
    </button>
    {categories.map((category) => (
      <button
        key={category.slug}
        type="button"
        className={`button ${activeCategoryFilter === category.slug ? "primary" : "ghost"}`}
        onClick={() => revealCatalog(category.slug)}
      >
        {category.name}
      </button>
    ))}
  </div>
);

const ProductCard = ({
  product,
  availabilityMeta,
  availabilityMessageByReason,
  openProductPreview,
  addProductToCart,
}) => {
  const meta = availabilityMeta[product.status] || availabilityMeta.available;
  const hasOptions = Array.isArray(product.options) && product.options.length > 0;
  const availabilityLabel =
    availabilityMessageByReason[product.availability_reason] || "Produit indisponible";

  return (
    <article className="public-shop-v6-product-card">
      <div className="public-shop-v6-product-visual">
        {product.thumbnail ? (
          <button
            type="button"
            className="public-shop-product-media-button"
            onClick={() => openProductPreview(product)}
            aria-label={`Voir la fiche produit ${product.public_name}`}
          >
            <img src={product.thumbnail} alt={product.public_name} className="public-shop-v6-product-media" />
          </button>
        ) : (
          <div className="public-shop-v6-product-placeholder" aria-hidden="true">
            <span>{product.public_name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}

        <div className="public-shop-v6-product-visual-top">
          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
        </div>
      </div>

      <div className="public-shop-v6-product-copy">
        <div className="public-shop-v6-product-head">
          <div>
            <strong>{product.public_name}</strong>
            <p>{product.public_description}</p>
          </div>
        </div>

        <div className="public-shop-v6-product-pricing">
          <div className="public-shop-v6-product-price">
            <strong>{formatCurrency(product.price)}</strong>
            <span>A partir de / jour</span>
          </div>

          <div className="public-shop-v6-product-secondary">
            <span>Caution</span>
            <strong>{formatCurrency(product.deposit)}</strong>
          </div>
        </div>

        <div className="planning-inline-list public-shop-v6-product-tags">
          {product.category ? <span className="planning-mini-badge">{product.category}</span> : null}
          {product.sku ? <span className="planning-mini-badge">{product.sku}</span> : null}
          {hasOptions ? (
            <span className="planning-mini-badge">{product.options.length} option(s)</span>
          ) : null}
        </div>

        <div className="public-shop-v6-product-foot">
          <div className="public-shop-v6-availability-copy">
            <strong>{availabilityLabel}</strong>
            <span>{product.available_quantity} unite(s) disponibles</span>
          </div>

          <div className="row-actions public-shop-v6-product-actions">
            <button type="button" className="button ghost" onClick={() => openProductPreview(product)}>
              Voir
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => addProductToCart(product)}
              disabled={product.available_quantity <= 0}
            >
              {hasOptions ? "Configurer" : "Ajouter"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

const PackCard = ({
  pack,
  availabilityMeta,
  availabilityMessageByReason,
  addPackToCart,
}) => {
  const meta = availabilityMeta[pack.status] || availabilityMeta.available;
  const availabilityLabel =
    availabilityMessageByReason[pack.availability_reason] || "Pack indisponible";
  const hasDiscount = Number(pack.base_price || 0) > Number(pack.price || 0);

  return (
    <article className="public-shop-v6-pack-card" id={`pack-${pack.id}`}>
      <div className="public-shop-v6-pack-head">
        <div>
          <span className="public-shop-v6-card-type">Pack</span>
          <strong>{pack.name}</strong>
          <p>{pack.description || "Selection precomposee prete a etre ajoutee au panier."}</p>
        </div>
        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
      </div>

      <div className="public-shop-v6-product-pricing">
        <div className="public-shop-v6-product-price">
          <strong>{formatCurrency(pack.price)}</strong>
          <span>Tarif pack / jour</span>
        </div>

        <div className="public-shop-v6-product-secondary">
          <span>Caution</span>
          <strong>{formatCurrency(pack.deposit)}</strong>
        </div>
      </div>

      <div className="planning-inline-list public-shop-v6-product-tags">
        <span className="planning-mini-badge">{pack.product_count} produit(s)</span>
        {hasDiscount ? (
          <span className="planning-mini-badge">Au lieu de {formatCurrency(pack.base_price)}</span>
        ) : null}
      </div>

      <div className="public-shop-v6-pack-products">
        {pack.products.map((product) => (
          <span key={`${pack.id}-${product.item_id}`} className="planning-mini-badge">
            {product.public_name}
          </span>
        ))}
      </div>

      <div className="public-shop-v6-product-foot">
        <div className="public-shop-v6-availability-copy">
          <strong>{availabilityLabel}</strong>
          <span>{pack.available_quantity} pack(s) disponibles</span>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => addPackToCart(pack)}
          disabled={pack.available_quantity <= 0}
        >
          Ajouter le pack
        </button>
      </div>
    </article>
  );
};

export default function StorefrontCatalogStage({
  shouldShowCatalog,
  storefrontName,
  providerLocation,
  visibleProductCount,
  visiblePackCount,
  compactPeriodLabel,
  durationDays,
  totalRequestedQuantity,
  visibleProducts,
  showLoadMoreProducts,
  setVisibleProductLimit,
  initialVisibleProductCount,
  products,
  packs,
  categories,
  activeCategoryFilter,
  revealCatalog,
  shopState,
  availabilityMeta,
  availabilityMessageByReason,
  openProductPreview,
  addProductToCart,
  addPackToCart,
  bookingForm,
  onBookingFieldChange,
  paymentSummary,
  totalEstimatedAmount,
  totalEstimatedDeposit,
  cartStatusTone,
  cartStatusLabel,
  cartEntries,
  resolvedCartEntries,
  cartHasEntries,
  uniqueAvailabilityIssues,
  submitError,
  openCheckoutModal,
  checkoutActionLabel,
  isFinalizingCheckout,
  removeCartEntry,
  updateCartEntryQuantity,
  productById,
  openProductConfigurator,
}) {
  const catalogMetrics = buildCatalogMetrics({
    visibleProductCount,
    visiblePackCount,
    compactPeriodLabel,
    durationDays,
    resolvedCartEntries,
    totalRequestedQuantity,
    isLoading: shopState.loading,
  });

  return (
    <section
      id="storefront-catalogue"
      className={`public-shop-stage public-shop-v6-stage ${
        shouldShowCatalog ? "" : "public-shop-v5-catalogue-hidden"
      }`.trim()}
      aria-hidden={!shouldShowCatalog}
    >
      <main className="public-shop-main-column public-shop-v6-main-column">
        <div className="public-shop-v6-catalogue-intro">
          <div>
            <p className="eyebrow">La selection</p>
            <h2>Composez votre location en toute confiance</h2>
            <p>
              Comparez les produits, verifiez les disponibilites et composez votre panier dans une
              seule experience plus lisible.
            </p>
          </div>
          <div className="public-shop-v6-catalogue-caption">
            <span>{storefrontName}</span>
            <strong>{providerLocation}</strong>
          </div>
        </div>

        <div className="public-shop-v6-metric-grid">
          {catalogMetrics.map((metric) => (
            <CatalogMetricCard
              key={metric.label}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
            />
          ))}
        </div>

        {categories.length ? (
          <CategoryFilterBar
            categories={categories}
            activeCategoryFilter={activeCategoryFilter}
            revealCatalog={revealCatalog}
          />
        ) : null}

        {shopState.loading && products.length ? (
          <div className="public-shop-v6-inline-loading" role="status" aria-live="polite">
            <Icon name="clock" size={16} />
            <span>Nous verifions les disponibilites pour vos dates.</span>
          </div>
        ) : null}

        <section id="shop-products" className="public-shop-catalogue-section public-shop-section-block public-shop-v6-section">
          <div className="public-shop-section-head public-shop-v6-section-head">
            <div>
              <p className="eyebrow">Produits</p>
              <h2>La selection disponible</h2>
              <p>
                Des cartes plus lisibles pour comparer, verifier l'etat de disponibilite et ajouter
                les bons produits au panier.
              </p>
            </div>
          </div>

          {shopState.loading && !products.length ? (
            <CatalogLoadingSkeleton />
          ) : products.length ? (
            <>
              <div className="public-shop-v6-product-grid">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    availabilityMeta={availabilityMeta}
                    availabilityMessageByReason={availabilityMessageByReason}
                    openProductPreview={openProductPreview}
                    addProductToCart={addProductToCart}
                  />
                ))}
              </div>

              {showLoadMoreProducts ? (
                <button
                  type="button"
                  className="button ghost public-shop-v6-load-more"
                  onClick={() =>
                    setVisibleProductLimit((currentLimit) => currentLimit + initialVisibleProductCount)
                  }
                >
                  Voir plus de produits
                </button>
              ) : null}
            </>
          ) : (
            <StorefrontEmptyState
              icon="catalog"
              title="La vitrine publique est en cours de preparation"
              description="Aucun produit n'est visible pour l'instant. Lorsqu'une selection sera publiee, elle apparaitra ici dans une grille claire et testable."
            />
          )}
        </section>

        {packs.length ? (
          <section id="shop-packs" className="public-shop-catalogue-section public-shop-section-block public-shop-v6-section">
            <div className="public-shop-section-head public-shop-v6-section-head">
              <div>
                <p className="eyebrow">Packs</p>
                <h2>Des selections deja composees</h2>
                <p>Une facon rapide de reserver plusieurs produits coherents en une seule action.</p>
              </div>
            </div>

            <div className="public-shop-v6-pack-grid">
              {packs.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  availabilityMeta={availabilityMeta}
                  availabilityMessageByReason={availabilityMessageByReason}
                  addPackToCart={addPackToCart}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <aside className="public-shop-sidebar public-shop-v6-sidebar">
        <div className="public-shop-sidebar-sticky public-shop-v6-sidebar-sticky">
          <section className="public-shop-sidebar-card public-shop-v6-sidebar-card public-shop-v6-booking-card">
            <div className="public-shop-v6-card-head">
              <div>
                <p className="eyebrow">Vos dates</p>
                <h3>Verifiez la bonne periode</h3>
                <p>Les disponibilites et le panier se recalculent selon vos dates de location.</p>
              </div>
            </div>

            <div className="public-shop-v6-sidebar-fields">
              <div className="field">
                <label htmlFor="public-storefront-start-date">Date de debut</label>
                <input
                  id="public-storefront-start-date"
                  type="date"
                  value={bookingForm.start_date}
                  onChange={(event) => onBookingFieldChange("start_date", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="public-storefront-start-time">Heure</label>
                <input
                  id="public-storefront-start-time"
                  type="time"
                  value={bookingForm.start_time}
                  onChange={(event) => onBookingFieldChange("start_time", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="public-storefront-end-date">Date de fin</label>
                <input
                  id="public-storefront-end-date"
                  type="date"
                  value={bookingForm.end_date}
                  onChange={(event) => onBookingFieldChange("end_date", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="public-storefront-end-time">Heure</label>
                <input
                  id="public-storefront-end-time"
                  type="time"
                  value={bookingForm.end_time}
                  onChange={(event) => onBookingFieldChange("end_time", event.target.value)}
                />
              </div>
            </div>

            <div className="public-shop-v6-summary-list">
              <div className="public-shop-v6-summary-row">
                <span>Periode</span>
                <strong>{compactPeriodLabel}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Duree</span>
                <strong>{durationDays} jour(s)</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Disponibilites</span>
                <strong>{shopState.loading ? "Analyse..." : "Actualisees"}</strong>
              </div>
            </div>
          </section>

          <section className="public-shop-sidebar-card public-shop-v6-sidebar-card">
            <div className="public-shop-v6-card-head">
              <div>
                <p className="eyebrow">Validation</p>
                <h3>{paymentSummary.enabled ? "Paiement en ligne" : "Demande de reservation"}</h3>
                <p>
                  {paymentSummary.enabled
                    ? "Le montant de location est regle en ligne dans un parcours clair."
                    : "Votre panier est prepare puis transmis au prestataire pour confirmation rapide."}
                </p>
              </div>
              <StatusPill tone={paymentSummary.enabled ? "success" : "neutral"}>
                {paymentSummary.label}
              </StatusPill>
            </div>

            <div className="public-shop-v6-summary-list">
              <div className="public-shop-v6-summary-row">
                <span>Montant location</span>
                <strong>{formatCurrency(totalEstimatedAmount)}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Caution</span>
                <strong>{formatCurrency(totalEstimatedDeposit)}</strong>
              </div>
            </div>
          </section>

          <section id="shop-cart" className="public-shop-sidebar-card public-shop-v6-sidebar-card public-shop-v6-cart-card">
            <div className="public-shop-v6-card-head">
              <div>
                <p className="eyebrow">Panier</p>
                <h3>Votre recapitulatif</h3>
                <p>Quantites, options, estimations et verification restent visibles en permanence.</p>
              </div>
              <StatusPill tone={cartStatusTone}>{cartStatusLabel}</StatusPill>
            </div>

            <div className="public-shop-v6-summary-list public-shop-v6-summary-list-grid">
              <div className="public-shop-v6-summary-row">
                <span>Produits</span>
                <strong>{cartEntries.filter((entry) => entry.entry_type === "product").length}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Packs</span>
                <strong>{cartEntries.filter((entry) => entry.entry_type === "pack").length}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Quantites</span>
                <strong>{totalRequestedQuantity}</strong>
              </div>
            </div>

            {cartHasEntries ? (
              <div className="public-shop-v6-cart-list">
                {resolvedCartEntries.map((entry) => {
                  const editableProduct = entry.entry_type === "product" ? productById.get(entry.item_id) : null;
                  const hasEditableOptions =
                    editableProduct &&
                    Array.isArray(editableProduct.options) &&
                    editableProduct.options.length > 0;

                  return (
                    <article key={entry.id} className="public-shop-v6-cart-item">
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
                        <div className="public-shop-v6-pack-products">
                          {entry.included_products.map((product) => (
                            <span key={`${entry.id}-${product.item_id}`} className="planning-mini-badge">
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
              <StorefrontEmptyState
                compact
                icon="shop"
                title="Votre panier est encore vide"
                description="Ajoutez des produits ou des packs pour voir ici votre recapitulatif, les montants estimes et l'etat de disponibilite."
              />
            )}

            <div className="public-shop-v6-summary-list">
              <div className="public-shop-v6-summary-row">
                <span>Montant estime</span>
                <strong>{formatCurrency(totalEstimatedAmount)}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
                <span>Caution estimee</span>
                <strong>{formatCurrency(totalEstimatedDeposit)}</strong>
              </div>
              <div className="public-shop-v6-summary-row">
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

            {submitError ? <p className="feedback error public-shop-inline-feedback">{submitError}</p> : null}

            <button
              type="button"
              className="button primary public-shop-v6-sidebar-cta"
              onClick={openCheckoutModal}
              disabled={shopState.loading || !cartHasEntries || isFinalizingCheckout}
            >
              {shopState.loading ? "Analyse en cours..." : checkoutActionLabel}
            </button>
          </section>

          <section className="public-shop-v6-sidebar-callout">
            <strong>Besoin d'un ajustement specifique ?</strong>
            <span>
              Vous pourrez laisser un message au moment de finaliser votre demande ou votre
              reservation pour preciser le contexte, la logistique ou les contraintes horaires.
            </span>
          </section>
        </div>
      </aside>
    </section>
  );
}
