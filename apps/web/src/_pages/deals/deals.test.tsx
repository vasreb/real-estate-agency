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
      client_name: "ООО «Ромашка»",
      property_address: "г. Москва, ул. Тверская, д. 1, кв. 10 ".repeat(8),
      team_name: "Команда «Север»",
    },
    {
      id: "50000000-0000-4000-8000-000000000002",
      number: "2026-002",
      type: "rental",
      client_name: "Иванова",
      property_address: "Казань",
      team_name: "Команда «Север»",
    },
  ],
};

describe("/deals screen", () => {
  it("shows number, type, client, address and team with a logout button", () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const table = screen.getByRole("table", { name: "Доступные сделки" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Номер", "Тип сделки", "Клиент", "Адрес объекта", "Команда"]);
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("2026-001");
    expect(row).toHaveTextContent("Продажа");
    expect(row).toHaveTextContent("ООО «Ромашка»");
    expect(row).toHaveTextContent("Команда «Север»");
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("Аренда");
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });

  it("opens the card by keyboard link and by row click", async () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const link = screen.getByRole("link", { name: "2026-001" });
    expect(link).toHaveAttribute(
      "href",
      "/deals/50000000-0000-4000-8000-000000000001",
    );
    await userEvent.setup().click(screen.getByText("Иванова"));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/deals/50000000-0000-4000-8000-000000000002",
    );
  });

  it("lets long addresses wrap instead of breaking the layout", () => {
    renderWithProviders(<DealsPage initialData={data} />);
    const cell = screen.getByText((text) => text.startsWith("г. Москва"));
    expect(cell).toHaveClass("wrap-anywhere");
  });

  it("shows the exact empty text", () => {
    renderWithProviders(<DealsPage initialData={{ items: [] }} />);
    expect(screen.getByText("Нет доступных сделок")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    [new ApiError(0, "NETWORK_ERROR"), "Нет связи с сервером"],
    [new ApiError(500, "INTERNAL_ERROR"), "Внутренняя ошибка сервера"],
  ])("does not mask %s as an empty list", async (error, text) => {
    const { queryClient } = renderWithProviders(
      <DealsPage initialData={{ items: [] }} />,
      fakeApi({ listDeals: vi.fn(() => Promise.reject(error)) }),
    );
    await queryClient.refetchQueries({ queryKey: ["deals"] });
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByText("Нет доступных сделок")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Повторить" }),
    ).toBeInTheDocument();
  });
});
