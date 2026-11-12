import type { Metadata } from "next";
import { LoginPage } from "@/_pages/login";

export const metadata: Metadata = { title: "Вход — Агентство" };

export default function Page() {
  return <LoginPage />;
}
