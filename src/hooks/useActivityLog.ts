import { useCallback } from "react";
import { createErrorLog } from "@/services/db/errorLogService";
import { createAuditLog } from "@/services/db/auditLogService";
import type { ErrorLogInput } from "@/services/db/errorLogService";
import type { AuditLogInput } from "@/services/db/auditLogService";

/**
 * Shared logging hook for cross-cutting error and audit logging.
 *
 * Wraps createErrorLog/createAuditLog so pages don't need to repeat the
 * same server-fn call + `.catch(() => {})` pattern at every call site.
 * Both logging calls are fire-and-forget: failures are swallowed so a
 * logging issue never blocks the user's action.
 */
export function useActivityLog() {
  const logError = useCallback((data: ErrorLogInput) => {
    createErrorLog({ data }).catch(() => {});
  }, []);

  const logAudit = useCallback((data: AuditLogInput) => {
    createAuditLog({ data }).catch(() => {});
  }, []);

  return { logError, logAudit };
}
