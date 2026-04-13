import type { Metadata } from "next";
import { Playfair_Display, DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tarabaña — Fábrica de Cervezas Artesanales",
  description: "Cervecería artesanal independiente. Craft para todos. Taproom en Condesa CDMX, fábrica en Lerma Edo. Méx.",
  keywords: ["cerveza artesanal", "craft beer", "CDMX", "Condesa", "IPA", "Tarabaña"],
  icons: {
    icon: "/nueva_concha.png", shortcut: "/nueva_concha.png",
    apple: "/nueva_concha.png",
  },
  openGraph: {
    title: "Tarabaña — Craft para todos",
    description: "Cinco estilos lupulados hechos con obsesión en Lerma, servidos frescos en Condesa.",
    url: "https://tarabana.mx",
    siteName: "Tarabaña",
    locale: "es_MX",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmMono.variable} ${dmSans.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
