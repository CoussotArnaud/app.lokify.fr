"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "../../components/brand-logo";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";
import { formatCurrency } from "../../lib/date";
import { buildStorefrontPath } from "../../lib/storefront";

const buildDateValue = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const initialPreviewState = {
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

const buildDateTimeIso = (dateValue, timeValue) => {
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const getDurationInDays = (startDateValue, endDateValue) => {
  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 1;
  }

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

const formatAvailabilityLabel = (product) => {
  if (product.available_quantity <= 0) {
    return "Plus de disponibilite sur cette plage";
  }

  return `${product.available_quantity} unite(s) dispo sur la plage`;
};

export default function StorefrontPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const [previewState, setPreviewState] = useState(initialPreviewState);
  const [storefrontSettings, setStorefrontSettings] = useState(null);
  const [storefrontSettingsError, setStorefrontSettingsError] = useState("");
  const [cart, setCart] = useState({});
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [bookingForm, setBookingForm] = useState({
    start_date: buildDateValue(1),
    start_time: "09:00",
    end_date: buildDateValue(2),
    end_time: "18:00",
    fulfillment_mode: "pickup",
  });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!ready || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    const loadSettings = async () => {
      try {
        const response = await apiRequest("/storefront/settings");

        if (cancelled) {
          return;
        }

        setStorefrontSettings(response.storefrontSettings);
        setStorefrontSettingsError("");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStorefrontSettingsError(
          error.message || "Impossible de charger le lien public de votre boutique."
        );
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated]);

  useEffect(() => {
    if (!ready || !isAuthenticated) {
      return;
    }

    const startIso = buildDateTimeIso(bookingForm.start_date, bookingForm.start_time);
    const endIso = buildDateTimeIso(bookingForm.end_date, bookingForm.end_time);

    if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
      setPreviewState({
        loading: false,
        error: "La plage choisie est invalide.",
        data: null,
      });
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setPreviewState((current) => ({
        ...current,
        loading: true,
        error: "",
      }));

      try {
        const preview = await apiRequest(
          `/storefront?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
        );

        if (cancelled) {
          return;
        }

        setPreviewState({
          loading: false,
          error: "",
          data: preview,
        });

        setCart((currentCart) => {
          const nextCart = {};

          (preview.products || []).forEach((product) => {
            const nextQuantity = Math.min(
              Number(currentCart[product.id] || 0),
              Number(product.available_quantity || 0)
            );

            if (nextQuantity > 0) {
              nextCart[product.id] = nextQuantity;
            }
          });

          return nextCart;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPreviewState({
          loading: false,
          error: error.message || "Impossible de charger la boutique.",
          data: null,
        });
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated, bookingForm, reloadVersion]);

  const durationDays = getDurationInDays(
    buildDateTimeIso(bookingForm.start_date, bookingForm.start_time),
    buildDateTimeIso(bookingForm.end_date, bookingForm.end_time)
  );
  const previewData = previewState.data;
  const visibleProducts = (previewData?.products || []).filter((product) => {
    if (categoryFilter !== "all" && product.category !== categoryFilter) {
      return false;
    }

    if (!deferredSearch) {
      return true;
    }

    const haystack = [product.public_name, product.public_description, product.category, product.sku]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredSearch);
  });
  const cartLines = (previewData?.products || [])
    .filter((product) => Number(cart[product.id] || 0) > 0)
    .map((product) => ({
      ...product,
      quantity: Number(cart[product.id]),
      location_total: Number(product.price || 0) * Number(cart[product.id]) * durationDays,
      deposit_total: Number(product.deposit || 0) * Number(cart[product.id]),
    }));
  const locationTotal = cartLines.reduce((sum, line) => sum + line.location_total, 0);
  const depositTotal = cartLines.reduce((sum, line) => sum + line.deposit_total, 0);
  const publicStorefrontPath = storefrontSettings?.slug
    ? buildStorefrontPath(storefrontSettings.slug)
    : "";

  const updateCartQuantity = (productId, nextQuantity, maxQuantity) => {
    setCart((current) => {
      const boundedQuantity = Math.max(0, Math.min(Number(nextQuantity || 0), Number(maxQuantity || 0)));

      if (!boundedQuantity) {
        const { [productId]: _ignored, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [productId]: boundedQuantity,
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setFeedback("");

    if (!cartLines.length) {
      setSubmitError("Ajoutez au moins un produit au panier.");
      return;
    }

    setIsSubmitting(true);

    try {
      const startIso = buildDateTimeIso(bookingForm.start_date, bookingForm.start_time);
      const endIso = buildDateTimeIso(bookingForm.end_date, bookingForm.end_time);
      const response = await apiRequest("/storefront/requests", {
        method: "POST",
        body: {
          customer: customerForm,
          start_date: startIso,
          end_date: endIso,
          fulfillment_mode: bookingForm.fulfillment_mode,
          notes: customerForm.notes,
          lines: cartLines.map((line) => ({
            item_id: line.id,
            quantity: line.quantity,
          })),
        },
      });

      setFeedback(
        `Reservation ${response.reservation.reference} creee depuis la boutique en ligne.`
      );
      setCart({});
      setCustomerForm((current) => ({
        ...current,
        notes: "",
      }));
      setReloadVersion((current) => current + 1);
    } catch (error) {
      setSubmitError(error.message || "Impossible de creer la reservation web.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready || !isAuthenticated) {
    return (
      <div className="page-loader">
        <div className="page-loader-shell">
          <BrandLogo className="brand-logo-loader" />
          <p className="page-loader-copy">Chargement de la boutique LOKIFY...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-page">
      <div className="storefront-shell storefront-v2-shell">
        <header className="storefront-header">
          <BrandLogo className="brand-logo-header" />
          <div className="page-header-actions">
            <StatusPill tone={storefrontSettings?.is_published ? "success" : "neutral"}>
              {storefrontSettings?.is_published ? "Boutique publiee" : "Boutique non publiee"}
            </StatusPill>
            {publicStorefrontPath ? (
              <Link href={publicStorefrontPath} className="button secondary" target="_blank">
                Voir ma boutique en ligne
              </Link>
            ) : null}
            <Link href="/dashboard" className="button ghost">
              Retour espace
            </Link>
          </div>
        </header>

        <section className="storefront-hero storefront-v2-hero">
          <div className="page-heading">
            <p className="eyebrow">Boutique en ligne</p>
            <h1>Un parcours de reservation en ligne simple, multi-produits et base sur les disponibilites reelles.</h1>
            <p>
              La location et la caution sont lues separement, les produits visibles respectent le
              catalogue actif et les demandes en ligne alimentent directement les reservations.
            </p>
            {storefrontSettings?.slug ? (
              <p className="muted-text">
                Lien public: <strong>{publicStorefrontPath}</strong>
              </p>
            ) : null}
            {storefrontSettingsError ? (
              <p className="feedback error">{storefrontSettingsError}</p>
            ) : null}
          </div>

          <div className="storefront-toolbar-card">
            <div className="storefront-period-grid">
              <div className="field">
                <label htmlFor="storefront-start-date">Debut</label>
                <input
                  id="storefront-start-date"
                  type="date"
                  value={bookingForm.start_date}
                  onChange={(event) =>
                    setBookingForm((current) => ({ ...current, start_date: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="storefront-start-time">Heure debut</label>
                <input
                  id="storefront-start-time"
                  type="time"
                  value={bookingForm.start_time}
                  onChange={(event) =>
                    setBookingForm((current) => ({ ...current, start_time: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="storefront-end-date">Fin</label>
                <input
                  id="storefront-end-date"
                  type="date"
                  value={bookingForm.end_date}
                  onChange={(event) =>
                    setBookingForm((current) => ({ ...current, end_date: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="storefront-end-time">Heure fin</label>
                <input
                  id="storefront-end-time"
                  type="time"
                  value={bookingForm.end_time}
                  onChange={(event) =>
                    setBookingForm((current) => ({ ...current, end_time: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="storefront-fulfillment">Mode logistique</label>
              <select
                id="storefront-fulfillment"
                value={bookingForm.fulfillment_mode}
                onChange={(event) =>
                  setBookingForm((current) => ({
                    ...current,
                    fulfillment_mode: event.target.value,
                  }))
                }
              >
                <option value="pickup">Retrait</option>
                <option value="delivery">Livraison</option>
                <option value="onsite">Sur site</option>
              </select>
            </div>
          </div>
        </section>

        <section className="kpi-band storefront-kpi-band">
          <article className="kpi-tile">
            <strong>{previewData?.summary?.visible_products || 0}</strong>
            <span>produit(s) visibles en boutique</span>
          </article>
          <article className="kpi-tile">
            <strong>{previewData?.summary?.selectable_products || 0}</strong>
            <span>produit(s) reservables sur la plage</span>
          </article>
          <article className="kpi-tile">
            <strong>{cartLines.length}</strong>
            <span>ligne(s) dans le panier</span>
          </article>
          <article className="kpi-tile">
            <strong>{formatCurrency(depositTotal)}</strong>
            <span>caution totale affichee separement</span>
          </article>
        </section>

        <section className="storefront-v2-grid">
          <Panel
            className="storefront-products-panel"
            title="Catalogue visible"
            description="Seulement les produits actifs, visibles en boutique et disponibles sur la plage choisie."
            actions={
              <div className="storefront-panel-actions">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">Toutes les categories</option>
                  {(previewData?.categories || []).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Recherche produit ou categorie"
                  className="storefront-search"
                />
              </div>
            }
          >
            {previewState.error ? <p className="feedback error">{previewState.error}</p> : null}
            {previewState.loading ? (
              <div className="empty-state">
                <strong>Chargement du catalogue</strong>
                <span>Les disponibilites reelles se recalculent sur la plage choisie.</span>
              </div>
            ) : null}

            {!previewState.loading ? (
              <div className="storefront-product-grid">
                {visibleProducts.length ? (
                  visibleProducts.map((product) => {
                    const meta = availabilityMeta[product.status] || availabilityMeta.available;
                    const quantity = Number(cart[product.id] || 0);

                    return (
                      <article key={product.id} className="storefront-product-card">
                        <div className="storefront-product-card-head">
                          <div>
                            <strong>{product.public_name}</strong>
                            <p>{product.public_description}</p>
                          </div>
                          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                        </div>

                        <div className="planning-inline-list">
                          <span className="planning-mini-badge">{product.category}</span>
                          <span className="planning-mini-badge">{product.sku}</span>
                          {product.needs_unit_sync ? (
                            <span className="planning-mini-badge warning">Unites a aligner</span>
                          ) : null}
                        </div>

                        <div className="storefront-product-card-metrics">
                          <div className="detail-card">
                            <strong>{formatCurrency(product.price)}</strong>
                            <span className="muted-text">prix / jour</span>
                          </div>
                          <div className="detail-card">
                            <strong>{formatCurrency(product.deposit)}</strong>
                            <span className="muted-text">caution / unite</span>
                          </div>
                          <div className="detail-card">
                            <strong>{product.available_quantity}</strong>
                            <span className="muted-text">dispo sur la plage</span>
                          </div>
                        </div>

                        <div className="storefront-product-card-foot">
                          <span className="muted-text">{formatAvailabilityLabel(product)}</span>
                          <div className="storefront-stepper">
                            <button
                              type="button"
                              className="button subtle"
                              onClick={() =>
                                updateCartQuantity(
                                  product.id,
                                  quantity - 1,
                                  product.available_quantity
                                )
                              }
                              disabled={!quantity}
                            >
                              -
                            </button>
                            <span>{quantity}</span>
                            <button
                              type="button"
                              className="button subtle"
                              onClick={() =>
                                updateCartQuantity(
                                  product.id,
                                  quantity + 1,
                                  product.available_quantity
                                )
                              }
                              disabled={quantity >= product.available_quantity}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <strong>Aucun produit visible</strong>
                    <span>
                      Activez la visibilite boutique dans les fiches produit ou desserrez les filtres.
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </Panel>

          <Panel
            className="storefront-cart-panel"
            title="Panier & demande en ligne"
            description="La caution reste separee du montant de location. La demande cree directement une reservation."
          >
            <form className="storefront-cart-form" onSubmit={handleSubmit}>
              <div className="storefront-cart-lines">
                {cartLines.length ? (
                  cartLines.map((line) => (
                    <article key={line.id} className="storefront-cart-line">
                      <div>
                        <strong>{line.public_name}</strong>
                        <small>
                          {line.quantity} x {formatCurrency(line.price)} / jour
                        </small>
                      </div>
                      <div className="storefront-cart-line-totals">
                        <strong>{formatCurrency(line.location_total)}</strong>
                        <small>Caution {formatCurrency(line.deposit_total)}</small>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>Panier vide</strong>
                    <span>Ajoutez un ou plusieurs produits depuis le catalogue visible.</span>
                  </div>
                )}
              </div>

              <div className="storefront-summary-grid">
                <div className="detail-card">
                  <strong>{durationDays} jour(s)</strong>
                  <span className="muted-text">duree facturee</span>
                </div>
                <div className="detail-card">
                  <strong>{formatCurrency(locationTotal)}</strong>
                  <span className="muted-text">montant location</span>
                </div>
                <div className="detail-card">
                  <strong>{formatCurrency(depositTotal)}</strong>
                  <span className="muted-text">caution totale</span>
                </div>
              </div>

              <div className="storefront-customer-grid">
                <div className="field">
                  <label htmlFor="storefront-first-name">Prenom</label>
                  <input
                    id="storefront-first-name"
                    value={customerForm.first_name}
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        first_name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="storefront-last-name">Nom</label>
                  <input
                    id="storefront-last-name"
                    value={customerForm.last_name}
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        last_name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="storefront-email">Email</label>
                  <input
                    id="storefront-email"
                    type="email"
                    value={customerForm.email}
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="storefront-phone">Telephone</label>
                  <input
                    id="storefront-phone"
                    value={customerForm.phone}
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="storefront-address">Adresse</label>
                <input
                  id="storefront-address"
                  value={customerForm.address}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="storefront-notes">Message client</label>
                <textarea
                  id="storefront-notes"
                  value={customerForm.notes}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>

              {feedback ? <p className="feedback success">{feedback}</p> : null}
              {submitError ? <p className="feedback error">{submitError}</p> : null}

              <button type="submit" className="button primary" disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : "Creer la reservation"}
              </button>
            </form>
          </Panel>
        </section>
      </div>
    </div>
  );
}
