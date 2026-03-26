"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import SecondaryNav from "../../../../components/secondary-nav";
import StatusPill from "../../../../components/status-pill";
import useLokifyWorkspace from "../../../../hooks/use-lokify-workspace";
import {
  readCustomCategories,
  readProductProfiles,
  saveProductProfile,
  slugifyLabel,
} from "../../../../lib/workspace-store";

const navigationGroups = [
  {
    title: "Creation produit",
    items: [
      { id: "information", label: "Informations", helper: "General, quantite, categorie, filtres." },
      { id: "pricing", label: "Tarifs", helper: "Grille simple et tarifs speciaux." },
      { id: "storefront", label: "Boutique en ligne", helper: "Visibilite, photos et description." },
      { id: "related", label: "Produits associes", helper: "Liens, options et ordre d'affichage." },
    ],
  },
];

const buildEmptyForm = () => ({
  name: "",
  deposit: 0,
  vat: 20,
  internal_description: "",
  stock: 1,
  status: "available",
  serial_tracking: false,
  assignment_order: "auto",
  availability_note: "",
  category_slug: "",
  category_name: "",
  subcategory: "",
  features: "",
  custom_filters: "",
  documents: [""],
  questionnaire: "",
  inspection_template: "Standard",
  price_day: 0,
  price_weekend: 0,
  price_week: 0,
  custom_price_note: "",
  online_visible: false,
  public_name: "",
  public_description: "",
  photos: [],
  related_enabled: false,
  related_product_ids: [],
  related_sort_note: "",
  catalog_mode: "location",
});

export default function ProductEditorPage() {
  const router = useRouter();
  const workspace = useLokifyWorkspace();
  const [customCategories, setCustomCategories] = useState([]);
  const [productProfiles, setProductProfiles] = useState({});
  const [activeSection, setActiveSection] = useState("information");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(buildEmptyForm());
  const [editingId, setEditingId] = useState("");
  const product = workspace.products.find((entry) => entry.id === editingId);

  useEffect(() => {
    const storedCategories = readCustomCategories();
    const storedProfiles = readProductProfiles();
    setCustomCategories(storedCategories);
    setProductProfiles(storedProfiles);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setEditingId(new URLSearchParams(window.location.search).get("product") || "");
  }, []);

  useEffect(() => {
    if (!editingId || !product) {
      return;
    }

    const profile = productProfiles[editingId] || {};
    setForm({
      ...buildEmptyForm(),
      name: product.name,
      deposit: product.deposit,
      stock: product.stock,
      status: product.status,
      category_slug: profile.category_slug || product.categorySlug,
      category_name: profile.category_name || product.category,
      public_name: profile.public_name || product.name,
      price_day: product.price,
      price_weekend: profile.price_weekend || product.price,
      price_week: profile.price_week || product.price,
      internal_description: profile.internal_description || "",
      vat: profile.vat || 20,
      serial_tracking: Boolean(profile.serial_tracking),
      assignment_order: profile.assignment_order || "auto",
      availability_note: profile.availability_note || "",
      subcategory: profile.subcategory || "",
      features: profile.features || "",
      custom_filters: profile.custom_filters || "",
      documents: profile.documents?.length ? profile.documents : [""],
      questionnaire: profile.questionnaire || "",
      inspection_template: profile.inspection_template || "Standard",
      custom_price_note: profile.custom_price_note || "",
      online_visible: Boolean(profile.online_visible),
      public_description: profile.public_description || "",
      photos: profile.photos || [],
      related_enabled: Boolean(profile.related_enabled),
      related_product_ids: profile.related_product_ids || [],
      related_sort_note: profile.related_sort_note || "",
      catalog_mode: profile.catalog_mode || "location",
    });
  }, [editingId, product, productProfiles]);

  const categories = [...workspace.categories, ...customCategories]
    .map((category) => ({
      slug: category.slug || slugifyLabel(category.name),
      name: category.name,
      filters: category.filters || [],
    }))
    .filter((category, index, array) => array.findIndex((entry) => entry.slug === category.slug) === index);

  const selectedCategory = categories.find((category) => category.slug === form.category_slug);
  const availableRelatedProducts = workspace.products.filter((entry) => entry.id !== editingId);

  const setValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setDocumentValue = (index, value) => {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document, documentIndex) =>
        documentIndex === index ? value : document
      ),
    }));
  };

  const addPhotos = async (files) => {
    const nextPhotos = await Promise.all(
      Array.from(files || []).map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
          })
      )
    );

    setForm((current) => ({
      ...current,
      photos: [...current.photos, ...nextPhotos].slice(0, 6),
    }));
  };

  const toggleRelatedProduct = (productId) => {
    setForm((current) => ({
      ...current,
      related_product_ids: current.related_product_ids.includes(productId)
        ? current.related_product_ids.filter((entry) => entry !== productId)
        : [...current.related_product_ids, productId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      const response = await workspace.saveItem(
        {
          name: form.name,
          category: form.category_name || selectedCategory?.name || "Catalogue",
          stock: Number(form.stock || 0),
          status: form.status,
          price: Number(form.price_day || 0),
          deposit: Number(form.deposit || 0),
        },
        editingId
      );

      const savedProductId = response?.item?.id || editingId;
      const nextProfiles = saveProductProfile(savedProductId, {
        internal_description: form.internal_description,
        vat: Number(form.vat || 0),
        serial_tracking: form.serial_tracking,
        assignment_order: form.assignment_order,
        availability_note: form.availability_note,
        category_slug: form.category_slug || selectedCategory?.slug || slugifyLabel(form.category_name),
        category_name: form.category_name || selectedCategory?.name || "Catalogue",
        subcategory: form.subcategory,
        features: form.features,
        custom_filters: form.custom_filters,
        documents: form.documents.filter(Boolean),
        questionnaire: form.questionnaire,
        inspection_template: form.inspection_template,
        price_weekend: Number(form.price_weekend || 0),
        price_week: Number(form.price_week || 0),
        custom_price_note: form.custom_price_note,
        online_visible: form.online_visible,
        public_name: form.public_name || form.name,
        public_description: form.public_description,
        photos: form.photos,
        related_enabled: form.related_enabled,
        related_product_ids: form.related_product_ids,
        related_sort_note: form.related_sort_note,
        catalog_mode: form.catalog_mode,
      });

      setProductProfiles(nextProfiles);
      setFeedback(editingId ? "Produit mis a jour." : "Produit cree.");

      if (!editingId && savedProductId) {
        setEditingId(savedProductId);
        router.replace(`/catalogue/produits/nouveau?product=${savedProductId}`);
      }
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Produit</p>
            <h3>{editingId ? "Edition produit" : "Creation produit"}</h3>
            <p>La structure par blocs reste riche, mais l'interface devient plus douce, plus claire et plus simple a parcourir.</p>
          </div>
          <div className="page-header-actions">
            <Link href="/catalogue" className="button ghost">
              Retour au catalogue
            </Link>
          </div>
        </div>

        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <section className="subnav-layout">
          <SecondaryNav title="Menu produit" groups={navigationGroups} activeId={activeSection} onChange={setActiveSection} />

          <Panel
            title={form.public_name || form.name || "Nouveau produit"}
            description="Chaque section reste active et preparatoire, sans fausse interaction."
            actions={<StatusPill tone="info">{editingId ? "Edition" : "Nouveau"}</StatusPill>}
          >
            <form className="form-grid" onSubmit={handleSubmit}>
              {activeSection === "information" ? (
                <div className="editor-section-grid">
                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>General</h4>
                        <p>Nom, depot de garantie, TVA et description interne.</p>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="product-name">Nom du produit</label>
                      <input id="product-name" value={form.name} onChange={(event) => setValue("name", event.target.value)} required />
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="product-deposit">Depot de garantie</label>
                        <input id="product-deposit" type="number" min="0" value={form.deposit} onChange={(event) => setValue("deposit", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label htmlFor="product-vat">TVA</label>
                        <input id="product-vat" type="number" min="0" value={form.vat} onChange={(event) => setValue("vat", Number(event.target.value))} />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="product-internal-description">Description interne</label>
                      <textarea id="product-internal-description" value={form.internal_description} onChange={(event) => setValue("internal_description", event.target.value)} placeholder="Infos internes, usage, logistique, points de vigilance..." />
                    </div>
                  </div>

                  <div className="editor-section-grid two-columns">
                    <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Quantite</h4>
                        <p>Stock, ordre d'attribution, numeros de serie et disponibilite.</p>
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="product-stock">Quantite</label>
                        <input id="product-stock" type="number" min="0" value={form.stock} onChange={(event) => setValue("stock", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label htmlFor="product-status">Disponibilite</label>
                        <select id="product-status" value={form.status} onChange={(event) => setValue("status", event.target.value)}>
                          <option value="available">Disponible</option>
                          <option value="reserved">Reserve</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="unavailable">Indisponible</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <label className="detail-card">
                        <strong>Numeros de serie</strong>
                        <div className="row-actions">
                          <input type="checkbox" checked={form.serial_tracking} onChange={(event) => setValue("serial_tracking", event.target.checked)} />
                          <span className="muted-text">Suivre chaque unite si besoin.</span>
                        </div>
                      </label>
                      <div className="field">
                        <label htmlFor="assignment-order">Ordre d'attribution</label>
                        <select id="assignment-order" value={form.assignment_order} onChange={(event) => setValue("assignment_order", event.target.value)}>
                          <option value="auto">Automatique</option>
                          <option value="manual">Manuel</option>
                          <option value="fifo">FIFO</option>
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="availability-note">Note de disponibilite</label>
                      <input id="availability-note" value={form.availability_note} onChange={(event) => setValue("availability_note", event.target.value)} placeholder="Maintenance planifiee, atelier, preparation..." />
                    </div>
                  </div>

                    <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Categorie & caracteristiques</h4>
                        <p>Le produit reste lisible tout en se rattachant a la bonne famille.</p>
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
                        <option value="">Selectionner une categorie</option>
                        {categories.map((category) => (
                          <option key={category.slug} value={category.slug}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="product-subcategory">Sous-categorie</label>
                        <input id="product-subcategory" value={form.subcategory} onChange={(event) => setValue("subcategory", event.target.value)} placeholder="Ex. Premium" />
                      </div>
                      <div className="field">
                        <label htmlFor="product-features">Caracteristiques</label>
                        <input id="product-features" value={form.features} onChange={(event) => setValue("features", event.target.value)} placeholder="Ex. branding, impression, led" />
                      </div>
                    </div>
                  </div>

                  </div>

                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Filtres, documents, questionnaire, etat des lieux</h4>
                        <p>Des sous-sections utiles, mais restees volontairement tres digestes.</p>
                      </div>
                    </div>

                    <div className="tag-list">
                      {(selectedCategory?.filters || []).map((filter) => (
                        <span key={filter} className="tag-chip">
                          {filter}
                        </span>
                      ))}
                    </div>

                    <div className="field">
                      <label htmlFor="product-custom-filters">Filtres lies</label>
                      <input id="product-custom-filters" value={form.custom_filters} onChange={(event) => setValue("custom_filters", event.target.value)} placeholder="Couleurs, formats, options specifiques..." />
                    </div>

                    <div className="stack">
                      {form.documents.map((document, index) => (
                        <input key={`document-${index}`} value={document} onChange={(event) => setDocumentValue(index, event.target.value)} placeholder="Nom du document ou procedure associee" />
                      ))}
                    </div>

                    <button type="button" className="button ghost" onClick={() => setValue("documents", [...form.documents, ""])}>
                      + Document
                    </button>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="product-questionnaire">Questionnaire</label>
                        <input id="product-questionnaire" value={form.questionnaire} onChange={(event) => setValue("questionnaire", event.target.value)} placeholder="Nom du questionnaire lie" />
                      </div>
                      <div className="field">
                        <label htmlFor="product-inspection-template">Modele d'etat des lieux</label>
                        <input id="product-inspection-template" value={form.inspection_template} onChange={(event) => setValue("inspection_template", event.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "pricing" ? (
                <div className="editor-section-grid two-columns">
                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Grille tarifaire</h4>
                        <p>Une saisie immediate pour les prix jour, week-end et semaine.</p>
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="price-day">Prix journee</label>
                        <input id="price-day" type="number" min="0" value={form.price_day} onChange={(event) => setValue("price_day", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label htmlFor="price-weekend">Prix week-end</label>
                        <input id="price-weekend" type="number" min="0" value={form.price_weekend} onChange={(event) => setValue("price_weekend", Number(event.target.value))} />
                      </div>
                    </div>

                    <div className="form-grid two-columns">
                      <div className="field">
                        <label htmlFor="price-week">Prix semaine</label>
                        <input id="price-week" type="number" min="0" value={form.price_week} onChange={(event) => setValue("price_week", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label htmlFor="catalog-mode">Mode catalogue</label>
                        <select id="catalog-mode" value={form.catalog_mode} onChange={(event) => setValue("catalog_mode", event.target.value)}>
                          <option value="location">Location</option>
                          <option value="sale">Vente</option>
                          <option value="resale">Revente</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Tarifs speciaux</h4>
                        <p>Une zone simple pour noter les exceptions sans rendre l'ecran technique.</p>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="product-custom-price-note">Prix personnalise / commentaire</label>
                      <textarea id="product-custom-price-note" value={form.custom_price_note} onChange={(event) => setValue("custom_price_note", event.target.value)} placeholder="Ex. tarif degressif roadshow, prix sur demande, forfait longue duree..." />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "storefront" ? (
                <div className="editor-section-grid">
                  <div className="editor-section-grid two-columns">
                    <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>General boutique</h4>
                        <p>Visibilite du produit et version publique du nom.</p>
                      </div>
                    </div>

                    <label className="detail-card">
                      <strong>Produit visible en ligne</strong>
                      <div className="row-actions">
                        <input type="checkbox" checked={form.online_visible} onChange={(event) => setValue("online_visible", event.target.checked)} />
                        <span className="muted-text">Le produit peut etre pousse sur la vitrine boutique.</span>
                      </div>
                    </label>

                    <div className="field">
                      <label htmlFor="product-public-name">Nom public</label>
                      <input id="product-public-name" value={form.public_name} onChange={(event) => setValue("public_name", event.target.value)} placeholder="Nom visible sur la boutique" />
                    </div>
                  </div>

                    <div className="section-block">
                      <div className="section-block-header">
                        <div>
                          <h4>Description & produits associes</h4>
                          <p>Le texte public et les suggestions complementaires restent nets et faciles a lire.</p>
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="product-public-description">Description publique</label>
                        <textarea id="product-public-description" value={form.public_description} onChange={(event) => setValue("public_description", event.target.value)} placeholder="Texte de presentation du produit pour la boutique." />
                      </div>
                    </div>
                  </div>

                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Photos</h4>
                        <p>Ajout multiple avec apercu propre, sans rompre le style de Lokify.</p>
                      </div>
                    </div>

                    <label className="button ghost" htmlFor="product-photos">
                      Ajouter des photos
                    </label>
                    <input id="product-photos" type="file" accept="image/*" multiple hidden onChange={(event) => addPhotos(event.target.files)} />

                    <div className="thumbnail-grid">
                      {form.photos.map((photo, index) => (
                        <div key={`photo-${index}`} className="thumbnail-card">
                          <div className="thumbnail-media">
                            <img src={photo} alt={`Photo produit ${index + 1}`} />
                          </div>
                          <button type="button" className="button subtle" onClick={() => setValue("photos", form.photos.filter((_, photoIndex) => photoIndex !== index))}>
                            Retirer
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "related" ? (
                <>
                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h4>Produits associes</h4>
                        <p>Activation simple, selection des produits lies et note d'ordre d'affichage.</p>
                      </div>
                    </div>

                    <label className="detail-card">
                      <strong>Activer les suggestions</strong>
                      <div className="row-actions">
                        <input type="checkbox" checked={form.related_enabled} onChange={(event) => setValue("related_enabled", event.target.checked)} />
                        <span className="muted-text">Affiche des produits complementaires sur la fiche produit.</span>
                      </div>
                    </label>

                    <div className="card-list editor-related-grid">
                      {availableRelatedProducts.map((relatedProduct) => (
                        <label key={relatedProduct.id} className="detail-card">
                          <strong>{relatedProduct.name}</strong>
                          <div className="row-actions">
                            <input type="checkbox" checked={form.related_product_ids.includes(relatedProduct.id)} onChange={() => toggleRelatedProduct(relatedProduct.id)} />
                            <span className="muted-text">{relatedProduct.category}</span>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="field">
                      <label htmlFor="related-sort-note">Ordre d'affichage</label>
                      <input id="related-sort-note" value={form.related_sort_note} onChange={(event) => setValue("related_sort_note", event.target.value)} placeholder="Ex. d'abord les accessoires, puis les options premium" />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="row-actions form-actions-bar">
                <button type="submit" className="button primary" disabled={workspace.mutating}>
                  {workspace.mutating ? "Enregistrement..." : editingId ? "Sauvegarder le produit" : "Creer le produit"}
                </button>
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
