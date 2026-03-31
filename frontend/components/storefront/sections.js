"use client";

import Link from "next/link";

import { formatCurrency } from "../../lib/date";
import BrandLogo from "../brand-logo";
import Icon from "../icon";
import StatusPill from "../status-pill";
import StorefrontEmptyState from "./empty-state";

const buildHeroMetrics = ({
  products = [],
  categories = [],
  packs = [],
  paymentSummary = null,
  providerLocation = "",
}) => {
  const startingPrice = [...products]
    .map((product) => Number(product?.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right)[0];

  return [
    {
      label: "A partir de",
      value: startingPrice ? formatCurrency(startingPrice) : "Sur demande",
    },
    {
      label: "Selection publique",
      value: `${products.length + packs.length} offres`,
    },
    {
      label: "Zone couverte",
      value: providerLocation || "Sur devis",
    },
    {
      label: "Validation",
      value: paymentSummary?.enabled ? "Paiement en ligne" : "Demande rapide",
    },
    {
      label: "Univers",
      value: `${categories.length || 0} categories`,
    },
    {
      label: "Accompagnement",
      value: "Equipe reactive",
    },
  ];
};

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
            Reserver
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
  heroImage,
  products,
  categories,
  packs,
  bookingForm,
  onBookingFieldChange,
  paymentSummary,
  visibleProductCount,
  revealCatalog,
  scrollToSection,
  isLoading,
}) {
  const heroMetrics = buildHeroMetrics({
    products,
    categories,
    packs,
    paymentSummary,
    providerLocation,
  });

  return (
    <section className="public-shop-v6-hero" id="shop-hero">
      <div className="public-shop-v6-hero-copy">
        <div className="public-shop-v6-hero-copy-top">
          <div className="public-shop-v6-badge-row">
            <span className="public-shop-v6-badge">
              <Icon name="shield" size={14} />
              Location evenementielle
            </span>
            <StatusPill tone={storefrontLiveStatus.tone}>{storefrontLiveStatus.label}</StatusPill>
          </div>

          <div className="public-shop-v6-heading-stack">
            <p className="eyebrow">Boutique publique</p>
            <h1>Une location simple, elegante et rassurante des la premiere visite.</h1>
            <p className="public-shop-v6-hero-description">
              {storefrontName} vous accompagne pour reserver vos animations, materiels et packs
              evenementiels avec un parcours clair, des disponibilites visibles et un panier
              facile a verifier.
            </p>
          </div>

          <div className="public-shop-v6-hero-actions">
            <button type="button" className="button primary" onClick={() => revealCatalog("all")}>
              Voir les disponibilites
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => scrollToSection("shop-categories")}
            >
              Explorer la selection
            </button>
          </div>

          <div className="public-shop-v6-hero-meta">
            <span>
              <Icon name="location" size={16} />
              {providerLocation || "Partout en France sur demande"}
            </span>
            <span>
              <Icon name="catalog" size={16} />
              {visibleProductCount} produits visibles
            </span>
            <span>
              <Icon name="truck" size={16} />
              Livraison ou retrait selon votre projet
            </span>
          </div>
        </div>

        <section id="shop-reservation" className="public-shop-v6-reservation-card">
          <div className="public-shop-v6-reservation-head">
            <div>
              <p className="eyebrow">Preparation rapide</p>
              <h2>Choisissez votre periode</h2>
              <p>
                Indiquez vos dates et vos horaires souhaites pour consulter la selection
                disponible et composer votre panier.
              </p>
            </div>
            <div className="public-shop-v6-reservation-status">
              <span>{paymentSummary?.enabled ? "Paiement actif" : "Demande en ligne"}</span>
              {isLoading ? <strong>Mise a jour en cours</strong> : <strong>Disponibilites en direct</strong>}
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
            <div className="public-shop-v6-reservation-points">
              <span>
                <Icon name="clock" size={16} />
                Reponse rapide
              </span>
              <span>
                <Icon name="shield" size={16} />
                Parcours clair
              </span>
              <span>
                <Icon name="truck" size={16} />
                Logistique visible
              </span>
            </div>
            <button
              type="button"
              className="button primary public-shop-v6-reservation-cta"
              onClick={() => revealCatalog("all")}
            >
              Voir la selection disponible
            </button>
          </div>
        </section>
      </div>

      <div className="public-shop-v6-hero-media">
        {heroImage ? (
          <img src={heroImage} alt={storefrontName} className="public-shop-v6-hero-image" />
        ) : (
          <div className="public-shop-v6-hero-placeholder" aria-hidden="true">
            <div>
              <span>{storefrontName.slice(0, 1).toUpperCase()}</span>
              <small>Boutique publique</small>
            </div>
          </div>
        )}

        <div className="public-shop-v6-hero-overlay">
          {heroMetrics.map((metric) => (
            <article key={metric.label} className="public-shop-v6-hero-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StorefrontReassuranceStrip({ paymentSummary }) {
  const cards = [
    {
      icon: "shield",
      title: "Parcours rassurant",
      description: "Dates, panier et recapitulatif restent lisibles a chaque etape.",
    },
    {
      icon: "truck",
      title: "Livraison ou retrait",
      description: "Les modalites logistiques sont mises en avant sans alourdir l'experience.",
    },
    {
      icon: paymentSummary?.enabled ? "euro" : "document",
      title: paymentSummary?.enabled ? "Paiement securise" : "Demande structuree",
      description:
        paymentSummary?.description ||
        "Votre demande conserve les informations utiles pour une validation rapide.",
    },
    {
      icon: "phone",
      title: "Accompagnement humain",
      description: "Une question, une contrainte ou un besoin specifique : le contact reste simple.",
    },
  ];

  return (
    <section className="public-shop-v6-reassurance" aria-label="Points de reassurance">
      {cards.map((card) => (
        <article key={card.title} className="public-shop-v6-reassurance-card">
          <div className="public-shop-v6-reassurance-icon" aria-hidden="true">
            <Icon name={card.icon} size={18} />
          </div>
          <strong>{card.title}</strong>
          <span>{card.description}</span>
        </article>
      ))}
    </section>
  );
}

export function StorefrontCategoriesSection({ categories, revealCatalog }) {
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

      {categories.length ? (
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
  visibleProductCount,
  visiblePackCount,
  mapAddress,
}) {
  return (
    <footer id="shop-footer" className="public-shop-v6-footer">
      <div className="public-shop-v6-footer-grid">
        <article className="public-shop-v6-footer-brand">
          <strong>{storefrontName}</strong>
          <p>
            Boutique publique de location pensee pour reserver plus sereinement, avec une selection
            claire, un panier lisible et une validation sans friction.
          </p>
          <span>{providerLocation || "Activite sur demande"}</span>
          <span>
            {visibleProductCount} produits publics{visiblePackCount ? ` et ${visiblePackCount} packs` : ""}
          </span>
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
