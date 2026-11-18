import { ChatPage } from "@/_pages/chat";
import { loadTeamsForPage } from "@/shared/api/server";

// Dynamic, uncached server gate: 401 redirects before any output.
export const dynamic = "force-dynamic";

export default async function Page() {
  await loadTeamsForPage();
  return <ChatPage />;
}
