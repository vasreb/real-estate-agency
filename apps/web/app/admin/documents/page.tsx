import { AdminDocumentsPage } from "@/_pages/admin-documents";
import { loadTeamsForPage } from "@/shared/api/server";

// Dynamic, uncached server gate: 401 redirects before any output.
export const dynamic = "force-dynamic";

export default async function Page() {
  const teams = await loadTeamsForPage();
  return <AdminDocumentsPage teams={teams} />;
}
