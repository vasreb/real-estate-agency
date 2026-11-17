import type { DealDetail } from "@agency/contracts";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, routerMock } from "@/shared/lib/testing";
import { DealDetailPage } from ".";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
beforeEach(() => {
  vi.clearAllMocks();
});

const contractId = "60000000-0000-4000-8000-000000000001";
const amendmentId = "60000000-0000-4000-8000-000000000002";
const detail: DealDetail = {
  id: "50000000-0000-4000-8000-000000000001",
  number: "2026-001",
  type: "sale",
  role: "member",
  client: { id: "c", name: "Romashka LLC" },
  property: { id: "p", address: "Moscow, Tverskaya St., 1" },
  team: { id: "t", name: "Team North" },
  documents: [
    {
      id: contractId,
      deal_id: "50000000-0000-4000-8000-000000000001",
      parent_document_id: null,
      type: "contract",
      title: "Purchase agreement",
      document_number: "PA-1",
      document_date: "2026-01-01",
      effective_from: null,
      status: "signed",
      file_name: "d.pdf",
      mime_type: "application/pdf",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: amendmentId,
      deal_id: "50000000-0000-4000-8000-000000000001",
      parent_document_id: contractId,
      type: "amendment",
      title: '<img src=x onerror="alert(1)">',
      document_number: null,
      document_date: null,
      effective_from: "2026-03-01",
      status: "unknown",
      file_name: "a.docx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      created_at: "2026-01-02T00:00:00.000Z",
    },
  ],
};

describe("/deals/[id] card", () => {
  it("shows the deal, related records and every document field", () => {
    renderWithProviders(<DealDetailPage initialData={detail} />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Deal No. 2026-001 · Sale",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Romashka LLC")).toBeInTheDocument();
    expect(screen.getByText("Moscow, Tverskaya St., 1")).toBeInTheDocument();
    expect(screen.getByText("Team North")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Deal documents" });
    const [, contractRow, amendmentRow] = within(table).getAllByRole("row");
    expect(
      [...contractRow!.querySelectorAll("td")]
        .slice(0, 7)
        .map((c) => c.textContent),
    ).toEqual([
      "Purchase agreement",
      "Contract",
      "PA-1",
      "01.01.2026",
      "Signed",
      "—",
      "—",
    ]);
    expect(
      [...amendmentRow!.querySelectorAll("td")]
        .slice(1, 7)
        .map((c) => c.textContent),
    ).toEqual([
      "Amendment",
      "—",
      "—",
      "Not specified",
      "01.03.2026",
      "Purchase agreement (No. PA-1)",
    ]);
  });

  it("gives members only same-origin download links", () => {
    renderWithProviders(<DealDetailPage initialData={detail} />);
    expect(
      screen.getByRole("link", { name: "Download: Purchase agreement" }),
    ).toHaveAttribute("href", `/api/documents/${contractId}/file`);
    for (const name of ["Upload", /Edit/, /Delete/])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("shows write controls only for admins", () => {
    renderWithProviders(
      <DealDetailPage initialData={{ ...detail, role: "admin" }} />,
    );
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Edit:/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Delete:/ })).toHaveLength(2);
  });

  it("renders malicious titles as text, never as HTML", () => {
    const { container } = renderWithProviders(
      <DealDetailPage initialData={detail} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
  });

  it("shows an empty documents state", () => {
    renderWithProviders(
      <DealDetailPage initialData={{ ...detail, documents: [] }} />,
    );
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });
});
