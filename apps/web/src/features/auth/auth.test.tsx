import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { fakeApi, renderWithProviders, routerMock } from "@/shared/lib/testing";
import { LoginForm, LogoutButton } from ".";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
beforeEach(() => {
  vi.clearAllMocks();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("login form", () => {
  it("normalizes email, keeps the password verbatim, clears private cache, and goes to /deals", async () => {
    const login = vi.fn(() => Promise.resolve());
    const { queryClient } = renderWithProviders(
      <LoginForm />,
      fakeApi({ login }),
    );
    queryClient.setQueryData(["deal", "x"], { secret: "previous account" });
    await fillAndSubmit("  Admin@Agency.TEST ", " pass word ");
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/deals"),
    );
    expect(login).toHaveBeenCalledWith({
      email: "admin@agency.test",
      password: " pass word ",
    });
    expect(queryClient.getQueryData(["deal", "x"])).toBeUndefined();
  });

  it("shows accessible validation errors and sends nothing for an invalid form", async () => {
    const login = vi.fn();
    renderWithProviders(<LoginForm />, fakeApi({ login }));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter a valid email.");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "Enter your password.",
    );
    expect(login).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(401, "UNAUTHENTICATED"), "Invalid email or password."],
    [
      new ApiError(429, "RATE_LIMITED"),
      "Too many attempts. Please try again later.",
    ],
    [
      new ApiError(0, "NETWORK_ERROR"),
      "Cannot reach the server. Check your connection and try again.",
    ],
  ])(
    "shows a generic error for %s without echoing credentials",
    async (error, message) => {
      renderWithProviders(
        <LoginForm />,
        fakeApi({ login: vi.fn(() => Promise.reject(error)) }),
      );
      await fillAndSubmit("a@agency.test", "secret-pass");
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("alert")).not.toHaveTextContent("secret-pass");
      expect(routerMock.replace).not.toHaveBeenCalled();
    },
  );

  it("disables the button while pending and does not send duplicates", async () => {
    let finish!: () => void;
    const login = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderWithProviders(<LoginForm />, fakeApi({ login }));
    const user = await fillAndSubmit("a@agency.test", "secret-pass");
    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(login).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
  });
});

describe("logout", () => {
  it("revokes the session, clears cached data and returns to /login", async () => {
    const logout = vi.fn(() => Promise.resolve());
    const { queryClient } = renderWithProviders(
      <LogoutButton />,
      fakeApi({ logout }),
    );
    queryClient.setQueryData(["deals"], { items: ["private"] });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/login"),
    );
    expect(logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["deals"])).toBeUndefined();
  });

  it("does not claim the session ended when logout fails", async () => {
    renderWithProviders(
      <LogoutButton />,
      fakeApi({
        logout: vi.fn(() => Promise.reject(new ApiError(0, "NETWORK_ERROR"))),
      }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "the session may still be active",
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
