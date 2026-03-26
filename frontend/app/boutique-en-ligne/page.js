"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BrandLogo from "../../components/brand-logo";
import Panel from "../../components/panel";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { formatCurrency } from "../../lib/date";
import { readProductProfiles } from "../../lib/workspace-store";

const buildDateValue = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export default function StorefrontPage() {
  const workspace = useLokifyWorkspace();
  const [productProfiles, setProductProfiles] = useState({});
  const [selectedProductId, setSelectedProductId] = useState("");
  const [form, setForm] = useState({
    start_date: buildDateValue(1),
    start_time: "09:00",
    end_date: buildDateValue(2),
    end_time: "18:00",
  });
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setProductProfiles(readProductProfiles());
  }, []);

  const visibleProducts = workspace.products
    .map((product) => {
      const profile = productProfiles[product.id] || {};
      return {
        ...product,
        public_name: profile.public_name || product.name,
        public_description: profile.public_description || "Produit pret a etre reserve en ligne.",
        photo: profile.photos?.[0] || "",
        online_visible: Boolean(profile.online_visible),
      };
    })
    .filter((product) => product.online_visible || !Object.keys(productProfiles).length);

  const productsToDisplay = visibleProducts.length ? visibleProducts : workspace.products.slice(0, 3);
  const selectedProduct =
    productsToDisplay.find((product) => product.id === selectedProductId) || productsToDisplay[0];

  useEffect(() => {
    if (selectedProduct?.id) {
      setSelectedProductId(selectedProduct.id);
    }
  }, [selectedProduct?.id]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }
    setFeedback(`Demande prete pour ${selectedProduct.public_name}. La structure du parcours est en place.`);
  };

  return (
    <div className="storefront-page">
      <div className="storefront-shell">
        <header className="storefront-header">
          <BrandLogo className="brand-logo-header" />
          <div className="page-header-actions">
            <StatusPill tone="success">Preview boutique</StatusPill>
            <Link href="/dashboard" className="button ghost">
              Retour espace
            </Link>
          </div>
        </header>

        <section className="storefront-hero">
          <div className="page-stack">
            <div className="page-heading">
              <p className="eyebrow">Boutique en ligne</p>
              <h1>Reservez facilement votre materiel evenementiel avec une experience simple et rassurante.</h1>
              <p>Le front reste tres propre, tres aere et volontairement calme pour mettre la reservation au premier plan.</p>
            </div>

            {selectedProduct ? (
              <div className="category-card">
                <header>
                  <div>
                    <strong>{selectedProduct.public_name}</strong>
                    <p className="table-subcopy">{selectedProduct.public_description}</p>
                  </div>
                  <StatusPill tone={selectedProduct.availableUnits > 0 ? "success" : "warning"}>
                    {selectedProduct.availableUnits > 0 ? "Disponible" : "Sur demande"}
                  </StatusPill>
                </header>
                <div className="summary-cards">
                  <div className="detail-card">
                    <strong>{formatCurrency(selectedProduct.price)}</strong>
                    <span className="muted-text">a partir de / jour</span>
                  </div>
                  <div className="detail-card">
                    <strong>{formatCurrency(selectedProduct.deposit)}</strong>
                    <span className="muted-text">depot de garantie</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>Aucun produit vitrine</strong>
                <span>Activez la visibilite boutique depuis la fiche produit pour alimenter cette page.</span>
              </div>
            )}
          </div>

          <form className="storefront-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="store-product">Produit</label>
              <select id="store-product" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                {productsToDisplay.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.public_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="store-start-date">Date debut</label>
                <input id="store-start-date" type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="store-start-time">Heure debut</label>
                <input id="store-start-time" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
              </div>
            </div>

            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="store-end-date">Date fin</label>
                <input id="store-end-date" type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="store-end-time">Heure fin</label>
                <input id="store-end-time" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} />
              </div>
            </div>

            <button type="submit" className="button primary">
              Louer
            </button>

            {feedback ? <p className="feedback success">{feedback}</p> : null}
          </form>
        </section>

        <section className="reassurance-grid">
          <article className="reassurance-card">
            <strong>Paiement securise</strong>
            <span>Une base claire pour integrer acompte, solde et caution.</span>
          </article>
          <article className="reassurance-card">
            <strong>Livraison possible</strong>
            <span>Le retrait ou la tournee peuvent etre ajoutes sans complexifier l'ecran.</span>
          </article>
          <article className="reassurance-card">
            <strong>Note de confiance</strong>
            <span>Des avis et signaux de reassurance peuvent etre relies a la fiche produit.</span>
          </article>
          <article className="reassurance-card">
            <strong>Question / contact</strong>
            <span>Le besoin d'accompagnement reste visible et rassurant des le premier regard.</span>
          </article>
        </section>

        <Panel title="Selection boutique" description="Une vitrine simple a comprendre, sans surcharge inutile.">
          <div className="shop-product-grid">
            {productsToDisplay.map((product) => (
              <article key={product.id} className="category-card">
                <header>
                  <div>
                    <strong>{product.public_name}</strong>
                    <p className="table-subcopy">{product.public_description}</p>
                  </div>
                  <StatusPill tone={product.availableUnits > 0 ? "success" : "warning"}>
                    {product.availableUnits > 0 ? "Disponible" : "Sur demande"}
                  </StatusPill>
                </header>
                <div className="summary-cards">
                  <div className="detail-card">
                    <strong>{formatCurrency(product.price)}</strong>
                    <span className="muted-text">prix jour</span>
                  </div>
                  <div className="detail-card">
                    <strong>{product.availableUnits}</strong>
                    <span className="muted-text">unite(s) disponibles</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
