import { useState } from "react";
import { RotateCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Refreshes the *whole* app, not just the current page's data: clears every
 * cached query (so nothing stale is served from memory after reload) and
 * then does a real browser navigation back to the current URL. A plain
 * `location.reload()` can still be served from the disk/back-forward cache
 * by the browser; re-navigating to the same href with a fresh `Request`
 * (`cache: "reload"` isn't available for full-page navigations, so a
 * cache-busting reload is done via `location.replace` after clearing the
 * Cache Storage API, when present) forces every asset and data request to
 * go back to the network.
 */
export function RefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);

    // Drop every cached query result so the reloaded app can't briefly show
    // stale in-memory data before its own queries re-fetch.
    queryClient.clear();

    // Best-effort: clear any Cache Storage entries (e.g. from a service
    // worker) so static assets are re-fetched from the network too.
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Cache Storage isn't available/permitted in every context — a full
        // reload below still refreshes app data either way.
      }
    }

    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRefresh}
      disabled={isRefreshing}
      title="Refresh the whole app"
      className="h-9 w-9"
    >
      <RotateCw
        className={cn("h-4 w-4 transition-transform", {
          "animate-spin": isRefreshing,
        })}
      />
    </Button>
  );
}
