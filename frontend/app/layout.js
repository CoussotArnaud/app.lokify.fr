import "./globals.css";

import { AuthProvider } from "../components/auth-provider";

export const metadata = {
  title: "LOKIFY",
  description: "Gestion et reservation de materiel pour les professionnels.",
  icons: {
    icon: "/assets/logos/favicon.png",
    shortcut: "/assets/logos/favicon.png",
    apple: "/assets/logos/favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
