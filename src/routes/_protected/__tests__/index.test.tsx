import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Route } from "@/routes/_protected/index";

const DashboardPage = Route.options.component as () => React.ReactElement;

describe("Blank landing page", () => {
  it("renders the placeholder welcome content", () => {
    render(<DashboardPage />);

    expect(screen.getByText(/Welcome to/)).toBeInTheDocument();
    expect(
      screen.getByText("Start building your app here."),
    ).toBeInTheDocument();
  });
});
