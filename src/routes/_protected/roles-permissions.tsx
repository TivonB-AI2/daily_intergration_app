import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Search, Shield, Trash2 } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getAuthState } from "@/server/auth";
import { routes as navRoutes } from "@/components/layout/index";
import { isNavGroup, type NavItem } from "@/components/layout/nav";
import {
  createRole,
  deleteRole,
  duplicateRole,
  listRoles,
  setRolePermissions,
} from "@/services/db/roleService";
import type { RoleWithPermissions } from "@/services/db/roleService";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown, UserPlus, Users } from "lucide-react";
import {
  createTeamMember,
  deleteTeamMember,
  listTeamMembers,
  updateTeamMember,
  type TeamMemberWithRole,
} from "@/services/db/teamMemberService";

export const Route = createFileRoute("/_protected/roles-permissions")({
  component: RolesPermissionsPage,
});

const ROLE_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
];

type PageSection = { label: string; items: NavItem[] };

/** Groups nav entries into labeled sections; standalone items (Dashboard,
 * Theme, Settings, etc.) go under a synthetic "General" section so every
 * page still has a group heading in the matrix. */
function groupNavEntries(entries: typeof navRoutes): PageSection[] {
  const sections: PageSection[] = [];
  const general: NavItem[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      sections.push({ label: entry.label, items: entry.items });
    } else {
      general.push(entry);
    }
  }
  if (general.length > 0) {
    sections.unshift({ label: "General", items: general });
  }
  return sections;
}

function RolesPermissionsPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const { data: authState } = useQuery({
    queryKey: ["authState"],
    queryFn: () => getAuthState(),
    staleTime: 60_000,
  });
  const isPublicApp = authState?.authEnabled === false;
  const dbEnabled = caps?.databaseEnabled === true;

  const sections = useMemo(() => groupNavEntries(navRoutes), []);
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.title.toLowerCase().includes(term) ||
            s.label.toLowerCase().includes(term),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, search]);

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role created.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted.");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicateRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role duplicated.");
    },
  });

  const setPermsMutation = useMutation({
    mutationFn: setRolePermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const [activeTab, setActiveTab] = useState("matrix");

  useEffect(() => {
    if (isPublicApp && activeTab === "members") {
      setActiveTab("matrix");
    }
  }, [isPublicApp, activeTab]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState(ROLE_COLORS[0]);

  function resetForm() {
    setNewName("");
    setNewDescription("");
    setNewColor(ROLE_COLORS[0]);
  }

  function handleCreate() {
    if (!newName.trim()) {
      toast.error("Give the role a name.");
      return;
    }
    createMutation.mutate(
      {
        data: {
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          color: newColor,
        },
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      },
    );
  }

  function togglePermission(
    role: RoleWithPermissions,
    pageKey: string,
    checked: boolean,
  ) {
    const nextKeys = checked
      ? [...role.pageKeys, pageKey]
      : role.pageKeys.filter((k) => k !== pageKey);
    setPermsMutation.mutate({ data: { roleId: role.id, pageKeys: nextKeys } });
  }

  function grantAll(role: RoleWithPermissions) {
    const allTitles = sections.flatMap((s) => s.items.map((i) => i.title));
    setPermsMutation.mutate({ data: { roleId: role.id, pageKeys: allTitles } });
  }

  function revokeAll(role: RoleWithPermissions) {
    setPermsMutation.mutate({ data: { roleId: role.id, pageKeys: [] } });
  }

  const isLoading = rolesLoading || capsLoading;
  const allPageCount = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            User Roles & Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define roles and mark which pages each one should have access to.
          </p>
        </div>
        {dbEnabled && (
          <div>
            {createOpen && (
              <Dialog
                open
                onOpenChange={(next) => {
                  if (!next) {
                    setCreateOpen(false);
                    resetForm();
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Role</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Name</Label>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Editor"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Description (optional)</Label>
                      <Input
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="What this role is for"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Color</Label>
                      <div className="flex items-center gap-2">
                        {ROLE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="h-7 w-7 rounded-full border-2"
                            style={{
                              backgroundColor: c,
                              borderColor:
                                newColor === c
                                  ? "var(--foreground)"
                                  : "transparent",
                            }}
                            onClick={() => setNewColor(c)}
                            aria-label={`Choose color ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCreateOpen(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      Create Role
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New Role
            </Button>
          </div>
        )}
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Reference matrix, not enforced access control</AlertTitle>
        <AlertDescription>
          Sign-in for this app is managed by the platform, so this page can't
          restrict real logins. Use it to document which pages each role is
          intended to access, and which team member has which role.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="matrix">Permissions Matrix</TabsTrigger>
          <TabsTrigger value="members" disabled={isPublicApp}>
            Team Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="flex flex-col gap-4 pt-4">
          {!dbEnabled && !capsLoading ? (
            <Alert>
              <AlertTitle>Database not configured</AlertTitle>
              <AlertDescription>
                Roles & permissions need a database connection to be saved.
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !roles || roles.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Shield />
                </EmptyMedia>
                <EmptyTitle>No roles yet</EmptyTitle>
                <EmptyDescription>
                  Create a role to start defining page access.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="Search pages or sections..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearch("")}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <Card className="sidebar-surface overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-inherit min-w-48">
                        Page
                      </TableHead>
                      {roles.map((role) => (
                        <TableHead
                          key={role.id}
                          className="text-center min-w-40"
                        >
                          <div className="flex flex-col items-center gap-1.5 py-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: role.color }}
                              />
                              <span className="font-medium">{role.name}</span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {role.pageKeys.length}/{allPageCount}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs"
                                onClick={() => grantAll(role)}
                                disabled={setPermsMutation.isPending}
                              >
                                All
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs"
                                onClick={() => revokeAll(role)}
                                disabled={setPermsMutation.isPending}
                              >
                                None
                              </Button>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() =>
                                        duplicateMutation.mutate({
                                          data: role.id,
                                        })
                                      }
                                      aria-label={`Duplicate ${role.name}`}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  }
                                />
                                <TooltipContent>Duplicate role</TooltipContent>
                              </Tooltip>
                              <AlertDialog>
                                <AlertDialogTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      aria-label={`Delete ${role.name}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  }
                                />
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete role "{role.name}"?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This removes the role and its page
                                      permissions. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        deleteMutation.mutate({ data: role.id })
                                      }
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSections.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={roles.length + 1}
                          className="text-center text-sm text-muted-foreground py-6"
                        >
                          No pages match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSections.map((section) => (
                        <Fragment key={section.label}>
                          <TableRow className="bg-muted/40">
                            <TableCell
                              colSpan={roles.length + 1}
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5"
                            >
                              {section.label}
                            </TableCell>
                          </TableRow>
                          {section.items.map((page) => (
                            <TableRow key={page.url}>
                              <TableCell className="sticky left-0 bg-inherit font-medium">
                                {page.title}
                              </TableCell>
                              {roles.map((role) => (
                                <TableCell
                                  key={role.id}
                                  className="text-center"
                                >
                                  <Checkbox
                                    checked={role.pageKeys.includes(page.title)}
                                    onCheckedChange={(checked) =>
                                      togglePermission(
                                        role,
                                        page.title,
                                        checked === true,
                                      )
                                    }
                                  />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          {isPublicApp ? (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Team Members is disabled for public apps</AlertTitle>
              <AlertDescription>
                This app is published as Public, so there's no sign-in and no
                concept of "who has access" to manage. Team Members
                automatically becomes available again if the app is switched to
                invite-only access.
              </AlertDescription>
            </Alert>
          ) : (
            <TeamMembersPanel
              dbEnabled={dbEnabled}
              capsLoading={capsLoading}
              roles={roles ?? []}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const NO_ROLE_VALUE = "none";

function TeamMembersPanel({
  dbEnabled,
  capsLoading,
  roles,
}: {
  dbEnabled: boolean;
  capsLoading: boolean;
  roles: RoleWithPermissions[];
}) {
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => listTeamMembers(),
    enabled: dbEnabled,
    staleTime: 15_000,
  });

  // The signed-in user is auto-registered globally (see
  // `useAutoRegisterTeamMember`, mounted in `app-layout.tsx` so it runs on
  // every page, not just this one) — no per-panel auto-add logic needed here.

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [roleId, setRoleId] = useState<string>(NO_ROLE_VALUE);
  const [isOwner, setIsOwner] = useState(false);

  const existingOwner = members?.find((m) => m.isOwner);

  function resetMemberForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setTitle("");
    setRoleId(NO_ROLE_VALUE);
    setIsOwner(false);
  }

  function openCreate() {
    resetMemberForm();
    setDialogOpen(true);
  }

  function openEdit(member: TeamMemberWithRole) {
    setEditingId(member.id);
    setName(member.name);
    setEmail(member.email);
    setTitle(member.title ?? "");
    setRoleId(member.roleId ? String(member.roleId) : NO_ROLE_VALUE);
    setIsOwner(member.isOwner);
    setDialogOpen(true);
  }

  const createMutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      toast.success("Team member added.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      toast.success("Team member updated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      toast.success("Team member removed.");
    },
  });

  function handleSave() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    const payload = {
      name: name.trim(),
      email: email.trim(),
      title: title.trim() || undefined,
      roleId: roleId === NO_ROLE_VALUE ? null : Number(roleId),
      isOwner,
    };
    if (editingId) {
      updateMutation.mutate(
        { data: { id: editingId, ...payload } },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetMemberForm();
          },
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetMemberForm();
          },
        },
      );
    }
  }

  const isLoading = membersLoading || capsLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          List the people invited to or with access to this app, and assign each
          one a role from the Permissions Matrix tab. This app has no platform
          API to read the live invite list automatically, so you're added
          automatically the first time you open the app — add anyone else with
          access manually, and keep the list up to date as people are invited or
          leave.
        </p>
        {dbEnabled && (
          <Button className="shrink-0" onClick={openCreate}>
            <UserPlus />
            Add Member
          </Button>
        )}
      </div>

      {dialogOpen && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setDialogOpen(false);
              resetMemberForm();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Team Member" : "Add Team Member"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Title (optional)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Support Lead"
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="team-member-owner"
                  checked={isOwner}
                  onCheckedChange={(v) => setIsOwner(v === true)}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="team-member-owner" className="cursor-pointer">
                    App Owner
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The Owner is always Admin and their role can't be changed.
                    Only one person can be Owner at a time
                    {existingOwner && existingOwner.id !== editingId
                      ? ` — marking this person Owner will remove that status from ${existingOwner.name}.`
                      : "."}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select
                  value={isOwner ? "admin-owner" : roleId}
                  onValueChange={(v) => setRoleId(v ?? NO_ROLE_VALUE)}
                  disabled={isOwner}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                    {isOwner && (
                      <SelectItem value="admin-owner">Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {isOwner && (
                  <p className="text-xs text-muted-foreground">
                    Locked to Admin because this person is the Owner.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetMemberForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingId ? "Save Changes" : "Add Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {!dbEnabled && !capsLoading ? (
        <Alert>
          <AlertTitle>Database not configured</AlertTitle>
          <AlertDescription>
            Team members need a database connection to be saved.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !members || members.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No team members yet</EmptyTitle>
            <EmptyDescription>
              Add a team member and assign them a role.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="sidebar-surface p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {member.name}
                      {member.isOwner && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
                        >
                          <Crown className="h-3 w-3" />
                          Owner
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    {member.roleName ? (
                      <Badge
                        variant="outline"
                        className="gap-1.5"
                        style={{ borderColor: member.roleColor ?? undefined }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: member.roleColor ?? undefined,
                          }}
                        />
                        {member.roleName}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        No role
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(member)}
                      >
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${member.name}`}
                              disabled={member.isOwner}
                              title={
                                member.isOwner
                                  ? "The Owner can't be removed. Unset them as Owner first."
                                  : undefined
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Remove "{member.name}"?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes them from the team directory. This
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                deleteMutation.mutate({ data: member.id })
                              }
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
