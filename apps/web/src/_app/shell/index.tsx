import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <div className="app-shell">{children}</div>
    </>
  );
}
