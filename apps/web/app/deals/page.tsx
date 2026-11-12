import { DealsPage } from "@/_pages/deals";
import { loadDealsForPage } from "@/shared/api/server";

// Dynamic, uncached server gate: 401 redirects before any output.
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadDealsForPage();
  return <DealsPage initialData={data} />;
}
