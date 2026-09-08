import { useMutation } from "@tanstack/react-query";
import {
  callAiModel,
  type AiChatMessage,
  type AiModelResponse,
} from "@/services/ai/aiModelService";
import { useExecuteModel } from "@/hooks/useConnectors";
import {
  AI_SQUARED_BOLT_CONNECTOR_ID,
  type AiProviderId,
} from "@/lib/aiProviders";

export type UseAiModelInput = {
  connectorId: AiProviderId;
  messages: AiChatMessage[];
  instructions?: string;
};

type AiModelMutateOptions = {
  onSuccess?: (data: { data: unknown[] }) => void;
  onError?: (error: Error) => void;
};

/** Builds the AI Squared Bolt payload directly (`{ messages }`, with
 * `instructions` merged in as a leading system message) instead of sending
 * `{ connectorId, messages, instructions }` to `useExecuteModel()`. That
 * "messages" variant makes the platform's `executeModel` procedure first
 * fetch the connector and run `buildLlmPayload()`, which throws if the
 * connector's own stored `configuration.request_format` is missing or not
 * valid JSON — a property of how that specific connector happens to be set
 * up on the platform, unrelated to whether the connector can actually run a
 * model. Sending the payload directly (the `{ connectorId, payload }`
 * variant) skips that fragile connector-config lookup entirely and matches
 * the shape confirmed to work when calling this connector's `execute_model`
 * endpoint directly. */
function buildAiSquaredBoltPayload(
  messages: AiChatMessage[],
  instructions?: string,
): Record<string, unknown> {
  return {
    messages: instructions
      ? [{ role: "system", content: instructions }, ...messages]
      : messages,
  };
}

/** Drop-in replacement for `useExecuteModel()` for this app's AI-powered
 * pages. Two of the three provider options ("anthropic"/"openai") call the
 * direct-secret path (`callAiModel`); "ai-squared-bolt" instead forwards to
 * the real platform connector (id `AI_SQUARED_BOLT_CONNECTOR_ID`) via
 * `useExecuteModel()`, sending a pre-built payload (see
 * `buildAiSquaredBoltPayload`) rather than raw `messages`/`instructions` —
 * both underlying calls return the same `{ data: [...] }` shape, so callers
 * can keep using `extractProviderText(res?.data)` regardless of which
 * provider was picked. */
export function useAiModel() {
  const direct = useMutation<
    AiModelResponse,
    Error,
    {
      provider: "anthropic" | "openai";
      messages: AiChatMessage[];
      instructions?: string;
    }
  >({
    mutationFn: (vars) => callAiModel({ data: vars }),
  });
  const connectorExec = useExecuteModel();

  const isPending = direct.isPending || connectorExec.isPending;
  const isError = direct.isError || connectorExec.isError;
  const data = (direct.data ?? connectorExec.data) as
    | { data: unknown[] }
    | undefined;

  function mutate(input: UseAiModelInput, options?: AiModelMutateOptions) {
    if (input.connectorId === "ai-squared-bolt") {
      connectorExec.mutate(
        {
          connectorId: AI_SQUARED_BOLT_CONNECTOR_ID,
          payload: buildAiSquaredBoltPayload(
            input.messages,
            input.instructions,
          ),
        },
        options as Parameters<typeof connectorExec.mutate>[1],
      );
      return;
    }
    direct.mutate(
      {
        provider: input.connectorId,
        messages: input.messages,
        instructions: input.instructions,
      },
      options as Parameters<typeof direct.mutate>[1],
    );
  }

  function mutateAsync(input: UseAiModelInput) {
    if (input.connectorId === "ai-squared-bolt") {
      return connectorExec.mutateAsync({
        connectorId: AI_SQUARED_BOLT_CONNECTOR_ID,
        payload: buildAiSquaredBoltPayload(input.messages, input.instructions),
      });
    }
    return direct.mutateAsync({
      provider: input.connectorId,
      messages: input.messages,
      instructions: input.instructions,
    });
  }

  return { mutate, mutateAsync, isPending, isError, data };
}
