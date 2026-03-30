"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import StatusPill from "../../../../components/status-pill";
import useLokifyWorkspace from "../../../../hooks/use-lokify-workspace";

const buildDefaultForm = () => ({
  name: "",
  description: "",
  discount_type: "none",
  discount_value: 0,
  product_ids: [],
  is_active: true,
});

const moveItem = (list, index, direction) => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) {
    return list;
  }

  const nextList = [...list];
  const [item] = nextList.splice(index, 1);
  nextList.splice(nextIndex, 0, item);
  return nextList;
};

function PackEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useLokifyWorkspace();
  const [form, setForm] = useState(buildDefaultForm());
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const editingId = searchParams.get("pack") || "";
  const pack = workspace.packs.find((entry) => entry.id === editingId) || null;

  useEffect(() => {
    if (!pack) {
      setForm(buildDefaultForm());
      return;
    }

    setForm({
      name: pack.name || "",
      description: pack.description || "",
      discount_type: pack.discount_type || "none",
      discount_value: Number(pack.discount_value || 0),
      product_ids: Array.isArray(pack.linkedProducts)
        ? pack.linkedProducts
            .slice()
            .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
            .map((product) => product.id)
        : [],
      is_active: Boolean(pack.is_active),
    });
  }, [pack]);

  const selectedProducts = useMemo(
    () =>
      form.product_ids
        .map((productId) => workspace.products.find((product) => product.id === productId))
        .filter(Boolean),
    [form.product_ids, workspace.products]
  );
  const availableProducts = workspace.products.filter((product) => !form.product_ids.includes(product.id));
  const totalPrice = selectedProducts.reduce((sum, product) => sum + Number(product.price || 0), 0);
  const discountedPrice =
    form.discount_type === "amount"
      ? Math.max(totalPrice - Number(form.discount_value || 0), 0)
      : form.discount_type === "percentage"
        ? Math.max(totalPrice - totalPrice * (Number(form.discount_value || 0) / 100), 0)
        : totalPrice;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      const response = await workspace.saveCatalogPack(
        {
          ...form,
          product_ids: form.product_ids,
          discount_value: Number(form.discount_value || 0),
        },
        editingId || null
      );
      setFeedback(editingId ? "Pack mis a jour." : "Pack cree.");

      if (!editingId) {
        const nextPackId = response?.pack?.id || response?.id;
        if (nextPackId) {
          router.replace(`/catalogue/packs/nouveau?pack=${nextPackId}`);
        }
      }
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !window.confirm("Supprimer ce pack ?")) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      await workspace.deleteCatalogPack(editingId);
      router.replace("/catalogue/packs/nouveau");
      setFeedback("Pack supprime.");
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  const handleDuplicate = async () => {
    if (!editingId) {
      return;
    }

    setError("");
    setFeedback("");

    try {
      const response = await workspace.duplicateCatalogPack(editingId);
      const nextPackId = response?.pack?.id || response?.id;
      setFeedback("Pack duplique.");
      if (nextPackId) {
        router.push(`/catalogue/packs/nouveau?pack=${nextPackId}`);
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
            <p className="eyebrow">Catalogue / Pack</p>
            <h3>{editingId ? "Modifier un pack" : "Ajouter un pack"}</h3>
            <p>Assemblez librement plusieurs produits, definissez une remise si besoin et gardez la maitrise de l'ordre d'affichage.</p>
          </div>
          <div className="page-header-actions">
            {editingId ? (
              <button type="button" className="button ghost" onClick={handleDuplicate}>
                Dupliquer le pack
              </button>
            ) : null}
            <Link href="/catalogue" className="button ghost">
              Retour au catalogue
            </Link>
          </div>
        </div>

        {error ? <p className="feedback error">{error}</p> : null}
        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <section className="catalog-editor-layout">
          <Panel
            title="Produits disponibles"
            description="Ajoutez les produits voulus dans le pack. Rien n'est pre-rempli par Lokify."
            className="catalog-editor-sidebar"
          >
            <div className="card-list catalog-mini-list">
              {availableProducts.map((product) => (
                <article key={product.id} className="detail-card catalog-inline-card">
                  <div className="stack">
                    <strong>{product.public_name || product.name}</strong>
                    <span className="muted-text">
                      {(product.category || "Sans categorie")} · {Number(product.price || 0)} €
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        product_ids: [...current.product_ids, product.id],
                      }))
                    }
                  >
                    Ajouter
                  </button>
                </article>
              ))}
              {!availableProducts.length ? (
                <div className="empty-state">
                  <strong>Aucun produit supplementaire</strong>
                  <span>Tous les produits disponibles sont deja dans ce pack.</span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel
            title={form.name || "Nouveau pack"}
            description="Le prix total et le prix remisé sont recalcules en direct."
            actions={
              <StatusPill tone={form.is_active ? "success" : "neutral"}>
                {form.is_active ? "Actif" : "Inactif"}
              </StatusPill>
            }
          >
            <form className="form-grid catalog-compact-form" onSubmit={handleSubmit}>
              <div className="editor-section-grid two-columns">
                <div className="field">
                  <label htmlFor="pack-name">Nom du pack</label>
                  <input
                    id="pack-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex. Pack salon premium"
                    required
                  />
                </div>
                <label className="detail-card">
                  <strong>Pack actif</strong>
                  <div className="row-actions">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, is_active: event.target.checked }))
                      }
                    />
                    <span className="muted-text">Affiche ou masque ce pack dans le catalogue.</span>
                  </div>
                </label>
              </div>

              <div className="field">
                <label htmlFor="pack-description">Description</label>
                <textarea
                  id="pack-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Resume commercial ou interne du pack."
                />
              </div>

              <div className="editor-section-grid two-columns">
                <div className="field">
                  <label htmlFor="discount-type">Type de remise</label>
                  <select
                    id="discount-type"
                    value={form.discount_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        discount_type: event.target.value,
                        discount_value: event.target.value === "none" ? 0 : current.discount_value,
                      }))
                    }
                  >
                    <option value="none">Aucune remise</option>
                    <option value="amount">Remise en €</option>
                    <option value="percentage">Remise en %</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="discount-value">Valeur</label>
                  <input
                    id="discount-value"
                    type="number"
                    min="0"
                    value={form.discount_value}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        discount_value: Number(event.target.value),
                      }))
                    }
                    disabled={form.discount_type === "none"}
                  />
                </div>
              </div>

              <div className="editor-section-grid two-columns">
                <div className="detail-card">
                  <strong>Prix total</strong>
                  <span className="muted-text">{totalPrice.toFixed(2)} €</span>
                </div>
                <div className="detail-card">
                  <strong>Prix remisé</strong>
                  <span className="muted-text">{discountedPrice.toFixed(2)} €</span>
                </div>
              </div>

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Produits du pack</h4>
                    <p>Vous pouvez changer l'ordre, retirer un produit, puis enregistrer.</p>
                  </div>
                </div>

                <div className="card-list catalog-mini-list">
                  {selectedProducts.map((product, index) => (
                    <article key={product.id} className="detail-card catalog-inline-card">
                      <div className="stack">
                        <strong>{product.public_name || product.name}</strong>
                        <span className="muted-text">
                          {(product.category || "Sans categorie")} · {Number(product.price || 0)} €
                        </span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              product_ids: moveItem(current.product_ids, index, -1),
                            }))
                          }
                          disabled={index === 0}
                        >
                          Monter
                        </button>
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              product_ids: moveItem(current.product_ids, index, 1),
                            }))
                          }
                          disabled={index === selectedProducts.length - 1}
                        >
                          Descendre
                        </button>
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              product_ids: current.product_ids.filter((productId) => productId !== product.id),
                            }))
                          }
                        >
                          Retirer
                        </button>
                      </div>
                    </article>
                  ))}
                  {!selectedProducts.length ? (
                    <div className="empty-state">
                      <strong>Aucun produit dans ce pack</strong>
                      <span>Ajoutez des produits depuis la colonne de gauche.</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="row-actions form-actions-bar">
                <button type="submit" className="button primary" disabled={workspace.mutating}>
                  {workspace.mutating ? "Enregistrement..." : editingId ? "Sauvegarder le pack" : "Creer le pack"}
                </button>
                {editingId ? (
                  <button type="button" className="button ghost" onClick={handleDelete} disabled={workspace.mutating}>
                    Supprimer
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}

export default function PackEditorPage() {
  return (
    <Suspense fallback={null}>
      <PackEditorPageContent />
    </Suspense>
  );
}
