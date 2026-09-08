import { useMutation } from "@tanstack/react-query";
import { embedSearchQuery } from "@/services/ai/aiModelService";

/** Turns free-text into an embedding vector (via `aiModelService`) for
 * true semantic search, as opposed to plain keyword matching. */
export function useEmbedSearchQuery() {
  return useMutation({
    mutationFn: (text: string) => embedSearchQuery({ data: { text } }),
  });
}
