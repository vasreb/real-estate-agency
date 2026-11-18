import type { ReactNode } from "react";
import { AssistantWidget } from "@/widgets/assistant-widget";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">{children}</div>
      <AssistantWidget />
    </>
  );
}
