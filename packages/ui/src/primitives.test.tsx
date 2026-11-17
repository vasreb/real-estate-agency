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
          Type
          <Select>
            <option>Contract</option>
          </Select>
        </label>
        <Alert>Error</Alert>
        <Table>
          <caption>Documents</caption>
          <tbody>
            <tr>
              <td>Contract</td>
            </tr>
          </tbody>
        </Table>
      </>,
    );
    await user.type(screen.getByLabelText("Email"), "a@example.test");
    expect(screen.getByLabelText("Email")).toHaveValue("a@example.test");
    expect(screen.getByLabelText("Type")).toHaveValue("Contract");
    expect(screen.getByRole("alert")).toHaveTextContent("Error");
    expect(
      screen.getByRole("table", { name: "Documents" }),
    ).toBeInTheDocument();
  });
  it("prevents clicks when disabled", async () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(click).not.toHaveBeenCalled();
  });
  it("opens by keyboard, traps focus, and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Delete</Button>}
        title="Deletion"
        description="Confirm the action"
      >
        <Button variant="danger">Confirm</Button>
      </Dialog>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Deletion" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
  });
});
