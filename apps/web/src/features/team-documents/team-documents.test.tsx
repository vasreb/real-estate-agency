import type { TeamDocument } from "@agency/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@/shared/api";
import { fakeApi, renderWithProviders, routerMock } from "@/shared/lib/testing";
import { fileProblem, needsPolling } from "./model";
import { TeamDocumentsPanel } from "./panel";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const teamId = "10000000-0000-4000-8000-000000000001";
const base: TeamDocument = {
  id: "60000000-0000-4000-8000-000000000010",
  team_id: teamId,
  deal_id: null,
  type: "other",
  title: "Market report Q4",
  document_number: null,
  document_date: null,
  effective_from: null,
  status: "unknown",
  file_name: "report.pdf",
  mime_type: "application/pdf",
  processing_status: "indexed",
  indexed_at: "2026-11-17T10:00:00.000Z",
  processing_error: null,
  created_at: "2026-11-17T09:00:00.000Z",
};
const dealDocument: TeamDocument = {
  ...base,
  id: "60000000-0000-4000-8000-000000000011",
  deal_id: "50000000-0000-4000-8000-000000000001",
  type: "contract",
  title: "Sale contract",
  processing_status: "failed",
  processing_error: "No text could be extracted",
};

beforeEach(() => vi.clearAllMocks());

function setup(items: TeamDocument[], extra: Partial<ApiClient> = {}) {
  const api = fakeApi({
    listTeamDocuments: vi.fn(() => Promise.resolve({ items })),
    ...extra,
  });
  renderWithProviders(<TeamDocumentsPanel teamId={teamId} />, api);
  return api;
}

describe("model helpers", () => {
  it("polls only while documents wait or are processed", () => {
    expect(needsPolling(undefined)).toBe(false);
    expect(needsPolling([{ processing_status: "indexed" }])).toBe(false);
    expect(needsPolling([{ processing_status: "failed" }])).toBe(false);
    expect(
      needsPolling([
        { processing_status: "indexed" },
        { processing_status: "processing" },
      ]),
    ).toBe(true);
    expect(needsPolling([{ processing_status: "pending" }])).toBe(true);
  });

  it("checks the file before sending", () => {
    expect(fileProblem(null)).toBe("Select a file");
    expect(fileProblem(new File(["x"], "notes.txt"))).toBe(
      "Only PDF and DOCX files are allowed",
    );
    expect(fileProblem(new File(["x"], "ok.PDF"))).toBeNull();
    const big = new File(["x"], "big.pdf");
    Object.defineProperty(big, "size", { value: 26_000_000 });
    expect(fileProblem(big)).toBe("File is larger than 25 MB");
  });
});

describe("TeamDocumentsPanel", () => {
  it("lists documents with owner, signing and index status, and the failure reason", async () => {
    setup([base, dealDocument]);
    const table = await screen.findByRole("table", { name: "Team documents" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Market report Q4");
    expect(rows[1]).toHaveTextContent("Team collection");
    expect(rows[1]).toHaveTextContent("Indexed");
    expect(rows[2]).toHaveTextContent("Sale contract");
    expect(
      within(rows[2]!).getByRole("link", { name: "Deal" }),
    ).toHaveAttribute("href", `/deals/${dealDocument.deal_id}`);
    expect(rows[2]).toHaveTextContent("Failed");
    expect(rows[2]).toHaveTextContent("No text could be extracted");
  });

  it("links to the inline preview and the original download", async () => {
    setup([base]);
    const view = await screen.findByRole("link", { name: "View" });
    expect(view).toHaveAttribute("href", `/api/documents/${base.id}/preview`);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/api/documents/${base.id}/file`,
    );
  });

  it("shows the empty state", async () => {
    setup([]);
    expect(await screen.findByText("No documents")).toBeInTheDocument();
  });

  it("queues a document for reindexing and refreshes the list", async () => {
    const reindexed = {
      ...dealDocument,
      processing_status: "pending" as const,
    };
    const listTeamDocuments = vi
      .fn<ApiClient["listTeamDocuments"]>()
      .mockResolvedValueOnce({ items: [dealDocument] })
      .mockResolvedValue({ items: [reindexed] });
    const reindexDocument = vi.fn<ApiClient["reindexDocument"]>(() =>
      Promise.resolve(reindexed),
    );
    setup([], { listTeamDocuments, reindexDocument });
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: "Reindex: Sale contract" }),
      );
    expect(reindexDocument).toHaveBeenCalledWith(dealDocument.id);
    await waitFor(() =>
      expect(screen.getByText("Waiting")).toBeInTheDocument(),
    );
    // A waiting document cannot be queued twice.
    expect(
      screen.getByRole("button", { name: "Reindex: Sale contract" }),
    ).toBeDisabled();
  });

  it("asks for confirmation before deleting and sends nothing on cancel", async () => {
    const deleteDocument = vi.fn<ApiClient["deleteDocument"]>(() =>
      Promise.resolve(),
    );
    setup([base], { deleteDocument });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete: Market report Q4" }),
    );
    expect(deleteDocument).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(deleteDocument).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Delete: Market report Q4" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete document" }));
    expect(deleteDocument).toHaveBeenCalledWith(base.id);
  });

  it("explains why a contract with amendments cannot be deleted", async () => {
    setup([base], {
      deleteDocument: vi.fn<ApiClient["deleteDocument"]>(() =>
        Promise.reject(new ApiError(409, "DOCUMENT_REFERENCED")),
      ),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete: Market report Q4" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "cannot be deleted while amendments are linked",
    );
  });

  it("validates the upload form before sending and uploads to the team", async () => {
    const uploadTeamDocument = vi.fn<ApiClient["uploadTeamDocument"]>(() =>
      Promise.resolve(base),
    );
    setup([], { uploadTeamDocument });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Upload" }));
    const form = screen.getByRole("form", {
      name: "Upload to the team collection",
    });
    await user.click(within(form).getByRole("button", { name: "Upload" }));
    expect(await within(form).findByText("Enter a title")).toBeInTheDocument();
    expect(within(form).getByText("Select a file")).toBeInTheDocument();
    expect(uploadTeamDocument).not.toHaveBeenCalled();

    await user.type(within(form).getByLabelText("Title"), "Market report Q4");
    await user.upload(
      within(form).getByLabelText(/File/),
      new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" }),
    );
    await user.click(within(form).getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(uploadTeamDocument).toHaveBeenCalledTimes(1));
    const [id, input, file] = uploadTeamDocument.mock.calls[0]!;
    expect(id).toBe(teamId);
    expect(input).toEqual({
      title: "Market report Q4",
      type: "other",
      status: "unknown",
    });
    expect(file.name).toBe("report.pdf");
  });
});
