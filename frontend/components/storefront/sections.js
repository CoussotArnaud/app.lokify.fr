"use client";

import Link from "next/link";

import { formatCurrency } from "../../lib/date";
import BrandLogo from "../brand-logo";
import Icon from "../icon";
import StatusPill from "../status-pill";
import StorefrontEmptyState from "./empty-state";

const CategorySkeletonGrid = () => (
  <div className="public-shop-v6-category-grid" aria-hidden="true">
    {Array.from({ length: 3 }).map((_, index) => (
      <article key={`category-skeleton-${index}`} className="public-shop-v6-category-card storefront-skeleton-card">
        <div className="storefront-skeleton storefront-skeleton-category-media" />
        <div className="public-shop-v6-category-overlay storefront-skeleton-overlay">
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

const StorefrontSectionHeading = ({ eyebrow, title, description, action = null }) => (
  <div className="public-shop-section-head public-shop-v6-section-head">
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {action}
  </div>
);

export function StorefrontTopbar({
  publicPath,
  hasReviews,
  revealCatalog,
  scrollToSection,
}) {
  return (
    <header className="public-shop-topbar public-shop-v6-topbar">
      <div className="public-shop-topbar-inner public-shop-v6-topbar-inner">
        <Link href={publicPath} className="public-shop-topbar-brand public-shop-v6-brand">
          <BrandLogo className="public-shop-topbar-logo" />
          <span>Lokify</span>
        </Link>

        <nav className="public-shop-topbar-nav public-shop-v6-topbar-nav" aria-label="Navigation boutique">
          <a href="#shop-categories">Categories</a>
          <a href="#storefront-catalogue">Catalogue</a>
          <a href="#shop-how-it-works">Comment ca marche</a>
          {hasReviews ? <a href="#shop-reviews">Avis</a> : null}
        </nav>

        <div className="public-shop-topbar-actions public-shop-v6-topbar-actions">
          <button type="button" className="button ghost" onClick={() => revealCatalog("all")}>
            Voir le catalogue
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => scrollToSection("shop-reservation")}
          >
            Louer
          </button>
        </div>
      </div>
    </header>
  );
}

export function StorefrontHero({
  storefrontName,
  storefrontLiveStatus,
  providerLocation,
  heroImages = [],
  activeHeroImageIndex = 0,
  bookingForm,
  onBookingFieldChange,
  paymentSummary,
  revealCatalog,
  scrollToSection,
  isLoading,
}) {
  const hasMeaningfulLocation =
    providerLocation && providerLocation.trim() && providerLocation !== "Boutique publique";
  const heroLocationLabel = hasMeaningfulLocation ? providerLocation : "Service sur reservation";
  const heroMediaCaption = hasMeaningfulLocation ? providerLocation : storefrontName;
  const normalizedHeroImages = Array.isArray(heroImages) ? heroImages.filter(Boolean) : [];
  const hasHeroSlider = normalizedHeroImages.length > 1;
  const handleReservationCta = () => {
    revealCatalog("all");
    scrollToSection("storefront-catalogue");
  };

  return (
    <section className="public-shop-v6-hero" id="shop-hero">
      <div className="public-shop-v6-hero-copy">
        <div className="public-shop-v6-heading-stack public-shop-v6-hero-copy-top">
          <p className="public-shop-v6-hero-intro">Bienvenue chez</p>
          <h1>{storefrontName}</h1>

          <div className="public-shop-v6-badge-row">
            <StatusPill tone={storefrontLiveStatus.tone}>{storefrontLiveStatus.label}</StatusPill>
            <span className="public-shop-v6-badge">
              <Icon name={paymentSummary?.enabled ? "shield" : "document"} size={14} />
              {paymentSummary?.enabled ? "Paiement securise" : "Reservation sur demande"}
            </span>
          </div>

          <p className="public-shop-v6-hero-description">
            Choisissez vos dates et vos horaires des votre arrivee pour afficher la selection
            disponible, composer votre panier et avancer sereinement dans votre projet.
          </p>

          <div className="public-shop-v6-hero-support">
            <span>
              <Icon name="truck" size={16} />
              Livraison ou retrait selon votre evenement
            </span>
            <span>
              <Icon name="location" size={16} />
              {heroLocationLabel}
            </span>
          </div>
        </div>

        <section id="shop-reservation" className="public-shop-v6-reservation-card">
          <div className="public-shop-v6-reservation-head">
            <div>
              <p className="eyebrow">Reservez en 2 minutes !</p>
              <h2>Choisissez vos dates et horaires de location</h2>
              <p>
                Renseignez votre periode pour voir tout de suite les disponibilites et demarrer
                votre selection dans de bonnes conditions.
              </p>
            </div>
          </div>

          <div className="public-shop-v6-reservation-grid">
            <div className="field">
              <label htmlFor="public-storefront-hero-start-date">Date de debut</label>
              <input
                id="public-storefront-hero-start-date"
                type="date"
                value={bookingForm.start_date}
                onChange={(event) => onBookingFieldChange("start_date", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="public-storefront-hero-start-time">Heure</label>
              <input
                id="public-storefront-hero-start-time"
                type="time"
                value={bookingForm.start_time}
                onChange={(event) => onBookingFieldChange("start_time", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="public-storefront-hero-end-date">Date de fin</label>
              <input
                id="public-storefront-hero-end-date"
                type="date"
                value={bookingForm.end_date}
                onChange={(event) => onBookingFieldChange("end_date", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="public-storefront-hero-end-time">Heure</label>
              <input
                id="public-storefront-hero-end-time"
                type="time"
                value={bookingForm.end_time}
                onChange={(event) => onBookingFieldChange("end_time", event.target.value)}
              />
            </div>
          </div>

          <div className="public-shop-v6-reservation-foot">
            <button
              type="button"
              className="button primary public-shop-v6-reservation-cta"
              onClick={handleReservationCta}
            >
              Louer
            </button>
            <div className="public-shop-v6-reservation-status" aria-live="polite">
              <span>{paymentSummary?.enabled ? "Paiement en ligne" : "Validation accompagnee"}</span>
              <strong>
                {isLoading
                  ? "Mise a jour des disponibilites..."
                  : "Disponibilites actualisees selon vos dates"}
              </strong>
            </div>
          </div>
        </section>
      </div>

      <div className="public-shop-v6-hero-media">
        {normalizedHeroImages.length ? (
          hasHeroSlider ? (
            <div className="public-shop-v6-hero-slider" aria-live="polite">
              {normalizedHeroImages.map((heroImage, index) => (
                <img
                  key={`${heroImage}-${index}`}
                  src={heroImage}
                  alt={storefrontName}
                  className={`public-shop-v6-hero-image public-shop-v6-hero-slide ${
                    index === activeHeroImageIndex ? "is-active" : ""
                  }`.trim()}
                  aria-hidden={index === activeHeroImageIndex ? "false" : "true"}
                />
              ))}
            </div>
          ) : (
            <img
              src={normalizedHeroImages[0]}
              alt={storefrontName}
              className="public-shop-v6-hero-image"
            />
          )
        ) : (
          <div className="public-shop-v6-hero-placeholder" aria-hidden="true">
            <div>
              <span>{storefrontName.slice(0, 1).toUpperCase()}</span>
              <small>Selection premium</small>
            </div>
          </div>
        )}

        <div className="public-shop-v6-hero-media-caption">
          <span>Evenements, mariages, anniversaires</span>
          <strong>{heroMediaCaption}</strong>
        </div>
      </div>
    </section>
  );
}

export function StorefrontReassuranceStrip({ paymentSummary }) {
  const cards = [
    {
      icon: "shield",
      title: "Avis clients",
      description: "Une experience claire et rassurante du choix des dates a la validation.",
    },
    {
      icon: paymentSummary?.enabled ? "euro" : "document",
      title: paymentSummary?.enabled ? "Paiement securise" : "Validation souple",
      description: paymentSummary?.enabled
        ? "Reglement en ligne avec recapitulatif clair et montant visible."
        : "Votre demande est transmise rapidement au prestataire pour confirmation.",
    },
    {
      icon: "truck",
      title: "Livraison possible",
      description: "Retrait ou livraison selon votre projet et la zone d'intervention.",
    },
    {
      icon: "phone",
      title: "Une question ?",
      description: "Une reponse rapide et un accompagnement humain si besoin.",
    },
  ];

  return (
    <section className="public-shop-v6-reassurance" aria-label="Points de reassurance">
      {cards.map((card) => (
        <article key={card.title} className="public-shop-v6-reassurance-card">
          <div className="public-shop-v6-reassurance-icon" aria-hidden="true">
            <Icon name={card.icon} size={18} />
          </div>
          <div className="public-shop-v6-reassurance-copy">
            <strong>{card.title}</strong>
            <span>{card.description}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

export function StorefrontCategoriesSection({ categories, revealCatalog, isLoading }) {
  return (
    <section id="shop-categories" className="public-shop-section-block public-shop-v6-section">
      <StorefrontSectionHeading
        eyebrow="Categories"
        title="Explorez par univers"
        description="Retrouvez rapidement les grandes familles de produits disponibles sur la boutique."
        action={
          <button type="button" className="button ghost" onClick={() => revealCatalog("all")}>
            Voir tout le catalogue
          </button>
        }
      />

      {isLoading && !categories.length ? (
        <CategorySkeletonGrid />
      ) : categories.length ? (
        <div className="public-shop-v6-category-grid">
          {categories.map((category) => (
            <article key={category.slug} className="public-shop-v6-category-card">
              <div className="public-shop-v6-category-media">
                {category.image_url ? (
                  <img src={category.image_url} alt={category.image_alt_text || category.name} />
                ) : (
                  <div className="public-shop-v6-category-placeholder" aria-hidden="true">
                    <span>{category.name.slice(0, 1).toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="public-shop-v6-category-overlay">
                <div>
                  <strong>{category.name}</strong>
                  <p>{category.description}</p>
                </div>
                <div className="public-shop-v6-category-foot">
                  <span>
                    {category.starting_price > 0
                      ? `A partir de ${formatCurrency(category.starting_price)}`
                      : "Tarif sur demande"}
                  </span>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => revealCatalog(category.slug)}
                  >
                    Decouvrir
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <StorefrontEmptyState
          icon="catalog"
          title="La selection publique arrive bientot"
          description="Le catalogue sera visible ici des qu'une premiere categorie sera publiee. En attendant, vous pouvez parcourir directement les produits disponibles."
          actionLabel="Voir les produits"
          onAction={() => revealCatalog("all")}
        />
      )}
    </section>
  );
}

export function StorefrontFeaturedSection({
  featuredProducts,
  visibleFeaturedProducts,
  featuredOffset,
  featuredPageSize,
  setFeaturedOffset,
  revealCatalog,
  openProductPreview,
  addProductToCart,
  availabilityMeta,
}) {
  if (!featuredProducts.length) {
    return null;
  }

  return (
    <section id="shop-featured" className="public-shop-section-block public-shop-v6-section">
      <StorefrontSectionHeading
        eyebrow="Selection"
        title="Produits a fort impact"
        description="Une selection courte pour mettre en avant les experiences les plus reservees."
        action={
          <div className="public-shop-v6-inline-actions">
            <button
              type="button"
              className="button subtle public-shop-v6-round-button"
              onClick={() => setFeaturedOffset((current) => Math.max(0, current - featuredPageSize))}
              disabled={featuredOffset === 0}
              aria-label="Produits precedents"
            >
              <Icon name="arrowLeft" size={16} />
            </button>
            <button
              type="button"
              className="button subtle public-shop-v6-round-button"
              onClick={() =>
                setFeaturedOffset((current) =>
                  current + featuredPageSize >= featuredProducts.length ? current : current + featuredPageSize
                )
              }
              disabled={featuredOffset + featuredPageSize >= featuredProducts.length}
              aria-label="Produits suivants"
            >
              <Icon name="arrowRight" size={16} />
            </button>
            <button type="button" className="button ghost" onClick={() => revealCatalog("all")}>
              Voir tout le catalogue
            </button>
          </div>
        }
      />

      <div className="public-shop-v6-featured-grid">
        {visibleFeaturedProducts.map((product) => {
          const meta = availabilityMeta[product.status] || availabilityMeta.available;
          const hasOptions = Array.isArray(product.options) && product.options.length > 0;

          return (
            <article key={product.id} className="public-shop-v6-featured-card">
              <div className="public-shop-v6-featured-media">
                {product.thumbnail ? (
                  <img src={product.thumbnail} alt={product.public_name} />
                ) : (
                  <div className="public-shop-v6-category-placeholder" aria-hidden="true">
                    <span>{product.public_name.slice(0, 1).toUpperCase()}</span>
                  </div>
                )}
                <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
              </div>

              <div className="public-shop-v6-featured-copy">
                <div>
                  <strong>{product.public_name}</strong>
                  <p>{product.public_description}</p>
                </div>

                <div className="public-shop-v6-featured-meta">
                  <span className="public-shop-v6-price-badge">
                    A partir de {formatCurrency(product.price)}
                  </span>
                  <span>{product.available_quantity} unite(s) dispo</span>
                </div>

                <div className="public-shop-v6-inline-actions">
                  <button type="button" className="button ghost" onClick={() => openProductPreview(product)}>
                    Voir la fiche
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
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function StorefrontGuideSection({
  mapAddress,
  mapEmbedUrl,
  revealCatalog,
  paymentSummary,
  storefrontName,
}) {
  const steps = [
    {
      icon: "calendar",
      title: "Choisissez vos dates",
      description: "Indiquez la periode souhaitee pour voir les produits disponibles au bon moment.",
    },
    {
      icon: "catalog",
      title: "Composez votre selection",
      description: "Ajoutez vos produits, options ou packs sans perdre le fil de votre panier.",
    },
    {
      icon: "users",
      title: "Renseignez vos coordonnees",
      description: "Partagez les informations utiles pour preparer votre evenement sereinement.",
    },
    {
      icon: paymentSummary?.enabled ? "euro" : "document",
      title: paymentSummary?.enabled ? "Validez puis payez" : "Envoyez votre demande",
      description: paymentSummary?.enabled
        ? "Finalisez la reservation avec un paiement en ligne clair et securise."
        : "Le prestataire recoit votre demande complete pour validation rapide.",
    },
  ];

  return (
    <section id="shop-how-it-works" className="public-shop-section-block public-shop-v6-section">
      <div className="public-shop-v6-guide-layout">
        <div className="public-shop-v6-guide-panel">
          <StorefrontSectionHeading
            eyebrow="Comment ca marche"
            title="Un parcours clair, du choix des dates a la validation"
            description={`${storefrontName} met en avant l'essentiel pour reserver vite, sans jargon ni friction inutile.`}
          />

          <div className="public-shop-v6-step-grid">
            {steps.map((step, index) => (
              <article key={step.title} className="public-shop-v6-step-card">
                <div className="public-shop-v6-step-index">{index + 1}</div>
                <div className="public-shop-v6-step-icon" aria-hidden="true">
                  <Icon name={step.icon} size={18} />
                </div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </article>
            ))}
          </div>

          <div className="public-shop-v6-guide-actions">
            <button type="button" className="button primary" onClick={() => revealCatalog("all")}>
              Composer mon panier
            </button>
          </div>
        </div>

        {mapAddress ? (
          <div className="public-shop-v6-map-card">
            <div className="public-shop-v6-map-head">
              <p className="eyebrow">Emplacement</p>
              <h2>Ou nous retrouver</h2>
              <p>{mapAddress}</p>
            </div>
            <iframe
              title={`Carte ${storefrontName}`}
              src={mapEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="public-shop-v6-map-card public-shop-v6-contact-card">
            <div className="public-shop-v6-map-head">
              <p className="eyebrow">Accompagnement</p>
              <h2>Un projet sur mesure ?</h2>
              <p>
                Ajoutez vos contraintes dans le message final : volume, livraison, installation ou
                timing specifique.
              </p>
            </div>
            <div className="public-shop-v6-contact-points">
              <span>
                <Icon name="truck" size={16} />
                Livraison / retrait selon configuration
              </span>
              <span>
                <Icon name="shield" size={16} />
                Validation claire du panier avant envoi
              </span>
              <span>
                <Icon name="phone" size={16} />
                Echanges simples en cas de besoin particulier
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function StorefrontReviewsSection({ storefront, reviewCards }) {
  if (!storefront?.reviews_enabled || !storefront?.reviews_url) {
    return null;
  }

  return (
    <section id="shop-reviews" className="public-shop-section-block public-shop-v6-section">
      <StorefrontSectionHeading
        eyebrow="Avis"
        title="Ils nous font confiance"
        description="Une presentation rassurante pour valoriser les retours clients sans alourdir la page."
        action={
          <a href={storefront.reviews_url} className="button ghost" target="_blank" rel="noreferrer">
            Voir les avis Google
          </a>
        }
      />

      <div className="public-shop-v6-review-badge">
        <strong>4.9</strong>
        <span>sur Google</span>
      </div>

      <div className="public-shop-v6-review-grid">
        {reviewCards.map((review) => (
          <article key={review.id} className="public-shop-v6-review-card">
            <div className="public-shop-v6-review-head">
              <strong>{review.author}</strong>
              <div className="public-shop-v6-review-stars" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span key={`${review.id}-star-${index}`}>*</span>
                ))}
              </div>
            </div>
            <p>{review.copy}</p>
            <a href={storefront.reviews_url} target="_blank" rel="noreferrer">
              Lire la suite
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StorefrontFooter({
  storefrontName,
  providerLocation,
  publicPath,
  paymentSummary,
  mapAddress,
}) {
  return (
    <footer id="shop-footer" className="public-shop-v6-footer">
      <div className="public-shop-v6-footer-grid">
        <article className="public-shop-v6-footer-brand">
          <strong>{storefrontName}</strong>
          <p>
            Une boutique de location plus elegante, avec un parcours clair, une selection mise en
            valeur et un panier lisible jusqu'a la validation.
          </p>
          <span>{providerLocation || "Activite sur demande"}</span>
          <span>{paymentSummary?.enabled ? "Reservation et paiement en ligne" : "Validation sur demande"}</span>
        </article>

        <article>
          <strong>Navigation</strong>
          <a href={publicPath}>Accueil</a>
          <a href="#shop-categories">Categories</a>
          <a href="#storefront-catalogue">Catalogue</a>
        </article>

        <article>
          <strong>Reservation</strong>
          <a href="#shop-reservation">Choisir mes dates</a>
          <a href="#shop-cart">Voir mon panier</a>
          <span>{paymentSummary?.enabled ? "Paiement en ligne" : "Validation sur demande"}</span>
        </article>

        <article>
          <strong>Infos utiles</strong>
          <a href="#shop-how-it-works">Comment ca marche</a>
          <span>TVA et recapitulatif conserves</span>
          <span>{mapAddress ? mapAddress : "Livraison / retrait selon configuration"}</span>
        </article>

        <article>
          <strong>Confiance</strong>
          <span>Parcours public clair</span>
          <span>Disponibilites mises a jour</span>
          <span>Panier testable avant validation</span>
        </article>
      </div>
    </footer>
  );
}
