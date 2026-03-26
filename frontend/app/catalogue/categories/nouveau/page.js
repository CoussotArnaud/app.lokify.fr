"use client";

import Link from "next/link";
import { useState } from "react";

import AppShell from "../../../../components/app-shell";
import Panel from "../../../../components/panel";
import StatusPill from "../../../../components/status-pill";
import { categoryBlueprints } from "../../../../lib/lokify-data";
import { saveCustomCategory, slugifyLabel } from "../../../../lib/workspace-store";

const buildDefaultForm = () => ({
  type: "Evenementiel",
  name: "",
  filters: ["format"],
  inspectionEnabled: true,
  durations: [{ label: "Journee", hours: 10 }],
  ranges: [{ label: "Week-end", minHours: 24, maxHours: 48 }],
});

export default function NewCategoryPage() {
  const [form, setForm] = useState(buildDefaultForm());
  const [feedback, setFeedback] = useState("");

  const updateFilter = (index, value) => {
    setForm((current) => ({
      ...current,
      filters: current.filters.map((filter, filterIndex) => (filterIndex === index ? value : filter)),
    }));
  };

  const updateListValue = (collection, index, field, value) => {
    setForm((current) => ({
      ...current,
      [collection]: current[collection].map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              [field]:
                field === "hours" || field === "minHours" || field === "maxHours"
                  ? Number(value)
                  : value,
            }
          : entry
      ),
    }));
  };

  const applyBlueprint = (blueprintId) => {
    const blueprint = categoryBlueprints.find((entry) => entry.id === blueprintId);
    if (!blueprint) {
      return;
    }

    setForm({
      type: blueprint.type,
      name: blueprint.name,
      filters: [...blueprint.filters],
      inspectionEnabled: blueprint.inspectionEnabled,
      durations: blueprint.durations.map((duration) => ({ ...duration })),
      ranges: blueprint.ranges.map((range) => ({ ...range })),
    });
    setFeedback("Modele applique pour accelerer la configuration.");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    saveCustomCategory({
      id: slugifyLabel(form.name),
      slug: slugifyLabel(form.name),
      name: form.name,
      type: form.type,
      description: `${form.name} · categorie configuree dans Lokify.`,
      filters: form.filters.filter(Boolean),
      inspectionEnabled: form.inspectionEnabled,
      durations: form.durations.filter((duration) => duration.label),
      ranges: form.ranges.filter((range) => range.label),
      status: "active",
    });

    setFeedback("Categorie enregistree. Elle est maintenant prete a apparaitre dans le catalogue.");
  };

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Creation categorie</p>
            <h3>Une configuration simple, lisible et deja raccordee au catalogue.</h3>
            <p>On garde la richesse metier utile, mais sans effet usine a gaz ni surcharge visuelle.</p>
          </div>
          <div className="page-header-actions">
            <Link href="/catalogue" className="button ghost">
              Retour au catalogue
            </Link>
          </div>
        </div>

        {feedback ? <p className="feedback success">{feedback}</p> : null}

        <section className="split-layout split-2-1">
          <Panel
            title="Modeles Lokify"
            description="Des bases propres pour gagner du temps sur les categories recurrentes."
            className="sticky-panel"
          >
            <div className="card-list">
              {categoryBlueprints.map((blueprint) => (
                <article key={blueprint.id} className="category-card">
                  <header>
                    <div>
                      <strong>{blueprint.name}</strong>
                      <p className="table-subcopy">{blueprint.description}</p>
                    </div>
                    <StatusPill tone={blueprint.status === "active" ? "success" : "warning"}>
                      {blueprint.status === "active" ? "Actif" : "Draft"}
                    </StatusPill>
                  </header>
                  <div className="tag-list">
                    {blueprint.filters.map((filter) => (
                      <span key={filter} className="tag-chip">
                        {filter}
                      </span>
                    ))}
                  </div>
                  <button type="button" className="button secondary" onClick={() => applyBlueprint(blueprint.id)}>
                    Utiliser ce modele
                  </button>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Configuration" description="Chaque bloc reste court, aere et simple a comprendre.">
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="editor-section-grid two-columns">
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>General</h4>
                      <p>Le type et le nom servent de base a l'organisation du catalogue.</p>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="category-type">Categorie de produit</label>
                    <input id="category-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} />
                  </div>

                  <div className="field">
                    <label htmlFor="category-name">Nom de la categorie</label>
                    <input id="category-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Animation photo premium" required />
                  </div>
                </div>

                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>Etat des lieux</h4>
                      <p>Activation simple pour preparer les controles terrain quand c'est utile.</p>
                    </div>
                  </div>

                  <div className="row-actions">
                    <button type="button" className={`button ${form.inspectionEnabled ? "secondary" : "ghost"}`} onClick={() => setForm((current) => ({ ...current, inspectionEnabled: true }))}>
                      Active
                    </button>
                    <button type="button" className={`button ${!form.inspectionEnabled ? "secondary" : "ghost"}`} onClick={() => setForm((current) => ({ ...current, inspectionEnabled: false }))}>
                      Desactive
                    </button>
                  </div>
                </div>
              </div>

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Filtres personnalises</h4>
                    <p>Ils servent de lecture rapide dans la fiche produit sans densifier l'interface.</p>
                  </div>
                </div>

                <div className="stack">
                  {form.filters.map((filter, index) => (
                    <input
                      key={`filter-${index}`}
                      value={filter}
                      onChange={(event) => updateFilter(index, event.target.value)}
                      placeholder="Ex. branding"
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setForm((current) => ({ ...current, filters: [...current.filters, ""] }))}
                >
                  + Filtre
                </button>
              </div>

              <div className="section-block">
                <div className="section-block-header">
                  <div>
                    <h4>Gestion des durees</h4>
                    <p>Des reperes simples pour les durees standard ou les fourchettes plus souples.</p>
                  </div>
                </div>

                <div className="stack">
                  {form.durations.map((duration, index) => (
                    <div key={`duration-${index}`} className="form-grid two-columns">
                      <input value={duration.label} onChange={(event) => updateListValue("durations", index, "label", event.target.value)} placeholder="Label" />
                      <input type="number" min="1" value={duration.hours} onChange={(event) => updateListValue("durations", index, "hours", event.target.value)} placeholder="Heures" />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setForm((current) => ({ ...current, durations: [...current.durations, { label: "", hours: 8 }] }))}
                >
                  + Duree
                </button>

                <div className="stack">
                  {form.ranges.map((range, index) => (
                    <div key={`range-${index}`} className="form-grid two-columns">
                      <input value={range.label} onChange={(event) => updateListValue("ranges", index, "label", event.target.value)} placeholder="Nom de la fourchette" />
                      <div className="form-grid two-columns">
                        <input type="number" min="1" value={range.minHours} onChange={(event) => updateListValue("ranges", index, "minHours", event.target.value)} placeholder="Min" />
                        <input type="number" min="1" value={range.maxHours} onChange={(event) => updateListValue("ranges", index, "maxHours", event.target.value)} placeholder="Max" />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setForm((current) => ({ ...current, ranges: [...current.ranges, { label: "", minHours: 12, maxHours: 24 }] }))}
                >
                  + Fourchette
                </button>
              </div>

              <div className="row-actions form-actions-bar">
                <button type="submit" className="button primary">
                  Sauvegarder la categorie
                </button>
              </div>
            </form>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}
