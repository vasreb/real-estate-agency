import { DealDetailPage } from "@/_pages/deal-detail";
import { loadDealForPage } from "@/shared/api/server";

// Dynamic gate: 401 → /login and missing/foreign → notFound() (HTTP 404)
// run before the first streamed byte; no loading.tsx/Suspense above it.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await loadDealForPage(id);
  return <DealDetailPage initialData={deal} />;
}
