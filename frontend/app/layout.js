import "./globals.css";

import { AuthProvider } from "../components/auth-provider";

export const metadata = {
  title: "LOKIFY",
  description: "Plateforme SaaS de gestion et reservation de materiel.",
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
