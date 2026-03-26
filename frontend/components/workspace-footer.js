import Link from "next/link";

import BrandLogo from "./brand-logo";

export default function WorkspaceFooter() {
  return (
    <footer className="workspace-footer">
      <div className="workspace-footer-inner">
        <Link href="/dashboard" className="workspace-footer-brand">
          <BrandLogo className="brand-logo-footer" />
          <span>Plateforme SaaS de gestion et reservation de materiel.</span>
        </Link>
        <p>Mode demo local actif, structure prete pour industrialisation.</p>
      </div>
    </footer>
  );
}
