"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamMcpServers } from "@/hooks/useTeamMcpServers";
import {
  Loader2,
  Plus,
  Plug,
  Trash,
  Pencil,
  Search,
  CheckCircle,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Database } from "@/lib/types/supabase";

type TeamMcpServer = Database["public"]["Tables"]["team_mcp_servers"]["Row"];

interface McpServersSectionProps {
  teamId: string | null;
}

export function McpServersSection({ teamId }: McpServersSectionProps) {
  const {
    mcpServers,
    isLoading,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
    toggleMcpServer,
    updateHealthStatus,
  } = useTeamMcpServers();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamMcpServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMcpServer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [formValues, setFormValues] = useState({
    server_name: "",
    description: "",
    server_url: "",
    transport_type: "http" as "http" | "sse",
    auth_type: "none" as "bearer" | "api_key" | "none",
    auth_header_name: "",
    auth_token: "",
  });

  const canMutate = Boolean(teamId);
  const isSaving = createMcpServer.isPending || updateMcpServer.isPending;
  const isDeleting = deleteMcpServer.isPending;

  const resetForm = () => {
    setFormValues({
      server_name: "",
      description: "",
      server_url: "",
      transport_type: "http",
      auth_type: "none",
      auth_header_name: "",
      auth_token: "",
    });
    setFormError(null);
  };

  const handleOpenCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleOpenEditDialog = (server: TeamMcpServer) => {
    setEditTarget(server);
    setFormValues({
      server_name: server.server_name,
      description: server.description ?? "",
      server_url: server.server_url,
      transport_type: server.transport_type as "http" | "sse",
      auth_type: (server.auth_type as "bearer" | "api_key" | "none") ?? "none",
      auth_header_name: server.auth_header_name ?? "",
      auth_token: "", // Don't show existing token
    });
    setFormError(null);
    setIsEditDialogOpen(true);
  };

  const handleOpenDeleteDialog = (server: TeamMcpServer) => {
    setDeleteTarget(server);
    setIsDeleteDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setIsCreateDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditTarget(null);
    resetForm();
  };

  const testConnection = async () => {
    if (!formValues.server_url) {
      setFormError("Server URL is required to test connection.");
      return;
    }

    setIsTesting(true);
    setFormError(null);

    try {
      // Simple fetch to check if the server is reachable
      const response = await fetch(formValues.server_url, {
        method: "OPTIONS",
        mode: "cors",
      });

      if (response.ok || response.status === 204) {
        setFormError(null);
        // Show success briefly
        alert("Connection successful!");
      } else {
        setFormError(`Server responded with status: ${response.status}`);
      }
    } catch (error) {
      setFormError(
        `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = formValues.server_name.trim();
    if (!trimmedName) {
      setFormError("Server name is required.");
      return;
    }
    if (!formValues.server_url.trim()) {
      setFormError("Server URL is required.");
      return;
    }

    try {
      new URL(formValues.server_url);
    } catch {
      setFormError("Invalid URL format.");
      return;
    }

    try {
      await createMcpServer.mutateAsync({
        server_name: trimmedName,
        description: formValues.description.trim() || null,
        server_url: formValues.server_url.trim(),
        transport_type: formValues.transport_type,
        auth_type: formValues.auth_type === "none" ? null : formValues.auth_type,
        auth_header_name:
          formValues.auth_type === "api_key"
            ? formValues.auth_header_name || null
            : null,
        auth_token_encrypted:
          formValues.auth_type !== "none" && formValues.auth_token
            ? formValues.auth_token
            : null,
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create MCP server."
      );
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;

    const trimmedName = formValues.server_name.trim();
    if (!trimmedName) {
      setFormError("Server name is required.");
      return;
    }

    try {
      const updates: Record<string, unknown> = {
        server_name: trimmedName,
        description: formValues.description.trim() || null,
        server_url: formValues.server_url.trim(),
        transport_type: formValues.transport_type,
        auth_type: formValues.auth_type === "none" ? null : formValues.auth_type,
        auth_header_name:
          formValues.auth_type === "api_key"
            ? formValues.auth_header_name || null
            : null,
      };

      // Only update token if a new one was provided
      if (formValues.auth_token) {
        updates.auth_token_encrypted = formValues.auth_token;
      }

      await updateMcpServer.mutateAsync({
        id: editTarget.id,
        updates,
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update MCP server."
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMcpServer.mutateAsync(deleteTarget.id);
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
    }
  };

  const handleToggle = async (server: TeamMcpServer) => {
    try {
      await toggleMcpServer.mutateAsync({
        id: server.id,
        isEnabled: !server.is_enabled,
      });
    } catch (error) {
      console.error("Failed to toggle MCP server:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "unhealthy":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const filteredServers = mcpServers.filter((s) =>
    s.server_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shouldShowEmptyState = !isLoading && mcpServers.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {!shouldShowEmptyState && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Filter MCP servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full bg-accent/50 border border-border rounded-lg pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border focus:bg-accent transition-all"
            />
          </div>
        )}
        <Button
          onClick={handleOpenCreateDialog}
          className="h-9 px-5 rounded-lg font-semibold text-sm gap-2"
          disabled={!canMutate || isSaving || isLoading}
        >
          <Plus className="w-4 h-4" />
          Add MCP Server
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-muted-foreground/50" />
          <p className="text-sm font-medium animate-pulse">
            Loading MCP servers...
          </p>
        </div>
      ) : shouldShowEmptyState ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-2xl bg-accent/20">
          <div className="p-4 bg-accent rounded-full mb-4">
            <Plug className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No MCP servers yet</h2>
          <p className="text-muted-foreground max-w-md text-center mb-6">
            Connect external MCP servers to extend your AI with custom tools and
            integrations.
          </p>
          <Button onClick={handleOpenCreateDialog} variant="outline">
            Connect your first server
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredServers.map((server) => (
            <div
              key={server.id}
              className="group flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-border/80 transition-all"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Switch
                  checked={server.is_enabled}
                  onCheckedChange={() => handleToggle(server)}
                  disabled={toggleMcpServer.isPending}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{server.server_name}</h3>
                    {getStatusIcon(server.health_status)}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {server.server_url}
                  </p>
                  {server.description && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-1">
                      {server.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpenEditDialog(server)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => handleOpenDeleteDialog(server)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Connect MCP Server</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="server-name">Server Name</Label>
                <Input
                  id="server-name"
                  value={formValues.server_name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, server_name: e.target.value })
                  }
                  placeholder="e.g. My Jira Server"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="server-description">Description (optional)</Label>
                <Input
                  id="server-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  placeholder="What does this server provide?"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="server-url">Server URL</Label>
                <Input
                  id="server-url"
                  value={formValues.server_url}
                  onChange={(e) =>
                    setFormValues({ ...formValues, server_url: e.target.value })
                  }
                  placeholder="https://your-mcp-server.com"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transport-type">Transport Type</Label>
                <Select
                  value={formValues.transport_type}
                  onValueChange={(value: "http" | "sse") =>
                    setFormValues({ ...formValues, transport_type: value })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-type">Authentication</Label>
                <Select
                  value={formValues.auth_type}
                  onValueChange={(value: "bearer" | "api_key" | "none") =>
                    setFormValues({ ...formValues, auth_type: value })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formValues.auth_type === "api_key" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-header">Header Name</Label>
                  <Input
                    id="auth-header"
                    value={formValues.auth_header_name}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        auth_header_name: e.target.value,
                      })
                    }
                    placeholder="X-API-Key"
                    disabled={isSaving}
                  />
                </div>
              )}
              {formValues.auth_type !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-token">
                    {formValues.auth_type === "bearer" ? "Token" : "API Key"}
                  </Label>
                  <Input
                    id="auth-token"
                    type="password"
                    value={formValues.auth_token}
                    onChange={(e) =>
                      setFormValues({ ...formValues, auth_token: e.target.value })
                    }
                    placeholder="Enter token..."
                    disabled={isSaving}
                  />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={isSaving || isTesting || !formValues.server_url}
                className="w-full"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Test Connection
              </Button>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseDialogs}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Edit MCP Server</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-server-name">Server Name</Label>
                <Input
                  id="edit-server-name"
                  value={formValues.server_name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, server_name: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-server-description">
                  Description (optional)
                </Label>
                <Input
                  id="edit-server-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-server-url">Server URL</Label>
                <Input
                  id="edit-server-url"
                  value={formValues.server_url}
                  onChange={(e) =>
                    setFormValues({ ...formValues, server_url: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-transport-type">Transport Type</Label>
                <Select
                  value={formValues.transport_type}
                  onValueChange={(value: "http" | "sse") =>
                    setFormValues({ ...formValues, transport_type: value })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="sse">SSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-auth-type">Authentication</Label>
                <Select
                  value={formValues.auth_type}
                  onValueChange={(value: "bearer" | "api_key" | "none") =>
                    setFormValues({ ...formValues, auth_type: value })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formValues.auth_type === "api_key" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-auth-header">Header Name</Label>
                  <Input
                    id="edit-auth-header"
                    value={formValues.auth_header_name}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        auth_header_name: e.target.value,
                      })
                    }
                    disabled={isSaving}
                  />
                </div>
              )}
              {formValues.auth_type !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-auth-token">
                    {formValues.auth_type === "bearer" ? "Token" : "API Key"}{" "}
                    (leave blank to keep existing)
                  </Label>
                  <Input
                    id="edit-auth-token"
                    type="password"
                    value={formValues.auth_token}
                    onChange={(e) =>
                      setFormValues({ ...formValues, auth_token: e.target.value })
                    }
                    placeholder="Enter new token to change..."
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseDialogs}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will permanently delete{" "}
              <span className="font-medium">{deleteTarget?.server_name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
