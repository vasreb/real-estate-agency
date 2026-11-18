import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/shared/api";
import { fakeApi, renderWithProviders } from "@/shared/lib/testing";
import { AssistantWidget } from ".";

const pathname = vi.hoisted(() => ({ current: "/deals" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const north = "10000000-0000-4000-8000-000000000001";
const api = () =>
  fakeApi({
    listTeams: vi.fn<ApiClient["listTeams"]>(() =>
      Promise.resolve({
        items: [{ id: north, name: "Team North", role: "member" }],
      }),
    ),
  });

beforeEach(() => {
  pathname.current = "/deals";
});

describe("AssistantWidget", () => {
  it("opens a side panel over the current screen and closes it again", async () => {
    renderWithProviders(<AssistantWidget />, api());
    const button = screen.getByRole("button", { name: "Assistant" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = await screen.findByRole("complementary", {
      name: "Assistant",
    });
    expect(panel).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open full page" }),
    ).toHaveAttribute("href", "/chat");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(panel).not.toBeVisible();
  });

  it("on a deal page it still searches the whole team: no deal selector", async () => {
    pathname.current = "/deals/50000000-0000-4000-8000-000000000001";
    renderWithProviders(<AssistantWidget />, api());
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Assistant" }));
    expect(await screen.findByLabelText("Team")).toHaveValue(north);
    expect(screen.queryByLabelText("Deal")).not.toBeInTheDocument();
  });

  it("is not shown on the sign-in page or the full chat page", () => {
    for (const path of ["/login", "/chat"]) {
      pathname.current = path;
      const { unmount } = renderWithProviders(<AssistantWidget />, api());
      expect(
        screen.queryByRole("button", { name: "Assistant" }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
