"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Icon from "../../../../components/icon";
import Panel from "../../../../components/panel";
import StatusPill from "../../../../components/status-pill";
import { useAuth } from "../../../../components/auth-provider";
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

const normalizeText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const clampSeoText = (value, maxLength) => {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`;
};

const buildCategoryMetaTitle = ({ name = "", providerName = "", providerCity = "" } = {}) => {
  const categoryLabel = normalizeText(name) || "Categorie";
  const cityLabel = normalizeText(providerCity);
  const providerLabel = normalizeText(providerName);
  const locationLabel = cityLabel ? `Location a ${cityLabel}` : "Location";

  return clampSeoText(
    `${categoryLabel} - ${locationLabel}${providerLabel ? ` | ${providerLabel}` : ""}`,
    65
  );
};

const buildCategoryMetaDescription = ({
  name = "",
  description = "",
  providerName = "",
  providerCity = "",
} = {}) => {
  const descriptionText = normalizeText(description);
  if (descriptionText) {
    return clampSeoText(descriptionText, 155);
  }

  const categoryLabel = normalizeText(name) || "Cette categorie";
  const cityLabel = normalizeText(providerCity);
  const providerLabel = normalizeText(providerName);

  return clampSeoText(
    [
      `${categoryLabel} disponible a la location`,
      cityLabel ? `a ${cityLabel}` : "",
      providerLabel ? `chez ${providerLabel}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    155
  );
};

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
    kind: kind === "banner" ? "logo" : kind || "gallery",
    alt_text: String(entry.alt_text || entry.altText || "").trim(),
  };
};

const normalizeCategoryImages = (
  images = [],
  imageUrl = "",
  imageAltText = "",
  logoImageUrl = "",
  legacyBannerImageUrl = ""
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

  const resolvedLogoUrl = logoImageUrl || legacyBannerImageUrl;

  if (resolvedLogoUrl && !normalizedImages.some((entry) => entry.kind === "logo")) {
    normalizedImages.push({
      url: resolvedLogoUrl,
      kind: "logo",
      alt_text: "",
    });
  }

  return normalizedImages;
};

const buildCategoryImageByKind = (images = [], kind) =>
  (Array.isArray(images) ? images : []).find((entry) => entry?.kind === kind) || null;

const buildDefaultForm = () => ({
  name: "",
  description: "",
  image_url: "",
  logo_image_url: "",
  image_alt_text: "",
  meta_title: "",
  meta_description: "",
  images: [],
});

const buildFormFromCategory = (category, seoContext = {}) => {
  if (!category) {
    const emptyForm = buildDefaultForm();
    return {
      ...emptyForm,
      meta_title: buildCategoryMetaTitle({
        name: emptyForm.name,
        providerName: seoContext.providerName,
        providerCity: seoContext.providerCity,
      }),
      meta_description: buildCategoryMetaDescription({
        name: emptyForm.name,
        description: emptyForm.description,
        providerName: seoContext.providerName,
        providerCity: seoContext.providerCity,
      }),
    };
  }

  const images = normalizeCategoryImages(
    category.images,
    category.image_url || "",
    category.image_alt_text || "",
    category.logo_image_url || "",
    category.banner_image_url || ""
  );

  const nextForm = {
    name: category.name || "",
    description: category.description || "",
    image_url: category.image_url || buildCategoryImageByKind(images, "thumbnail")?.url || "",
    logo_image_url:
      category.logo_image_url ||
      category.banner_image_url ||
      buildCategoryImageByKind(images, "logo")?.url ||
      "",
    image_alt_text: category.image_alt_text || "",
    meta_title: category.meta_title || "",
    meta_description: category.meta_description || "",
    images,
  };

  return {
    ...nextForm,
    meta_title:
      nextForm.meta_title ||
      buildCategoryMetaTitle({
        name: nextForm.name,
        providerName: seoContext.providerName,
        providerCity: seoContext.providerCity,
      }),
    meta_description:
      nextForm.meta_description ||
      buildCategoryMetaDescription({
        name: nextForm.name,
        description: nextForm.description,
        providerName: seoContext.providerName,
        providerCity: seoContext.providerCity,
      }),
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

function InfoHint({ text }) {
  return (
    <span className="inline-info" tabIndex={0} title={text} aria-label={text}>
      <Icon name="info" size={14} />
    </span>
  );
}

function CategoryEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const workspace = useLokifyWorkspace();
  const primaryImageInputRef = useRef(null);
  const logoImageInputRef = useRef(null);
  const [form, setForm] = useState(buildDefaultForm());
  const [pendingPrimaryImage, setPendingPrimaryImage] = useState(null);
  const [pendingLogoImage, setPendingLogoImage] = useState(null);
  const [seoEdited, setSeoEdited] = useState({
    metaTitle: false,
    metaDescription: false,
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editingSlug = searchParams.get("category") || "";
  const editingCategory =
    workspace.catalogCategories.find((category) => category.slug === editingSlug) || null;
  const categoryProducts = workspace.products.filter((product) => product.categorySlug === editingSlug);
  const providerName =
    user?.company_name || user?.commercial_name || user?.full_name || "votre boutique";
  const providerCity = user?.city || "";
  const generatedSlug = slugifyLabel(form.name);
  const normalizedFormImages = normalizeCategoryImages(
    form.images,
    form.image_url,
    form.image_alt_text,
    form.logo_image_url
  );
  const currentPrimaryImage =
    buildCategoryImageByKind(normalizedFormImages, "thumbnail") ||
    normalizedFormImages.find((image) => image.kind !== "logo") ||
    null;
  const currentLogoImage = buildCategoryImageByKind(normalizedFormImages, "logo");
  const autoMetaTitle = buildCategoryMetaTitle({
    name: form.name,
    providerName,
    providerCity,
  });
  const autoMetaDescription = buildCategoryMetaDescription({
    name: form.name,
    description: form.description,
    providerName,
    providerCity,
  });
  const isBusy = isSubmitting;

  const getCategoryErrorMessage = (submissionError) => {
    if (submissionError?.code === "network_error") {
      return "La categorie n'a pas pu etre enregistree. Verifiez la connexion puis reessayez.";
    }

    return submissionError?.message || "La categorie n'a pas pu etre enregistree.";
  };

  useEffect(() => {
    const nextForm = buildFormFromCategory(editingCategory, {
      providerName,
      providerCity,
    });
    const nextAutoMetaTitle = buildCategoryMetaTitle({
      name: nextForm.name,
      providerName,
      providerCity,
    });
    const nextAutoMetaDescription = buildCategoryMetaDescription({
      name: nextForm.name,
      description: nextForm.description,
      providerName,
      providerCity,
    });

    setForm(nextForm);
    setPendingPrimaryImage(null);
    setPendingLogoImage(null);
    setSeoEdited({
      metaTitle: Boolean(nextForm.meta_title && nextForm.meta_title !== nextAutoMetaTitle),
      metaDescription: Boolean(
        nextForm.meta_description && nextForm.meta_description !== nextAutoMetaDescription
      ),
    });
  }, [editingCategory, providerCity, providerName]);

  useEffect(() => {
    setForm((current) => {
      let updated = false;
      let nextForm = current;

      if (!seoEdited.metaTitle && current.meta_title !== autoMetaTitle) {
        nextForm = {
          ...nextForm,
          meta_title: autoMetaTitle,
        };
        updated = true;
      }

      if (!seoEdited.metaDescription && current.meta_description !== autoMetaDescription) {
        nextForm = {
          ...nextForm,
          meta_description: autoMetaDescription,
        };
        updated = true;
      }

      return updated ? nextForm : current;
    });
  }, [autoMetaDescription, autoMetaTitle, seoEdited.metaDescription, seoEdited.metaTitle]);

  const setValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleMetaFieldChange = (key, value) => {
    setSeoEdited((current) => ({
      ...current,
      [key === "meta_title" ? "metaTitle" : "metaDescription"]: true,
    }));
    setValue(key, value);
  };

  const resetSeoSuggestions = () => {
    setSeoEdited({
      metaTitle: false,
      metaDescription: false,
    });
    setForm((current) => ({
      ...current,
      meta_title: buildCategoryMetaTitle({
        name: current.name,
        providerName,
        providerCity,
      }),
      meta_description: buildCategoryMetaDescription({
        name: current.name,
        description: current.description,
        providerName,
        providerCity,
      }),
    }));
  };

  const openImagePicker = (kind) => {
    if (kind === "logo") {
      logoImageInputRef.current?.click();
      return;
    }

    primaryImageInputRef.current?.click();
  };

  const handleChooseImage = async (files, kind) => {
    const selectedFile = Array.from(files || [])[0];

    if (!selectedFile) {
      return;
    }

    setError("");

    try {
      const preparedImage = await prepareCatalogImage(selectedFile);
      if (kind === "logo") {
        setPendingLogoImage(preparedImage);
        setFeedback("Logo pret a etre enregistre.");
      } else {
        setPendingPrimaryImage(preparedImage);
        setFeedback("Image principale prete a etre enregistree.");
      }
    } catch (submissionError) {
      if (kind === "logo") {
        setPendingLogoImage(null);
      } else {
        setPendingPrimaryImage(null);
      }
      setFeedback("");
      setError(buildImageUploadErrorMessage(submissionError));
    }
  };

  const handleRemoveImage = (kind) => {
    if (kind === "logo") {
      setPendingLogoImage(null);
      setForm((current) => ({
        ...current,
        logo_image_url: "",
        images: current.images.filter((image) => image.kind !== "logo"),
      }));
      setFeedback("Logo retire de la categorie.");
      setError("");
      return;
    }

    setPendingPrimaryImage(null);
    setForm((current) => ({
      ...current,
      image_url: "",
      images: current.images.filter((image) => image.kind !== "thumbnail"),
    }));
    setFeedback("Image principale retiree de la categorie.");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");
    setIsSubmitting(true);

    try {
      const retainedImages = normalizeCategoryImages(
        form.images,
        form.image_url,
        form.image_alt_text,
        form.logo_image_url
      ).filter((image) => {
        if (pendingPrimaryImage && image.kind === "thumbnail") {
          return false;
        }

        if (pendingLogoImage && image.kind === "logo") {
          return false;
        }

        return true;
      });
      const response = await apiRequest("/catalog/categories", {
        method: "POST",
        body: {
          original_slug: editingSlug || "",
          slug: generatedSlug,
          name: form.name,
          description: form.description,
          meta_title: form.meta_title,
          meta_description: form.meta_description,
          image_url:
            retainedImages.find((image) => image.kind === "thumbnail")?.url ||
            retainedImages.find((image) => image.kind !== "logo")?.url ||
            "",
          logo_image_url: retainedImages.find((image) => image.kind === "logo")?.url || "",
          image_alt_text: form.image_alt_text,
          images: retainedImages.map((image) => ({
            url: image.url,
            kind: image.kind,
            alt_text: image.kind === "thumbnail" ? form.image_alt_text : image.alt_text || "",
          })),
          filters: [],
          durations: [],
          ranges: [],
          inspection_enabled: false,
          status: "active",
          image_uploads: [
            pendingPrimaryImage
              ? {
                  data_url: pendingPrimaryImage.dataUrl,
                  file_name: pendingPrimaryImage.fileName,
                  kind: "thumbnail",
                  alt_text: form.image_alt_text,
                }
              : null,
            pendingLogoImage
              ? {
                  data_url: pendingLogoImage.dataUrl,
                  file_name: pendingLogoImage.fileName,
                  kind: "logo",
                  alt_text: "",
                }
              : null,
          ].filter(Boolean),
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
                message: "La categorie a ete creee mais certaines images n'ont pas pu etre envoyees",
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
        setForm(
          buildFormFromCategory(savedCategory, {
            providerName,
            providerCity,
          })
        );
      }

      setPendingPrimaryImage(null);
      setPendingLogoImage(null);
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
              Un formulaire simple pour organiser votre catalogue, preparer Google et gerer les
              visuels sans jargon technique.
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
                const sidebarImages = normalizeCategoryImages(
                  category.images,
                  category.image_url || "",
                  category.image_alt_text || "",
                  category.logo_image_url || "",
                  category.banner_image_url || ""
                );
                const sidebarImage =
                  buildCategoryImageByKind(sidebarImages, "logo") ||
                  buildCategoryImageByKind(sidebarImages, "thumbnail") ||
                  null;

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
            description="Nom, description, visuels et Google: tout est guide automatiquement pour rester simple."
          >
            <form className="form-grid catalog-compact-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="category-name">Nom de la categorie</label>
                <input
                  id="category-name"
                  value={form.name}
                  onChange={(event) => setValue("name", event.target.value)}
                  placeholder="Ex. Photobooth mariage"
                  required
                />
                <p className="field-hint">
                  Le lien de la categorie est cree automatiquement a partir du nom
                  {generatedSlug ? ` : ${generatedSlug}` : "."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="category-description">Description</label>
                <textarea
                  id="category-description"
                  value={form.description}
                  onChange={(event) => setValue("description", event.target.value)}
                  placeholder="Expliquez simplement ce que les clients trouveront dans cette categorie."
                />
              </div>

              <div className="field">
                <label htmlFor="category-image-alt">Description de l'image (pour Google)</label>
                <input
                  id="category-image-alt"
                  value={form.image_alt_text}
                  onChange={(event) => setValue("image_alt_text", event.target.value)}
                  placeholder="Ex. Photobooth mariage avec impression instantanee"
                />
                <p className="field-hint">
                  Decrivez l'image pour ameliorer votre referencement (ex : Photobooth mariage
                  avec impression instantanee)
                </p>
              </div>

              <div className="editor-section-grid two-columns">
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>Image principale</h4>
                      <p>Utilisee pour representer la categorie dans votre catalogue.</p>
                    </div>
                  </div>

                  <div className="row-actions form-actions-bar">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => openImagePicker("thumbnail")}
                      disabled={isBusy}
                    >
                      {currentPrimaryImage || pendingPrimaryImage ? "Remplacer l'image" : "Ajouter une image"}
                    </button>
                    {currentPrimaryImage || pendingPrimaryImage ? (
                      <button
                        type="button"
                        className="button subtle"
                        onClick={() => handleRemoveImage("thumbnail")}
                        disabled={isBusy}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>

                  <input
                    ref={primaryImageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      void handleChooseImage(event.target.files, "thumbnail");
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
                            Visible dans votre catalogue.
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {pendingPrimaryImage ? (
                      <div className="thumbnail-card">
                        <div className="thumbnail-media">
                          <img src={pendingPrimaryImage.previewUrl} alt={pendingPrimaryImage.fileName} />
                        </div>
                        <div className="stack">
                          <strong>Nouvelle image</strong>
                          <span className="muted-text">
                            {pendingPrimaryImage.width} x {pendingPrimaryImage.height} px -{" "}
                            {formatCatalogImageSize(pendingPrimaryImage.sizeBytes)}
                          </span>
                          <span className="muted-text">
                            Elle remplacera l'image principale apres enregistrement.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() => setPendingPrimaryImage(null)}
                        >
                          Retirer
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!currentPrimaryImage && !pendingPrimaryImage ? (
                    <div className="empty-state">
                      <strong>Aucune image principale</strong>
                      <span>Ajoutez une image claire pour rendre la categorie plus facile a comprendre.</span>
                    </div>
                  ) : null}
                </div>

                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>Logo de la categorie (facultatif)</h4>
                      <p>Petit visuel affiche dans le catalogue pour reperer la categorie plus vite.</p>
                    </div>
                  </div>

                  <div className="row-actions form-actions-bar">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => openImagePicker("logo")}
                      disabled={isBusy}
                    >
                      {currentLogoImage || pendingLogoImage ? "Remplacer le logo" : "Ajouter un logo"}
                    </button>
                    {currentLogoImage || pendingLogoImage ? (
                      <button
                        type="button"
                        className="button subtle"
                        onClick={() => handleRemoveImage("logo")}
                        disabled={isBusy}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>

                  <input
                    ref={logoImageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      void handleChooseImage(event.target.files, "logo");
                      event.target.value = "";
                    }}
                  />

                  <p className="field-hint">
                    Format image uniquement. Le logo reste facultatif.
                  </p>

                  <div className="thumbnail-grid">
                    {currentLogoImage ? (
                      <div className="thumbnail-card">
                        <div className="thumbnail-media">
                          <img src={currentLogoImage.url} alt={form.name || "Logo categorie"} />
                        </div>
                        <div className="stack">
                          <strong>Logo actuel</strong>
                          <span className="muted-text">Utilise comme petit repere visuel.</span>
                        </div>
                      </div>
                    ) : null}

                    {pendingLogoImage ? (
                      <div className="thumbnail-card">
                        <div className="thumbnail-media">
                          <img src={pendingLogoImage.previewUrl} alt={pendingLogoImage.fileName} />
                        </div>
                        <div className="stack">
                          <strong>Nouveau logo</strong>
                          <span className="muted-text">
                            {pendingLogoImage.width} x {pendingLogoImage.height} px -{" "}
                            {formatCatalogImageSize(pendingLogoImage.sizeBytes)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() => setPendingLogoImage(null)}
                        >
                          Retirer
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!currentLogoImage && !pendingLogoImage ? (
                    <div className="empty-state">
                      <strong>Aucun logo</strong>
                      <span>Ce champ est optionnel. Vous pouvez le laisser vide.</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <details className="section-block catalog-seo-details">
                <summary>
                  <span>SEO (optionnel)</span>
                  <small>Pre-rempli automatiquement</small>
                </summary>

                <div className="editor-section-grid">
                  <div className="field">
                    <div className="field-label-row">
                      <label htmlFor="category-meta-title">Meta titre (Google)</label>
                      <InfoHint text="Le titre affiche sur Google. Il influence directement le nombre de clics sur votre page." />
                    </div>
                    <input
                      id="category-meta-title"
                      value={form.meta_title}
                      onChange={(event) => handleMetaFieldChange("meta_title", event.target.value)}
                      placeholder={autoMetaTitle}
                    />
                  </div>

                  <div className="field">
                    <div className="field-label-row">
                      <label htmlFor="category-meta-description">Meta description (Google)</label>
                      <InfoHint text="Texte affiche sous le titre sur Google. Il donne envie aux clients de cliquer sur votre page." />
                    </div>
                    <textarea
                      id="category-meta-description"
                      value={form.meta_description}
                      onChange={(event) =>
                        handleMetaFieldChange("meta_description", event.target.value)
                      }
                      placeholder={autoMetaDescription}
                    />
                  </div>

                  <div className="row-actions">
                    <button type="button" className="button subtle" onClick={resetSeoSuggestions}>
                      Revenir aux suggestions automatiques
                    </button>
                  </div>
                </div>
              </details>

              <div className="detail-card">
                <strong>Comportement</strong>
                <span className="muted-text">
                  Les produits peuvent rester sans categorie. Si vous supprimez une categorie, les
                  produits lies sont simplement retires de cette categorie.
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
