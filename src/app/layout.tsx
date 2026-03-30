import type { Metadata } from "next";
import { Providers } from "@/components/shared/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Metrum Group — Ваш надійний партнер в нерухомості та будівництві",
    template: "%s | Metrum Group",
  },
  description:
    "Повний спектр послуг: будівництво, ремонт, дизайн, продаж та оренда нерухомості. м. Львів",
  keywords: ["будівництво", "ремонт", "нерухомість", "Львів", "Metrum Group", "дизайн інтерєру"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
