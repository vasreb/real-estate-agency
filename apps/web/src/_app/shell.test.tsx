import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./shell";

describe("Russian application shell", () => {
  it("provides a keyboard skip link and preserves the screen landmark", () => {
    render(
      <Shell>
        <main id="main">
          <h1>Сделки</h1>
        </main>
      </Shell>,
    );
    expect(screen.getByRole("link", { name: "К содержимому" })).toHaveAttribute(
      "href",
      "#main",
    );
    expect(screen.getByRole("main")).toHaveTextContent("Сделки");
  });
});
