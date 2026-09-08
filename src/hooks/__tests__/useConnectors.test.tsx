import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeModelMutationOptions = vi.fn(() => ({
  mutationKey: ["connectors", "executeModel"],
  mutationFn: vi.fn(),
}));

vi.mock("@/integrations/trpc/react", () => ({
  trpc: {
    useTRPC: () => ({
      connectors: {
        executeModel: { mutationOptions: executeModelMutationOptions },
      },
    }),
  },
}));

import { useExecuteModel } from "../useConnectors";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useExecuteModel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires t.connectors.executeModel.mutationOptions()", () => {
    renderHook(() => useExecuteModel(), { wrapper });
    expect(executeModelMutationOptions).toHaveBeenCalled();
  });
});
