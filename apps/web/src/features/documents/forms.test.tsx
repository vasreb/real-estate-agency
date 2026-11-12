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
  title: "Договор",
  document_number: "Д-1",
  document_date: "2026-01-01",
  effective_from: null,
  status: "signed",
};
const amendment: DocumentMetadata = {
  ...base,
  id: "60000000-0000-4000-8000-000000000002",
  parent_document_id: contract.id,
  type: "amendment",
  title: "ДС",
  document_number: "ДС-1",
  document_date: "2026-02-01",
  effective_from: "2026-03-01",
  status: "draft",
};
const otherDoc: DocumentMetadata = {
  ...contract,
  id: "60000000-0000-4000-8000-000000000003",
  type: "listing_sheet",
  title: "Лист",
};
const documents = [contract, amendment, otherDoc];
const pdf = (size = 10) => {
  const file = new File(["%PDF-"], "Договор.pdf", { type: "application/pdf" });
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
    expect(screen.getByLabelText("Статус")).toHaveValue("unknown");
    expect(screen.getByText(/до 25 МБ/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Связанный договор"),
    ).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Файл/), pdf());
    await user.type(screen.getByLabelText("Название"), " ДС ");
    await user.selectOptions(screen.getByLabelText("Тип"), "amendment");
    const parent = screen.getByLabelText("Связанный договор");
    expect(
      [...parent.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Не выбран", "Договор (№ Д-1)"]);
    await user.selectOptions(parent, contract.id);
    await user.type(
      screen.getByLabelText("Дата вступления в силу"),
      "2026-03-01",
    );
    await user.click(screen.getByRole("button", { name: "Загрузить" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(uploadDocument).toHaveBeenCalledWith(
      dealId,
      {
        title: "ДС",
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
    await user.click(screen.getByRole("button", { name: "Загрузить" }));
    expect(screen.getByLabelText("Название")).toHaveAccessibleDescription(
      "Укажите название",
    );
    await user.type(screen.getByLabelText("Название"), "Большой");
    await user.upload(screen.getByLabelText(/Файл/), pdf(25_000_001));
    await user.click(screen.getByRole("button", { name: "Загрузить" }));
    expect(screen.getByLabelText(/Файл/)).toHaveAccessibleDescription(
      /Файл больше 25 МБ/,
    );
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ApiError(415, "UNSUPPORTED_FILE_TYPE"),
      "Допускаются только корректные файлы PDF и DOCX.",
    ],
    [new ApiError(413, "PAYLOAD_TOO_LARGE"), "не более 25 МБ"],
    [new ApiError(0, "NETWORK_ERROR"), "Нет связи с сервером"],
  ])("shows the server rejection %s", async (error, text) => {
    renderUpload(
      fakeApi({ uploadDocument: vi.fn(() => Promise.reject(error)) }),
    );
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Файл/), pdf());
    await user.type(screen.getByLabelText("Название"), "Файл");
    await user.click(screen.getByRole("button", { name: "Загрузить" }));
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
    await user.upload(screen.getByLabelText(/Файл/), pdf());
    await user.type(screen.getByLabelText("Название"), "Файл");
    await user.click(screen.getByRole("button", { name: "Загрузить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Недостаточно прав",
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
    expect(screen.getByLabelText("Тип")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Тип")).toHaveValue("Допсоглашение");
    expect(screen.queryByLabelText(/Файл/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Номер"));
    await user.clear(screen.getByLabelText("Дата вступления в силу"));
    await user.selectOptions(screen.getByLabelText("Связанный договор"), "");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
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
    expect(
      screen.queryByLabelText("Связанный договор"),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(patchDocument).toHaveBeenCalledWith(contract.id, {}),
    );
  });

  it("rejects invalid fields client-side", async () => {
    const patchDocument = vi.fn();
    renderEdit(contract, fakeApi({ patchDocument }));
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Название"));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(screen.getByLabelText("Название")).toHaveAttribute(
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
    const trigger = screen.getByRole("button", { name: "Удалить: ДС" });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Удалить документ?" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(deleteDocument).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Удалить документ" }));
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
    await user.click(screen.getByRole("button", { name: "Удалить: Договор" }));
    await user.click(screen.getByRole("button", { name: "Удалить документ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "привязаны допсоглашения",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
