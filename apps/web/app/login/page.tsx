import type { Metadata } from "next";
import { LoginPage } from "@/_pages/login";

export const metadata: Metadata = { title: "Sign in — Agency" };

export default function Page() {
  return <LoginPage />;
}
