import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Render a component inside the providers views rely on (React Query).
 *
 * A fresh QueryClient per call keeps tests isolated; retries are disabled so a
 * failed query surfaces immediately instead of hanging the test. Router/auth
 * hooks are template-specific — mock those per test file with `vi.mock(...)`.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    ...options,
  });
}
