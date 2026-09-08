import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SignInForm from "@/components/sign-in-form";

// Router + auth/toast hooks are environment-driven; stub them so the form
// renders as a standalone view.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useSignIn: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useErrorToast", () => ({
  useAPIErrorsToast: () => ({ showAPIErrorsToast: vi.fn() }),
}));

describe("SignInForm", () => {
  it("renders the login card with email, password and submit button", () => {
    renderWithProviders(<SignInForm />);

    expect(screen.getByText("Login to your account")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
  });
});
