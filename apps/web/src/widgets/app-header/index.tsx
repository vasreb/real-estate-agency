import Link from "next/link";
import { LogoutButton } from "@/features/auth";

export function AppHeader() {
  return (
    <header className="app-header">
      <Link href="/deals" className="brand">
        Агентство
      </Link>
      <LogoutButton />
    </header>
  );
}
