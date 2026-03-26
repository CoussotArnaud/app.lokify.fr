"use client";

import { useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import ModuleCard from "../../components/module-card";
import Panel from "../../components/panel";
import SegmentedTabs from "../../components/segmented-tabs";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { toolboxTabs } from "../../lib/lokify-data";

export default function ToolboxPage() {
  const workspace = useLokifyWorkspace();
  const [activeTab, setActiveTab] = useState("all");
  const [enabledTools, setEnabledTools] = useState({});

  useEffect(() => {
    if (workspace.toolboxModules.length && !Object.keys(enabledTools).length) {
      setEnabledTools(
        workspace.toolboxModules.reduce(
          (accumulator, module) => ({
            ...accumulator,
            [module.id]: module.enabled,
          }),
          {}
        )
      );
    }
  }, [workspace.toolboxModules, enabledTools]);

  const filteredModules = workspace.toolboxModules.filter((module) => {
    if (activeTab === "new") {
      return module.isNew;
    }

    if (activeTab === "soon") {
      return module.isComingSoon;
    }

    if (activeTab === "mine") {
      return enabledTools[module.id];
    }

    return true;
  });

  return (
    <AppShell>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Boite a outils</p>
            <h3>Activez progressivement les briques optionnelles de votre SaaS LOKIFY.</h3>
            <p>
              Cette page sert de base a un futur systeme de modules activables, sans dependre d'un
              design clone et avec des contenus fictifs propres a LOKIFY.
            </p>
          </div>
        </div>

        <SegmentedTabs
          options={toolboxTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Filtres boite a outils"
        />

        <Panel
          title="Modules disponibles"
          description="Un socle de modules operations, commercial, finance et marketing a activer a la carte."
        >
          <div id="module-details" className="module-grid">
            {filteredModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                enabled={Boolean(enabledTools[module.id])}
                onToggle={(nextValue) =>
                  setEnabledTools((current) => ({ ...current, [module.id]: nextValue }))
                }
              />
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
