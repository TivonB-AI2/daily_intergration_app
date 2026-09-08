import { useQuery } from "@tanstack/react-query";
import { getCapabilities } from "@/services/capabilitiesService";

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: () => getCapabilities(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
