"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import StatusPill from "../../../../components/status-pill";
import useLokifyWorkspace from "../../../../hooks/use-lokify-workspace";
import { setFlashMessage } from "../../../../lib/flash-message";
import { slugifyLabel } from "../../../../lib/workspace-store";

const buildDefaultForm = () => ({
  name: "",
  description: "",
  icon_name: "",
  image_url: "",
});

function CategoryEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useLokifyWorkspace();
  const [form, setForm] = useState(buildDefaultForm());
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const editingSlug = searchParams.get("category") || "";
  const editingCategory = workspace.catalogCategories.find((category) => category.slug === editingSlug) || null;
  const categoryProducts = workspace.products.filter((product) => product.categorySlug === editingSlug);
  const isSubmitting = workspace.mutating;

  const getCategoryErrorMessage = (submissionError) => {
    if (submissionError?.code === "network_error") {
      return "La categorie n'a pas pu etre enregistree. Verifiez la connexion puis reessayez.";
    }

    return submissionError?.message || "La categorie n'a pas pu etre enregistree.";
  };

  useEffect(() => {
    if (!editingCategory) {
      setForm(buildDefaultForm());
      return;
    }

    setForm({
      name: editingCategory.name || "",
      description: editingCategory.description || "",
      icon_name: editingCategory.icon_name || "",
      image_url: editingCategory.image_url || "",
    });
  }, [editingCategory]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      const slug = editingSlug || slugifyLabel(form.name);
      await workspace.saveCatalogCategory({
        slug,
        name: form.name,
        description: form.description,
        icon_name: form.icon_name,
        image_url: form.image_url,
        filters: [],
        durations: [],
        ranges: [],
        inspection_enabled: false,
        status: "active",
      });
      if (!editingSlug) {
        setFlashMessage({ type: "success", message: "Categorie creee." });
        router.replace("/catalogue");
        return;
      }

      setFeedback("Categorie mise a jour.");
    } catch (submissionError) {
      setError(getCategoryErrorMessage(submissionError));
    }
  };

  const handleDelete = async () => {
    if (!editingSlug || !window.confirm("Supprimer cette categorie et retirer son affectation des produits ?")) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.deleteCatalogCategory(editingSlug);
      setFlashMessage({ type: "success", message: "Categorie supprimee." });
      router.replace("/catalogue");
    } catch (submissionError) {
      setError(getCategoryErrorMessage(submissionError));
    }
  };

  const handleBackToCatalogue = () => {
    router.push("/catalogue");
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Catalogue / Categorie</p>
            <h3>{editingSlug ? "Modifier une categorie" : "Ajouter une categorie"}</h3>
            <p>Le systeme reste volontairement simple: une categorie libre, modifiable, supprimable et jamais obligatoire pour vos produits.</p>
          </div>
          <div className="page-header-actions">
            <button type="button" className="button ghost" onClick={handleBackToCatalogue}>
              Retour au catalogue
            </button>
          </div>
        </div>

        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <section className="catalog-editor-layout">
          <Panel
            title="Vos categories"
            description="Aucune categorie systeme n'est injectee. Cette liste correspond uniquement a votre configuration."
            className="catalog-editor-sidebar"
          >
            <div className="card-list catalog-mini-list">
              {workspace.catalogCategories.map((category) => (
                <article key={category.slug} className="detail-card catalog-inline-card">
                  <div className="row-actions">
                    <div className="stack">
                      <strong>{category.name}</strong>
                      <span className="muted-text">{category.description || "Categorie libre"}</span>
                    </div>
                    <StatusPill tone={category.status === "active" ? "success" : "neutral"}>
                      {category.status === "active" ? "Active" : "Brouillon"}
                    </StatusPill>
                  </div>
                  <Link
                    href={`/catalogue/categories/nouveau?category=${category.slug}`}
                    className="button ghost"
                  >
                    Modifier
                  </Link>
                </article>
              ))}
              {!workspace.catalogCategories.length ? (
                <div className="empty-state">
                  <strong>Aucune categorie</strong>
                  <span>Le catalogue reste vide tant que vous ne creez rien.</span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel
            title={editingSlug ? form.name || "Categorie" : "Nouvelle categorie"}
            description="Nom obligatoire. Icone et image sont deja prevues pour de futures evolutions, sans rigidifier votre structure."
          >
            <form className="form-grid catalog-compact-form" onSubmit={handleSubmit}>
              <div className="editor-section-grid two-columns">
                <div className="field">
                  <label htmlFor="category-name">Nom</label>
                  <input
                    id="category-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex. Animation photo"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="category-icon">Icone (optionnel)</label>
                  <input
                    id="category-icon"
                    value={form.icon_name}
                    onChange={(event) => setForm((current) => ({ ...current, icon_name: event.target.value }))}
                    placeholder="Ex. camera, sparkles, truck"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="category-description">Description</label>
                <textarea
                  id="category-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Petit texte interne pour mieux organiser votre catalogue."
                />
              </div>

              <div className="field">
                <label htmlFor="category-image">Image (optionnel)</label>
                <input
                  id="category-image"
                  value={form.image_url}
                  onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="detail-card">
                <strong>Comportement</strong>
                <span className="muted-text">
                  Les produits peuvent rester sans categorie. Si vous supprimez une categorie, les produits lies sont simplement desaffectes.
                </span>
              </div>

              <div className="row-actions form-actions-bar">
                <button type="submit" className="button primary" disabled={isSubmitting}>
                  {isSubmitting ? "Enregistrement..." : editingSlug ? "Sauvegarder" : "Creer la categorie"}
                </button>
                {editingSlug ? (
                  <button type="button" className="button ghost" onClick={handleDelete} disabled={isSubmitting}>
                    Supprimer
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>

          {editingSlug ? (
            <Panel
              title="Produits de la categorie"
              description="Cette vue vous permet de verifier rapidement les produits deja relies a la categorie."
            >
              {categoryProducts.length ? (
                <div className="card-list catalog-mini-list">
                  {categoryProducts.map((product) => (
                    <article key={product.id} className="detail-card catalog-inline-card">
                      <div className="stack">
                        <strong>{product.public_name || product.name}</strong>
                        <span className="muted-text">
                          {product.public_description || "Aucune description courte"}
                        </span>
                      </div>
                      <div className="row-actions">
                        <StatusPill tone={product.online_visible ? "success" : "neutral"}>
                          {product.online_visible ? "Visible en ligne" : "Masque"}
                        </StatusPill>
                        <Link
                          href={`/catalogue/produits/nouveau?product=${product.id}&mode=edit`}
                          className="button subtle"
                        >
                          Modifier
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Aucun produit n&apos;est encore associe a cette categorie</strong>
                  <span>Ajoutez un produit puis rattachez-le directement a cette categorie.</span>
                  <Link
                    href={`/catalogue/produits/nouveau?category=${editingSlug}`}
                    className="button primary"
                  >
                    Ajouter un produit
                  </Link>
                </div>
              )}
            </Panel>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

export default function CategoryEditorPage() {
  return (
    <Suspense fallback={null}>
      <CategoryEditorPageContent />
    </Suspense>
  );
}
