"use client";

import { AssistantChat } from "@/features/assistant";
import { AppHeader } from "@/widgets/app-header";

/**
 * Rendering: dynamic server gate (`app/chat/page.tsx`) redirects signed-out
 * users; the chat itself is client-side (TanStack Query + assistant-ui).
 */
export function ChatPage() {
  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <h1>Assistant</h1>
        <AssistantChat />
      </main>
    </>
  );
}
