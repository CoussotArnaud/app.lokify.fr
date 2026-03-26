"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import Icon from "../../components/icon";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { downloadCsv } from "../../lib/csv";
import {
  readCustomCategories,
  readProductProfiles,
} from "../../lib/workspace-store";

const buildCategoryMenu = (workspaceCategories, customCategories, products, packs) => {
  const staticEntries = [
    { id: "all", label: "Tous les produits", count: products.length },
    { id: "packs", label: "Packs", count: packs.length },
  ];

  const customEntries = customCategories.map((category) => ({
    id: category.slug,
    label: category.name,
    count: products.filter((product) => product.category_slug === category.slug).length,
  }));

  return [
    ...staticEntries,
    ...workspaceCategories.map((category) => ({
      id: category.slug,
      label: category.name,
      count: products.filter((product) => product.category_slug === category.slug).length,
    })),
    ...customEntries,
    { id: "sale", label: "Vente", count: products.filter((product) => product.catalog_mode === "sale").length },
    { id: "resale", label: "Revente", count: products.filter((product) => product.catalog_mode === "resale").length },
  ].filter((item, index, array) => array.findIndex((entry) => entry.id === item.id) === index);
};

export default function CataloguePage() {
  const workspace = useLokifyWorkspace();
  const [customCategories, setCustomCategories] = useState([]);
  const [productProfiles, setProductProfiles] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    setCustomCategories(readCustomCategories());
    setProductProfiles(readProductProfiles());
  }, []);

  const enrichedProducts = workspace.products.map((product) => {
    const profile = productProfiles[product.id] || {};
    return {
      ...product,
      profile,
      public_name: profile.public_name || product.name,
      thumbnail: profile.photos?.[0] || "",
      category_slug: profile.category_slug || product.categorySlug,
      category_label: profile.category_name || product.category,
      catalog_mode: profile.catalog_mode || "location",
      online_visible: Boolean(profile.online_visible),
      sku: profile.sku || `REF-${product.id.slice(0, 6).toUpperCase()}`,
    };
  });

  const filteredProducts = enrichedProducts.filter((product) => {
    if (selectedCategory === "packs" || selectedCategory === "all") {
      // continue
    } else if (selectedCategory === "sale" || selectedCategory === "resale") {
      if (product.catalog_mode !== selectedCategory) {
        return false;
      }
    } else if (product.category_slug !== selectedCategory) {
      return false;
    }

    if (!deferredSearch) {
      return true;
    }

    return [product.public_name, product.category_label, product.sku]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  const categoryMenu = buildCategoryMenu(workspace.categories, customCategories, enrichedProducts, workspace.packs);

  const exportCatalogue = () => {
    downloadCsv(
      "lokify-catalogue.csv",
      [
        { label: "Produit", value: (row) => row.public_name },
        { label: "Reference", value: (row) => row.sku },
        { label: "Categorie", value: (row) => row.category_label },
        { label: "Quantite", value: (row) => row.stock },
        { label: "Disponible", value: (row) => row.availableUnits },
      ],
      filteredProducts
    );
  };

  const visiblePacks = workspace.packs.filter((pack) => {
    if (selectedCategory !== "all" && selectedCategory !== "packs") {
      return false;
    }

    if (!deferredSearch) {
      return true;
    }

    return [pack.name, pack.summary].join(" ").toLowerCase().includes(deferredSearch);
  });

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header catalog-header">
          <div className="catalog-header-copy">
            <p className="eyebrow">Catalogue</p>
            <h3>Un catalogue plus large, plus clair et plus simple a parcourir.</h3>
            <p>Le menu lateral structure mieux les categories, tandis que la zone principale garde une lecture nette et utile.</p>
          </div>
          <div className="page-header-actions catalog-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => setScannerMessage("Structure scan prete : le bouton est branche pour une future lecture code-barres.")}
            >
              <Icon name="scanner" size={16} />
              Scanner
            </button>
            <Link href="/catalogue/categories/nouveau" className="button ghost">
              + Categorie
            </Link>
            <Link href="/catalogue/produits/nouveau" className="button primary">
              + Produit
            </Link>
            <button type="button" className="button secondary" onClick={() => setActionsOpen((current) => !current)}>
              Actions
            </button>
          </div>
        </div>

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}
        {scannerMessage ? <div className="inline-alert"><Icon name="scanner" size={16} />{scannerMessage}</div> : null}

        <section className="catalog-layout">
          <Panel
            title="Categories"
            description="Navigation laterale du catalogue et des futurs modes de vente."
            className="catalog-sidebar-panel"
          >
            <div className="catalog-sidebar">
              {categoryMenu.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={selectedCategory === category.id ? "active" : ""}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <strong>{category.count}</strong>
                </button>
              ))}
            </div>
          </Panel>

          <div className="page-stack">
            <Panel
              title="Recherche catalogue"
              description="Recherchez un produit, un numero ou une categorie avec plus d'espace de lecture."
            >
              <div className="stack">
                <div className="toolbar-spread">
                  <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un produit ou un numero" />
                  <StatusPill tone="info">{filteredProducts.length} produit(s)</StatusPill>
                </div>

                {actionsOpen ? (
                  <div className="toolbar-group">
                    <button type="button" className="button ghost" onClick={exportCatalogue}>
                      Exporter le catalogue
                    </button>
                    <button type="button" className="button ghost" onClick={() => setSelectedCategory("all")}>
                      Reinitialiser les filtres
                    </button>
                    <button type="button" className="button ghost" onClick={() => setSelectedCategory("packs")}>
                      Voir les packs
                    </button>
                  </div>
                ) : null}
              </div>
            </Panel>

            {selectedCategory === "all" || selectedCategory === "packs" ? (
              <Panel title="Packs" description="Une zone simple pour garder les offres composees visibles sans surcharger la page.">
                <div className="card-list">
                  {visiblePacks.map((pack) => (
                    <article key={pack.id} className="pack-card">
                      <header>
                        <div>
                          <strong>{pack.name}</strong>
                          <p className="table-subcopy">{pack.summary}</p>
                        </div>
                        <StatusPill tone={pack.status === "active" ? "success" : "warning"}>
                          {pack.status === "active" ? "Actif" : "Bientot"}
                        </StatusPill>
                      </header>
                      <div className="detail-card">
                        <strong>Produits associes</strong>
                        <span>{pack.linkedProducts.length ? pack.linkedProducts.map((product) => product.name).join(", ") : "Pack en structure"}</span>
                      </div>
                    </article>
                  ))}
                  {!visiblePacks.length ? <div className="empty-state"><strong>Aucun pack sur cette vue</strong><span>Les offres composees reapparaitront des qu'un filtre correspond.</span></div> : null}
                </div>
              </Panel>
            ) : null}

            <Panel title="Produits du catalogue" description="Image, nom, quantite, disponibilite et actions sans bruit visuel.">
              <DataTable
                rows={filteredProducts}
                emptyMessage="Aucun produit sur cette vue."
                columns={[
                  {
                    key: "product",
                    label: "Produit",
                    render: (row) => (
                      <div className="table-visual">
                        <div className="table-visual-thumb">
                          {row.thumbnail ? <img src={row.thumbnail} alt={row.public_name} /> : row.public_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="table-title">
                          <strong>{row.public_name}</strong>
                          <small>{row.sku} · {row.category_label}</small>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "quantity",
                    label: "Quantite",
                    render: (row) => row.stock,
                  },
                  {
                    key: "availability",
                    label: "Disponibilite",
                    render: (row) => (
                      <div className="table-title">
                        <strong>{row.availableUnits} libre(s)</strong>
                        <small>{row.reservedUnits} loue(s)</small>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    label: "Etat",
                    render: (row) => (
                      <StatusPill tone={row.statusMeta.tone}>{row.statusMeta.label}</StatusPill>
                    ),
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (row) => (
                      <div className="row-actions">
                        <Link href={`/catalogue/produits/nouveau?product=${row.id}`} className="action-button">
                          Voir
                        </Link>
                        <Link href={`/catalogue/produits/nouveau?product=${row.id}`} className="action-button">
                          Modifier
                        </Link>
                      </div>
                    ),
                  },
                ]}
              />
            </Panel>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
