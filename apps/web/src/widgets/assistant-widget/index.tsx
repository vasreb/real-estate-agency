"use client";

import { Button } from "@agency/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AssistantChat } from "@/features/assistant";

/** Pages where the widget would be redundant or the user is signed out. */
const HIDDEN_ON = new Set(["/login", "/chat"]);

/**
 * "Assistant" button that opens a side panel over the current screen. The
 * conversation stays mounted while the panel is closed. The search always
 * covers every deal of the selected team.
 */
export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  if (HIDDEN_ON.has(pathname)) return null;
  return (
    <>
      <Button
        className="assistant-launcher"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={() => {
          setOpen((value) => !value);
          setOpened(true);
        }}
      >
        Assistant
      </Button>
      {opened && (
        <aside
          id="assistant-panel"
          className="assistant-panel"
          aria-label="Assistant"
          hidden={!open}
        >
          <div className="section-header">
            <h2>Assistant</h2>
            <div className="actions">
              <Link href="/chat">Open full page</Link>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
          <AssistantChat />
        </aside>
      )}
    </>
  );
}
