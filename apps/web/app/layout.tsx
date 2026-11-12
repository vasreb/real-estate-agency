import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/_app/providers";
import { Shell } from "@/_app/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Агентство — сделки и документы",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
