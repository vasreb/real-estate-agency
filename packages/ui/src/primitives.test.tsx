import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Alert, Button, Dialog, Input, Select, Table } from "./index.js";

describe("accessible shared primitives", () => {
  it("supports labeled inputs, selects, alerts and semantic tables", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label>
          Email
          <Input />
        </label>
        <label>
          Тип
          <Select>
            <option>Договор</option>
          </Select>
        </label>
        <Alert>Ошибка</Alert>
        <Table>
          <caption>Документы</caption>
          <tbody>
            <tr>
              <td>Договор</td>
            </tr>
          </tbody>
        </Table>
      </>,
    );
    await user.type(screen.getByLabelText("Email"), "a@example.test");
    expect(screen.getByLabelText("Email")).toHaveValue("a@example.test");
    expect(screen.getByLabelText("Тип")).toHaveValue("Договор");
    expect(screen.getByRole("alert")).toHaveTextContent("Ошибка");
    expect(
      screen.getByRole("table", { name: "Документы" }),
    ).toBeInTheDocument();
  });
  it("prevents clicks when disabled", async () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Сохранить
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(click).not.toHaveBeenCalled();
  });
  it("opens by keyboard, traps focus, and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Удалить</Button>}
        title="Удаление"
        description="Подтвердите действие"
      >
        <Button variant="danger">Подтвердить</Button>
      </Dialog>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Удалить" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Удаление" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Закрыть" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Подтвердить" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toHaveFocus();
  });
});
