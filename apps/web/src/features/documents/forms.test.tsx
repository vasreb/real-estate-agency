import type { DocumentMetadata } from "@agency/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { fakeApi, renderWithProviders, routerMock } from "@/shared/lib/testing";
import { DeleteDocumentButton, EditDocumentForm, UploadDocumentForm } from ".";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
beforeEach(() => {
  vi.clearAllMocks();
});

const dealId = "50000000-0000-4000-8000-000000000001";
const base = {
  deal_id: dealId,
  file_name: "x.pdf",
  mime_type: "application/pdf" as const,
  created_at: "2026-01-01T00:00:00.000Z",
};
const contract: DocumentMetadata = {
  ...base,
  id: "60000000-0000-4000-8000-000000000001",
  parent_document_id: null,
  type: "contract",
  title: "Contract",
  document_number: "C-1",
  document_date: "2026-01-01",
  effective_from: null,
  status: "signed",
};
const amendment: DocumentMetadata = {
  ...base,
  id: "60000000-0000-4000-8000-000000000002",
  parent_document_id: contract.id,
  type: "amendment",
  title: "Amendment",
  document_number: "AMD-1",
  document_date: "2026-02-01",
  effective_from: "2026-03-01",
  status: "draft",
};
const otherDoc: DocumentMetadata = {
  ...contract,
  id: "60000000-0000-4000-8000-000000000003",
  type: "listing_sheet",
  title: "Sheet",
};
const documents = [contract, amendment, otherDoc];
const pdf = (size = 10) => {
  const file = new File(["%PDF-"], "Contract.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

function renderUpload(api = fakeApi()) {
  const onDone = vi.fn();
  const view = renderWithProviders(
    <UploadDocumentForm
      dealId={dealId}
      documents={documents}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
    api,
  );
  return { ...view, onDone };
}

describe("upload form", () => {
  it("submits all fields, defaults status to unknown, links an amendment, and refreshes the deal", async () => {
    const uploadDocument = vi.fn(() => Promise.resolve(amendment));
    const { onDone, queryClient } = renderUpload(fakeApi({ uploadDocument }));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    expect(screen.getByLabelText("Status")).toHaveValue("unknown");
    expect(screen.getByText(/up to 25 MB/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Related contract")).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/File/), pdf());
    await user.type(screen.getByLabelText("Title"), " Amendment ");
    await user.selectOptions(screen.getByLabelText("Type"), "amendment");
    const parent = screen.getByLabelText("Related contract");
    expect(
      [...parent.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Not selected", "Contract (No. C-1)"]);
    await user.selectOptions(parent, contract.id);
    await user.type(screen.getByLabelText("Effective date"), "2026-03-01");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(uploadDocument).toHaveBeenCalledWith(
      dealId,
      {
        title: "Amendment",
        type: "amendment",
        status: "unknown",
        effective_from: "2026-03-01",
        parent_document_id: contract.id,
      },
      expect.any(File),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["deal", dealId] });
  });

  it("prechecks size and required fields without sending a request", async () => {
    const uploadDocument = vi.fn();
    renderUpload(fakeApi({ uploadDocument }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription(
      "Enter a title",
    );
    await user.type(screen.getByLabelText("Title"), "Large");
    await user.upload(screen.getByLabelText(/File/), pdf(25_000_001));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByLabelText(/File/)).toHaveAccessibleDescription(
      /File is larger than 25 MB/,
    );
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ApiError(415, "UNSUPPORTED_FILE_TYPE"),
      "Only valid PDF and DOCX files are allowed.",
    ],
    [new ApiError(413, "PAYLOAD_TOO_LARGE"), "the maximum size is 25 MB"],
    [new ApiError(0, "NETWORK_ERROR"), "Cannot reach the server"],
  ])("shows the server rejection %s", async (error, text) => {
    renderUpload(
      fakeApi({ uploadDocument: vi.fn(() => Promise.reject(error)) }),
    );
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/File/), pdf());
    await user.type(screen.getByLabelText("Title"), "File");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("refetches the deal (current role) after a 403", async () => {
    const { queryClient } = renderUpload(
      fakeApi({
        uploadDocument: vi.fn(() =>
          Promise.reject(new ApiError(403, "FORBIDDEN")),
        ),
      }),
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/File/), pdf());
    await user.type(screen.getByLabelText("Title"), "File");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "do not have permission",
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["deal", dealId] });
  });
});

describe("edit form", () => {
  function renderEdit(document: DocumentMetadata, api = fakeApi()) {
    const onDone = vi.fn();
    renderWithProviders(
      <EditDocumentForm
        dealId={dealId}
        document={document}
        documents={documents}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
      api,
    );
    return onDone;
  }

  it("sends only changed fields, null for cleared optionals, never type", async () => {
    const patchDocument = vi.fn(() => Promise.resolve(amendment));
    const onDone = renderEdit(amendment, fakeApi({ patchDocument }));
    const user = userEvent.setup();
    expect(screen.getByLabelText("Type")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Type")).toHaveValue("Amendment");
    expect(screen.queryByLabelText(/File/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Number"));
    await user.clear(screen.getByLabelText("Effective date"));
    await user.selectOptions(screen.getByLabelText("Related contract"), "");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(patchDocument).toHaveBeenCalledWith(amendment.id, {
      document_number: null,
      effective_from: null,
      parent_document_id: null,
    });
  });

  it("offers only other contracts of this deal and sends an empty patch when unchanged", async () => {
    const patchDocument = vi.fn(() => Promise.resolve(contract));
    renderEdit(contract, fakeApi({ patchDocument }));
    expect(screen.queryByLabelText("Related contract")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(patchDocument).toHaveBeenCalledWith(contract.id, {}),
    );
  });

  it("rejects invalid fields client-side", async () => {
    const patchDocument = vi.fn();
    renderEdit(contract, fakeApi({ patchDocument }));
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(patchDocument).not.toHaveBeenCalled();
  });
});

describe("delete dialog", () => {
  it("requires confirmation; cancelling sends no request and returns focus", async () => {
    const deleteDocument = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <DeleteDocumentButton dealId={dealId} document={amendment} />,
      fakeApi({ deleteDocument }),
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Delete: Amendment" });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Delete document?" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(deleteDocument).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Delete document" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deleteDocument).toHaveBeenCalledWith(amendment.id);
  });

  it("explains a 409 for a referenced contract and keeps the dialog open", async () => {
    renderWithProviders(
      <DeleteDocumentButton dealId={dealId} document={contract} />,
      fakeApi({
        deleteDocument: vi.fn(() =>
          Promise.reject(new ApiError(409, "DOCUMENT_REFERENCED")),
        ),
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete: Contract" }));
    await user.click(screen.getByRole("button", { name: "Delete document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "amendments are linked",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
