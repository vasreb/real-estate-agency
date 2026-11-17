import type { DealList } from "@agency/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { fakeApi, renderWithProviders, routerMock } from "@/shared/lib/testing";
import { DealsPage } from ".";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
beforeEach(() => {
  vi.clearAllMocks();
});

const data: DealList = {
  items: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      number: "2026-001",
      type: "sale",
      client_name: "Romashka LLC",
      property_address: "Moscow, Tverskaya St., 1, apt. 10 ".repeat(8),
      team_name: "Team North",
    },
    {
      id: "50000000-0000-4000-8000-000000000002",
      number: "2026-002",
      type: "rental",
      client_name: "Ivanova",
      property_address: "Kazan",
      team_name: "Team North",
    },
  ],
};

describe("/deals screen", () => {
  it("shows number, type, client, address and team with a logout button", () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const table = screen.getByRole("table", { name: "Available deals" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Number", "Deal type", "Client", "Property address", "Team"]);
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("2026-001");
    expect(row).toHaveTextContent("Sale");
    expect(row).toHaveTextContent("Romashka LLC");
    expect(row).toHaveTextContent("Team North");
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("Rental");
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("opens the card by keyboard link and by row click", async () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const link = screen.getByRole("link", { name: "2026-001" });
    expect(link).toHaveAttribute(
      "href",
      "/deals/50000000-0000-4000-8000-000000000001",
    );
    await userEvent.setup().click(screen.getByText("Ivanova"));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/deals/50000000-0000-4000-8000-000000000002",
    );
  });

  it("lets long addresses wrap instead of breaking the layout", () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const cell = screen.getByText((text) => text.startsWith("Moscow"));
    expect(cell).toHaveClass("wrap-anywhere");
  });

  it("shows the exact empty text", () => {
    renderWithProviders(<DealsPage initialData={{ items: [] }} />);
    expect(screen.getByText("No available deals")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    [new ApiError(0, "NETWORK_ERROR"), "Cannot reach the server"],
    [new ApiError(500, "INTERNAL_ERROR"), "Internal server error"],
  ])("does not mask %s as an empty list", async (error, text) => {
    const { queryClient } = renderWithProviders(
      <DealsPage initialData={{ items: [] }} />,
      fakeApi({ listDeals: vi.fn(() => Promise.reject(error)) }),
    );
    await queryClient.refetchQueries({ queryKey: ["deals"] });
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByText("No available deals")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
