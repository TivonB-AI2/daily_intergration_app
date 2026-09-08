import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RotateCw,
  ShieldOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  listApiKeys,
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  reactivateApiKey,
  deleteApiKey,
  touchApiKey,
} from "@/services/db/apiKeyService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";

export const Route = createFileRoute("/_protected/secrets")({
  component: SecretsPage,
});

function maskKey(value: string) {
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function SecretsPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [justCreatedValue, setJustCreatedValue] = useState<string | null>(null);

  const { data: keys, isLoading: keysLoading } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: () => listApiKeys(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createApiKey({
        data: {
          name: newKeyName,
          expiresAt: newKeyExpiry || undefined,
        },
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      setJustCreatedValue(row.keyValue);
      setNewKeyName("");
      setNewKeyExpiry("");
      logAudit({
        action: "Created API key",
        resource: row.name,
        page: "/secrets",
        category: "secrets",
        status: "success",
      });
    },
    onError: (error) => {
      toast.error(`Failed to create key: ${error.message}`);
      logAudit({
        action: "Failed to create API key",
        resource: newKeyName,
        page: "/secrets",
        category: "secrets",
        status: "failure",
      });
    },
  });

  const rotateMut = useMutation({
    mutationFn: (id: number) => rotateApiKey({ data: id }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      setJustCreatedValue(row.keyValue);
      setRevealedId(row.id);
      toast.success(`"${row.name}" rotated — copy the new value now`);
      logAudit({
        action: "Rotated API key",
        resource: row.name,
        page: "/secrets",
        category: "secrets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to rotate key"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => revokeApiKey({ data: id }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      toast.success(`"${row.name}" revoked`);
      logAudit({
        action: "Revoked API key",
        resource: row.name,
        page: "/secrets",
        category: "secrets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to revoke key"),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: number) => reactivateApiKey({ data: id }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      toast.success(`"${row.name}" reactivated`);
      logAudit({
        action: "Reactivated API key",
        resource: row.name,
        page: "/secrets",
        category: "secrets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to reactivate key"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteApiKey({ data: id }),
    onSuccess: (_, id) => {
      const deleted = keys?.find((k) => k.id === id);
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      toast.success("Key deleted");
      logAudit({
        action: "Deleted API key",
        resource: deleted?.name ?? "Key",
        page: "/secrets",
        category: "secrets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to delete key"),
  });

  const touchMut = useMutation({
    mutationFn: (id: number) => touchApiKey({ data: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] }),
  });

  function handleCopy(id: number, value: string) {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
    touchMut.mutate(id);
  }

  function handleCreateSubmit() {
    if (!newKeyName.trim()) {
      toast.error("Please give the key a name");
      return;
    }
    createMut.mutate();
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setJustCreatedValue(null);
  }

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dbEnabled) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyMedia>
            <KeyRound className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Database Not Configured</EmptyTitle>
            <EmptyDescription>
              Enable the database to manage secrets and API keys.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (keysLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Secrets & API Keys
          </h1>
          <p className="text-muted-foreground text-sm">
            Generate and manage secrets used by your integrations
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setJustCreatedValue(null);
          }}
        >
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            New Secret
          </DialogTrigger>
          {createOpen && (
            <DialogContent>
              {justCreatedValue ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Secret created</DialogTitle>
                    <DialogDescription>
                      Copy this value now — it won't be shown again in full.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={justCreatedValue}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(justCreatedValue);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button type="button" onClick={closeCreateDialog}>
                      Done
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Create a new secret</DialogTitle>
                    <DialogDescription>
                      A random secret value will be generated for you.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Name *</Label>
                      <Input
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Zapier Integration"
                      />
                    </div>
                    <div>
                      <Label>Expires on (optional)</Label>
                      <Input
                        type="date"
                        value={newKeyExpiry}
                        onChange={(e) => setNewKeyExpiry(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreateSubmit}
                      disabled={createMut.isPending}
                    >
                      Create Secret
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          )}
        </Dialog>
      </div>

      {!keys || keys.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <KeyRound className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No Secrets Yet</EmptyTitle>
            <EmptyDescription>
              Create your first secret to get started
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const revealed = revealedId === key.id;
                const displayValue = revealed
                  ? key.keyValue
                  : maskKey(key.keyValue);
                const expired =
                  !!key.expiresAt && new Date(key.expiresAt) < new Date();
                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span>{displayValue}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            setRevealedId(revealed ? null : key.id)
                          }
                        >
                          {revealed ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopy(key.id, key.keyValue)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          key.status === "active" && !expired
                            ? "default"
                            : "secondary"
                        }
                      >
                        {expired && key.status === "active"
                          ? "expired"
                          : key.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(key.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(key.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Rotate"
                        onClick={() => rotateMut.mutate(key.id)}
                        disabled={rotateMut.isPending}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      {key.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Revoke"
                          onClick={() => revokeMut.mutate(key.id)}
                          disabled={revokeMut.isPending}
                        >
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reactivate"
                          onClick={() => reactivateMut.mutate(key.id)}
                          disabled={reactivateMut.isPending}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="ghost" size="icon" />}
                        >
                          <Trash2 className="h-4 w-4" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete this secret?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes "{key.name}". Any
                              integration using it will stop working
                              immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMut.mutate(key.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
