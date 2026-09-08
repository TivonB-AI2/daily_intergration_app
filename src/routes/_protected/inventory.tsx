import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Plus,
  Trash2,
  Edit2,
  Package,
  Search,
  X,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { downloadCsv } from "@/lib/csvExport";
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  updateInventoryItemStatus,
  deleteInventoryItem,
} from "@/services/db/inventoryService";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_protected/inventory")({
  component: InventoryPage,
});

type InventoryFormData = {
  name: string;
  description: string;
  sku: string;
  category: string | null;
  quantity: string;
  price: string;
  status: "active" | "inactive" | "discontinued";
};

const STATUS_BADGES: Record<
  "active" | "inactive" | "discontinued",
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  inactive: "secondary",
  discontinued: "destructive",
};

const CATEGORIES = [
  "Electronics",
  "Furniture",
  "Office Supplies",
  "Tools",
  "Other",
];

function InventoryPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState<InventoryFormData>({
    name: "",
    description: "",
    sku: "",
    category: "Electronics",
    quantity: "0",
    price: "",
    status: "active",
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => listInventoryItems(),
    enabled: caps?.databaseEnabled === true,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createInventoryItem({
        data: {
          name: formData.name,
          description: formData.description || undefined,
          sku: formData.sku,
          category: formData.category || "Electronics",
          quantity: parseInt(formData.quantity) || 0,
          price: formData.price || undefined,
          status: formData.status,
        },
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item added successfully");
      resetForm();
      setOpen(false);
      // Log inventory item creation
      logAudit({
        action: "Created inventory item",
        resource: row.name,
        page: "/inventory",
        category: "inventory",
        status: "success",
      });
    },
    onError: (error) => {
      toast.error(`Failed to add item: ${error.message}`);
      // Log inventory creation error
      logAudit({
        action: "Failed to create inventory item",
        resource: formData.name,
        page: "/inventory",
        category: "inventory",
        status: "failure",
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (id: number) =>
      updateInventoryItem({
        data: {
          id,
          data: {
            name: formData.name,
            description: formData.description || undefined,
            sku: formData.sku,
            category: formData.category || "Electronics",
            quantity: parseInt(formData.quantity) || 0,
            price: formData.price || undefined,
            status: formData.status,
          },
        },
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item updated successfully");
      resetForm();
      setOpen(false);
      setEditingId(null);
      // Log inventory item update
      logAudit({
        action: "Updated inventory item",
        resource: row.name,
        page: "/inventory",
        category: "inventory",
        status: "success",
      });
    },
    onError: (error) => {
      toast.error(`Failed to update item: ${error.message}`);
      // Log inventory update error
      logAudit({
        action: "Failed to update inventory item",
        resource: formData.name,
        page: "/inventory",
        category: "inventory",
        status: "failure",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInventoryItem({ data: id }),
    onSuccess: (_, id) => {
      const deletedItem = items?.find((i) => i.id === id);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item deleted");
      // Log inventory item deletion
      logAudit({
        action: "Deleted inventory item",
        resource: deletedItem?.name ?? "Item",
        page: "/inventory",
        category: "inventory",
        status: "success",
      });
    },
    onError: () => {
      toast.error("Failed to delete item");
      // Log inventory deletion error
      logAudit({
        action: "Failed to delete inventory item",
        resource: "Item",
        page: "/inventory",
        category: "inventory",
        status: "failure",
      });
    },
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({
      ids,
      status,
    }: {
      ids: number[];
      status: "active" | "inactive" | "discontinued";
    }) =>
      Promise.all(
        ids.map((id) => updateInventoryItemStatus({ data: { id, status } })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Selected items updated");
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to update selected items"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => deleteInventoryItem({ data: id }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Selected items deleted");
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to delete selected items"),
  });

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter)
        return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.sku.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const hasActiveFilters =
    search.trim() !== "" || categoryFilter !== "all" || statusFilter !== "all";

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      sku: "",
      category: "Electronics",
      quantity: "0",
      price: "",
      status: "active",
    });
    setEditingId(null);
  };

  const handleEdit = (item: any) => {
    setFormData({
      name: item.name,
      description: item.description || "",
      sku: item.sku,
      category: item.category,
      quantity: String(item.quantity),
      price: item.price || "",
      status: item.status,
    });
    setEditingId(item.id);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.sku || !formData.category) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingId) {
      updateMut.mutate(editingId);
    } else {
      createMut.mutate();
    }
  };

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caps?.databaseEnabled) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyMedia>
            <Package className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Database Not Configured</EmptyTitle>
            <EmptyDescription>
              Enable the database to manage your inventory.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (itemsLoading) {
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
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm">
            Manage your items and track stock levels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={filteredItems.length === 0}
            onClick={() =>
              downloadCsv("inventory", filteredItems, [
                { key: "id", label: "ID" },
                { key: "name", label: "Name" },
                { key: "sku", label: "SKU" },
                { key: "category", label: "Category" },
                { key: "quantity", label: "Quantity" },
                { key: "price", label: "Price" },
                { key: "status", label: "Status" },
                { key: "createdAt", label: "Created At" },
              ])
            }
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              // Clear the editing item/form whenever the dialog closes for
              // any reason (Cancel, outside click, Escape) — not just on a
              // successful Save — so reopening via "Add Item" never shows
              // stale data from whichever item was last edited.
              if (!next) resetForm();
            }}
          >
            <DialogTrigger render={<Button />}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </DialogTrigger>
            {/* Conditionally mounted (rather than always-rendered with only
             * `open` toggling visibility) so React fully unmounts this
             * subtree the instant `open` flips to false — the project's
             * established fix for dialogs that could otherwise appear not
             * to close, see routes/AGENTS.md's "Design For Me"/"Secrets"
             * dialog-close entries. */}
            {open && (
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? "Edit Item" : "Add New Item"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingId
                      ? "Update the item details below"
                      : "Create a new inventory item"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Item name"
                    />
                  </div>

                  <div>
                    <Label>SKU *</Label>
                    <Input
                      value={formData.sku}
                      onChange={(e) =>
                        setFormData({ ...formData, sku: e.target.value })
                      }
                      placeholder="Stock keeping unit"
                    />
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <Select
                      value={formData.category || "Electronics"}
                      onValueChange={(v) =>
                        setFormData({ ...formData, category: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={formData.quantity}
                        onChange={(e) =>
                          setFormData({ ...formData, quantity: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Price</Label>
                      <Input
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          status: v as "active" | "inactive" | "discontinued",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="discontinued">
                          Discontinued
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder="Item description"
                      className="h-20"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={createMut.isPending || updateMut.isPending}
                  >
                    {editingId ? "Update Item" : "Add Item"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </div>

      {!items || items.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Package className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No Items Yet</EmptyTitle>
            <EmptyDescription>
              Create your first inventory item to get started
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => v && setCategoryFilter(v)}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <Empty>
              <EmptyMedia>
                <Search className="h-8 w-8" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No matching items</EmptyTitle>
                <EmptyDescription>
                  Try a different search term or clear the filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2.5">
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkStatusMut.mutate({
                          ids: Array.from(selectedIds),
                          status: "active",
                        })
                      }
                      disabled={bulkStatusMut.isPending}
                    >
                      Mark Active
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkStatusMut.mutate({
                          ids: Array.from(selectedIds),
                          status: "discontinued",
                        })
                      }
                      disabled={bulkStatusMut.isPending}
                    >
                      Mark Discontinued
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={bulkDeleteMut.isPending}
                          >
                            <Trash2 className="size-4" />
                            Delete selected
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete {selectedIds.size} item
                            {selectedIds.size === 1 ? "" : "s"}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the selected inventory
                            items. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              bulkDeleteMut.mutate(Array.from(selectedIds))
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredItems.length > 0 &&
                            filteredItems.every((i) => selectedIds.has(i.id))
                          }
                          onCheckedChange={() => {
                            setSelectedIds((prev) => {
                              const allSelected = filteredItems.every((i) =>
                                prev.has(i.id),
                              );
                              const next = new Set(prev);
                              if (allSelected) {
                                for (const i of filteredItems)
                                  next.delete(i.id);
                              } else {
                                for (const i of filteredItems) next.add(i.id);
                              }
                              return next;
                            });
                          }}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${item.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.sku}
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell>{(item.price as string) || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGES[item.status]}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            disabled={updateMut.isPending}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMut.mutate(item.id)}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
