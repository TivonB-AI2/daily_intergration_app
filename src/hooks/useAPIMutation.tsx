import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { hasApiErrors } from "@/services/common";
import { useAPIErrorsToast } from "@/hooks/useErrorToast";

export type UseAPIMutationOptions<TData, TPayload> = {
  mutationFn: (_payload: TPayload) => Promise<TData>;
  successMessage?: string;
  errorMessage?: string;
  onSuccessCallback?: (_result: TData) => void;
};

/**
 * Standardized mutation hook with success/error toasts and optional callback.
 * When result has errors (ApiResponse.errors), shows API error toasts; otherwise
 * shows success toast and calls onSuccessCallback.
 * Returns { isSubmitting, triggerMutation }. Call triggerMutation(variables) to run.
 */
export default function useAPIMutation<
  TData = unknown,
  TPayload = unknown,
  TError = Error,
>(options: UseAPIMutationOptions<TData, TPayload>) {
  const { mutationFn, successMessage, errorMessage, onSuccessCallback } =
    options;
  const { showAPIErrorsToast } = useAPIErrorsToast();

  const mutation = useMutation<TData, TError, TPayload>({
    mutationFn,
    onSuccess: (result) => {
      if (hasApiErrors(result)) {
        showAPIErrorsToast(result.errors);
        return;
      }
      if (successMessage) {
        toast.success(successMessage);
      }
      onSuccessCallback?.(result as TData);
    },
    onError: () => {
      if (errorMessage) {
        toast.error(errorMessage);
      }
    },
  });

  const triggerMutation = useCallback(
    async (variables: TPayload) => {
      return mutation.mutateAsync(variables);
    },
    [mutation],
  );

  return {
    isSubmitting: mutation.isPending,
    triggerMutation,
    mutation,
  };
}
