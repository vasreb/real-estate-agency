import Link from "next/link";
import { LogoutButton } from "@/features/auth";

export function AppHeader() {
  return (
    <header className="app-header">
      <Link href="/deals" className="brand">
        Agency
      </Link>
      <nav aria-label="Main" className="actions">
        <Link href="/deals">Deals</Link>
        <Link href="/chat">Assistant</Link>
        <Link href="/admin/documents">Documents</Link>
      </nav>
      <LogoutButton />
    </header>
  );
}
