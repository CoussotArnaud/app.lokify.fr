"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import StatusPill from "../../../../components/status-pill";
import useLokifyWorkspace from "../../../../hooks/use-lokify-workspace";
import { apiRequest } from "../../../../lib/api";
import {
  MAX_CATALOG_IMAGE_SIZE_BYTES,
  MIN_CATALOG_IMAGE_HEIGHT,
  MIN_CATALOG_IMAGE_WIDTH,
  formatCatalogImageSize,
  prepareCatalogImage,
} from "../../../../lib/catalog-image";
import { setFlashMessage } from "../../../../lib/flash-message";
import { slugifyLabel } from "../../../../lib/workspace-store";

const buildCategoryImageEntry = (entry) => {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    return entry ? { url: entry, kind: "gallery", alt_text: "" } : null;
  }

  const url = String(entry.url || entry.image_url || entry.imageUrl || "").trim();
  if (!url) {
    return null;
  }

  const kind = String(entry.kind || entry.image_kind || entry.imageKind || "gallery")
    .trim()
    .toLowerCase();

  return {
    url,
    kind: kind || "gallery",
    alt_text: String(entry.alt_text || entry.altText || "").trim(),
  };
};

const normalizeCategoryImages = (
  images = [],
  imageUrl = "",
  imageAltText = "",
  bannerImageUrl = ""
) => {
  const seen = new Set();
  const normalizedImages = [];

  (Array.isArray(images) ? images : []).forEach((entry) => {
    const normalizedEntry = buildCategoryImageEntry(entry);
    if (!normalizedEntry) {
      return;
    }

    const key = `${normalizedEntry.kind}:${normalizedEntry.url}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalizedImages.push(normalizedEntry);
  });

  if (imageUrl && !normalizedImages.some((entry) => entry.kind === "thumbnail")) {
    normalizedImages.unshift({
      url: imageUrl,
      kind: "thumbnail",
      alt_text: imageAltText,
    });
  }

  if (bannerImageUrl && !normalizedImages.some((entry) => entry.kind === "banner")) {
    normalizedImages.push({
      url: bannerImageUrl,
      kind: "banner",
      alt_text: imageAltText,
    });
  }

  return normalizedImages;
};

const buildPrimaryCategoryImage = (
  images = [],
  imageUrl = "",
  imageAltText = "",
  bannerImageUrl = ""
) => {
  const normalizedImages = normalizeCategoryImages(
    images,
    imageUrl,
    imageAltText,
    bannerImageUrl
  );

  return (
    normalizedImages.find((entry) => entry.kind === "thumbnail") ||
    normalizedImages.find((entry) => entry.kind !== "banner") ||
    null
  );
};

const buildDefaultForm = () => ({
  name: "",
  slug: "",
  description: "",
  icon_name: "",
  image_url: "",
  image_alt_text: "",
  banner_image_url: "",
  images: [],
});

const buildFormFromCategory = (category) => {
  if (!category) {
    return buildDefaultForm();
  }

  return {
    name: category.name || "",
    slug: category.slug || "",
    description: category.description || "",
    icon_name: category.icon_name || "",
    image_url: category.image_url || "",
    image_alt_text: category.image_alt_text || "",
    banner_image_url: category.banner_image_url || "",
    images: normalizeCategoryImages(
      category.images,
      category.image_url || "",
      category.image_alt_text || "",
      category.banner_image_url || ""
    ),
  };
};

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

const buildCategoryImageWarning = (imageUploadFailures = [], keptExistingImages = false) => {
  if (!Array.isArray(imageUploadFailures) || !imageUploadFailures.length) {
    return "";
  }

  const baseMessage =
    imageUploadFailures.length === 1
      ? buildImageUploadErrorMessage(imageUploadFailures[0])
      : "Certaines images n'ont pas pu etre envoyees.";

  return keptExistingImages
    ? `${baseMessage} L'image deja presente a ete conservee.`
    : baseMessage;
};

function CategoryEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useLokifyWorkspace();
  const imageInputRef = useRef(null);
  const [form, setForm] = useState(buildDefaultForm());
  const [pendingImage, setPendingImage] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editingSlug = searchParams.get("category") || "";
  const editingCategory =
    workspace.catalogCategories.find((category) => category.slug === editingSlug) || null;
  const categoryProducts = workspace.products.filter((product) => product.categorySlug === editingSlug);
  const currentPrimaryImage = buildPrimaryCategoryImage(
    form.images,
    form.image_url,
    form.image_alt_text,
    form.banner_image_url
  );
  const isBusy = isSubmitting;

  const getCategoryErrorMessage = (submissionError) => {
    if (submissionError?.code === "network_error") {
      return "La categorie n'a pas pu etre enregistree. Verifiez la connexion puis reessayez.";
    }

    return submissionError?.message || "La categorie n'a pas pu etre enregistree.";
  };

  useEffect(() => {
    setForm(buildFormFromCategory(editingCategory));
    setPendingImage(null);
  }, [editingCategory]);

  const setValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openImagePicker = () => {
    imageInputRef.current?.click();
  };

  const handleChooseImage = async (files) => {
    const selectedFile = Array.from(files || [])[0];

    if (!selectedFile) {
      return;
    }

    setError("");

    try {
      const preparedImage = await prepareCatalogImage(selectedFile);
      setPendingImage(preparedImage);
      setFeedback("Image prete a etre envoyee lors de l'enregistrement.");
    } catch (submissionError) {
      setPendingImage(null);
      setFeedback("");
      setError(buildImageUploadErrorMessage(submissionError));
    }
  };

  const handleRemoveImage = () => {
    setPendingImage(null);
    setForm((current) => ({
      ...current,
      image_url: "",
      images: current.images.filter((image) => image.kind !== "thumbnail"),
    }));
    setFeedback("Image retiree de la categorie.");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");
    setIsSubmitting(true);

    try {
      const slug = slugifyLabel(form.slug || form.name);
      const retainedImages = pendingImage
        ? form.images.filter((image) => image.kind !== "thumbnail")
        : normalizeCategoryImages(
            form.images,
            form.image_url,
            form.image_alt_text,
            form.banner_image_url
          );
      const response = await apiRequest("/catalog/categories", {
        method: "POST",
        body: {
          original_slug: editingSlug || "",
          slug,
          name: form.name,
          description: form.description,
          icon_name: form.icon_name,
          image_url:
            retainedImages.find((image) => image.kind === "thumbnail")?.url ||
            retainedImages.find((image) => image.kind !== "banner")?.url ||
            "",
          image_alt_text: form.image_alt_text,
          banner_image_url: form.banner_image_url,
          images: retainedImages.map((image) => ({
            url: image.url,
            kind: image.kind,
            alt_text:
              image.kind === "thumbnail" ? form.image_alt_text : image.alt_text || "",
          })),
          filters: [],
          durations: [],
          ranges: [],
          inspection_enabled: false,
          status: "active",
          image_uploads: pendingImage
            ? [
                {
                  data_url: pendingImage.dataUrl,
                  file_name: pendingImage.fileName,
                  kind: "thumbnail",
                  alt_text: form.image_alt_text,
                },
              ]
            : [],
        },
      });

      const savedCategory = response?.category || null;
      const imageWarning = buildCategoryImageWarning(
        response?.imageUploadFailures,
        response?.keptExistingImages
      );

      if (!editingSlug) {
        setFlashMessage(
          imageWarning
            ? {
                type: "error",
                message: "La categorie a ete creee mais l'image n'a pas pu etre envoyee",
              }
            : {
                type: "success",
                message: "Categorie creee avec succes",
              }
        );
        router.replace("/catalogue");
        return;
      }

      if (savedCategory) {
        setForm(buildFormFromCategory(savedCategory));
      }

      setPendingImage(null);
      await workspace.reload();

      if (imageWarning) {
        setFeedback("Categorie mise a jour.");
        setError(imageWarning);
        return;
      }

      setFeedback("Categorie mise a jour.");
    } catch (submissionError) {
      setError(getCategoryErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingSlug || !window.confirm("Supprimer cette categorie et retirer son affectation des produits ?")) {
      return;
    }

    setError("");
    setFeedback("");
    setIsSubmitting(true);

    try {
      await apiRequest(`/catalog/categories/${encodeURIComponent(editingSlug)}`, {
        method: "DELETE",
      });
      setFlashMessage({ type: "success", message: "Categorie supprimee." });
      router.replace("/catalogue");
    } catch (submissionError) {
      setError(getCategoryErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
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
            <p>
              La categorie garde une structure simple, mais son image suit maintenant la meme logique
              R2 que les produits pour rester coherente et evolutive.
            </p>
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
              {workspace.catalogCategories.map((category) => {
                const sidebarImage = buildPrimaryCategoryImage(
                  category.images,
                  category.image_url || "",
                  category.image_alt_text || "",
                  category.banner_image_url || ""
                );

                return (
                  <article key={category.slug} className="detail-card catalog-inline-card">
                    <div className="row-actions catalog-inline-card-head">
                      <div className="catalog-category-inline-media">
                        {sidebarImage ? (
                          <img
                            src={sidebarImage.url}
                            alt={sidebarImage.alt_text || category.name}
                          />
                        ) : (
                          <span>{String(category.name || "LK").slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
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
                );
              })}
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
            description="Slug propre, image principale R2, alt SEO et structure prete pour plusieurs images sans alourdir l'edition."
          >
            <form className="form-grid catalog-compact-form" onSubmit={handleSubmit}>
              <div className="editor-section-grid two-columns">
                <div className="field">
                  <label htmlFor="category-name">Nom</label>
                  <input
                    id="category-name"
                    value={form.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name: nextName,
                        slug:
                          editingSlug || (current.slug && current.slug !== slugifyLabel(current.name))
                            ? current.slug
                            : slugifyLabel(nextName),
                      }));
                    }}
                    placeholder="Ex. Animation photo"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="category-slug">Slug</label>
                  <input
                    id="category-slug"
                    value={form.slug}
                    onChange={(event) => setValue("slug", slugifyLabel(event.target.value))}
                    placeholder="animation-photo"
                    required
                  />
                </div>
              </div>

              <div className="editor-section-grid two-columns">
                <div className="field">
                  <label htmlFor="category-icon">Icone (optionnel)</label>
                  <input
                    id="category-icon"
                    value={form.icon_name}
                    onChange={(event) => setValue("icon_name", event.target.value)}
                    placeholder="Ex. camera, sparkles, truck"
                  />
                </div>
                <div className="field">
                  <label htmlFor="category-image-alt">Alt image (SEO)</label>
                  <input
                    id="category-image-alt"
                    value={form.image_alt_text}
                    onChange={(event) => setValue("image_alt_text", event.target.value)}
                    placeholder="Ex. Borne photo premium pour evenement"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="category-description">Description</label>
                <textarea
                  id="category-description"
                  value={form.description}
                  onChange={(event) => setValue("description", event.target.value)}
                  placeholder="Petit texte interne pour mieux organiser votre catalogue."
                />
              </div>

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Image principale</h4>
                    <p>
                      Meme validation et meme pipeline serveur que les produits: WebP, R2, URL
                      uniquement en base.
                    </p>
                  </div>
                </div>

                <div className="row-actions form-actions-bar">
                  <button type="button" className="button ghost" onClick={openImagePicker} disabled={isBusy}>
                    {currentPrimaryImage || pendingImage ? "Remplacer l'image" : "Ajouter une image"}
                  </button>
                  {currentPrimaryImage || pendingImage ? (
                    <button type="button" className="button subtle" onClick={handleRemoveImage} disabled={isBusy}>
                      Supprimer l'image
                    </button>
                  ) : null}
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    void handleChooseImage(event.target.files);
                    event.target.value = "";
                  }}
                />

                <p className="field-hint">
                  JPG, PNG ou WebP. Taille max {Math.round(MAX_CATALOG_IMAGE_SIZE_BYTES / (1024 * 1024))} Mo.
                  Dimensions minimales {MIN_CATALOG_IMAGE_WIDTH} x {MIN_CATALOG_IMAGE_HEIGHT} px.
                </p>

                <div className="thumbnail-grid">
                  {currentPrimaryImage ? (
                    <div className="thumbnail-card">
                      <div className="thumbnail-media">
                        <img
                          src={currentPrimaryImage.url}
                          alt={currentPrimaryImage.alt_text || form.name || "Categorie"}
                        />
                      </div>
                      <div className="stack">
                        <strong>Image actuelle</strong>
                        <span className="muted-text">
                          Hebergee sur R2 et utilisee comme image principale du catalogue.
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {pendingImage ? (
                    <div className="thumbnail-card">
                      <div className="thumbnail-media">
                        <img src={pendingImage.previewUrl} alt={pendingImage.fileName} />
                      </div>
                      <div className="stack">
                        <strong>Nouvelle image</strong>
                        <span className="muted-text">
                          {pendingImage.width} x {pendingImage.height} px -{" "}
                          {formatCatalogImageSize(pendingImage.sizeBytes)}
                        </span>
                        <span className="muted-text">
                          Elle remplacera l'image principale lors de l'enregistrement.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button subtle"
                        onClick={() => setPendingImage(null)}
                      >
                        Retirer
                      </button>
                    </div>
                  ) : null}
                </div>

                {!currentPrimaryImage && !pendingImage ? (
                  <div className="empty-state">
                    <strong>Aucune image principale</strong>
                    <span>
                      La structure supporte deja plusieurs images et une future banniere, mais seule
                      l'image principale est exposee ici pour le moment.
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="detail-card">
                <strong>Comportement</strong>
                <span className="muted-text">
                  Les produits peuvent rester sans categorie. Si vous supprimez une categorie, les
                  produits lies sont simplement desaffectes.
                </span>
              </div>

              <div className="row-actions form-actions-bar">
                <button type="submit" className="button primary" disabled={isBusy}>
                  {isBusy ? "Enregistrement..." : editingSlug ? "Sauvegarder" : "Creer la categorie"}
                </button>
                {editingSlug ? (
                  <button type="button" className="button ghost" onClick={handleDelete} disabled={isBusy}>
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
