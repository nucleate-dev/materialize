"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { SectionCard, SectionHeader } from "./SettingsHelpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  scopes: string;
  expires_at: string | null;
  created_at: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_SERVER_ENDPOINT || "http://localhost:3000";

export function ApiKeysTab() {
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();
  const activeTeamId = activeTeam?.id;

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Create key dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiration, setNewKeyExpiration] = useState<string>("never");
  const [isCreating, setIsCreating] = useState(false);

  // Newly created key state (shown once)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Delete state
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Fetch API keys
  const fetchApiKeys = useCallback(async () => {
    if (!activeTeamId) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${API_BASE_URL}/api-keys/list?team_id=${activeTeamId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch API keys: ${response.status}`);
      }

      const data = await response.json();
      if (data.data) {
        setApiKeys(data.data.keys || []);
      } else {
        throw new Error(data.error?.message || "Failed to fetch API keys");
      }
    } catch (error) {
      logger.debug("error", "Error fetching API keys:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to fetch API keys"
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeTeamId, logger]);

  // Create new API key
  const handleCreateKey = async () => {
    if (!activeTeamId || !newKeyName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      logger.log({
        event: "client_api_key_create_started",
        properties: {
          teamId: activeTeamId,
        },
      });

      const body: {
        name: string;
        team_id: string;
        expires_in_days?: number;
      } = {
        name: newKeyName.trim(),
        team_id: activeTeamId,
      };

      if (newKeyExpiration !== "never") {
        body.expires_in_days = parseInt(newKeyExpiration, 10);
      }

      const response = await fetch(`${API_BASE_URL}/api-keys/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Failed to create API key: ${response.status}`
        );
      }

      const data = await response.json();
      if (data.data) {
        logger.log({
          event: "client_api_key_create_success",
          properties: {
            teamId: activeTeamId,
            keyId: data.data.id,
          },
        });

        // Show the newly created key
        setNewlyCreatedKey(data.data);
        setShowNewKey(true);
        setIsCreateDialogOpen(false);
        setNewKeyName("");
        setNewKeyExpiration("never");

        // Refresh the list
        await fetchApiKeys();
      } else {
        throw new Error(data.error?.message || "Failed to create API key");
      }
    } catch (error) {
      logger.debug("error", "Error creating API key:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to create API key"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Revoke API key
  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    setDeletingKeyId(keyId);
    setError(null);

    try {
      const supabase = (await import("@/ClientConstants")).supabase;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      logger.log({
        event: "client_api_key_revoke_started",
        properties: {
          teamId: activeTeamId,
          keyId,
        },
      });

      const response = await fetch(`${API_BASE_URL}/api-keys/${keyId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `Failed to revoke API key: ${response.status}`
        );
      }

      logger.log({
        event: "client_api_key_revoke_success",
        properties: {
          teamId: activeTeamId,
          keyId,
        },
      });

      // Refresh the list
      await fetchApiKeys();
    } catch (error) {
      logger.debug("error", "Error revoking API key:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setError(
        error instanceof Error ? error.message : "Failed to revoke API key"
      );
    } finally {
      setDeletingKeyId(null);
    }
  };

  // Copy key to clipboard
  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  // Fetch keys on mount and team change
  useEffect(() => {
    void fetchApiKeys();
  }, [fetchApiKeys]);

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format relative time
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never used";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateString);
  };

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            API Keys
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground text-lg">
            Manage API keys for programmatic access to Nucleate.
          </p>
        </div>

        {/* API Keys List */}
        <SectionCard>
          <SectionHeader
            title="API Keys"
            description="Use API keys to authenticate with the Nucleate API or MCP server"
            icon={Key}
          />
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* Create Key Button */}
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </Button>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                {/* Keys List */}
                {apiKeys.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium mb-1">No API keys yet</p>
                    <p className="text-sm">
                      Create an API key to use with Claude Code or other MCP clients.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((apiKey) => (
                      <div
                        key={apiKey.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {apiKey.name}
                            </span>
                            <code className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-muted text-gray-600 dark:text-gray-400 font-mono">
                              {apiKey.key_prefix}...
                            </code>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <span>Created {formatDate(apiKey.created_at)}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(apiKey.last_used_at)}</span>
                            {apiKey.expires_at && (
                              <>
                                <span>•</span>
                                <span>Expires {formatDate(apiKey.expires_at)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeKey(apiKey.id)}
                          disabled={deletingKeyId === apiKey.id}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          {deletingKeyId === apiKey.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Usage Instructions */}
                <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Using API Keys
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    Add your API key to Claude Code by updating your MCP configuration:
                  </p>
                  <pre className="text-xs bg-blue-100 dark:bg-blue-900/50 p-3 rounded overflow-x-auto text-blue-800 dark:text-blue-200">
{`// ~/.mcp.json
{
  "mcpServers": {
    "nucleate": {
      "command": "npx",
      "args": ["@nucleate/mcp-server"],
      "env": {
        "NUCLEATE_AUTH_TOKEN": "nuc_your_key_here"
      }
    }
  }
}`}
                  </pre>
                </div>
              </>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access to Nucleate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Claude Code, CI/CD Pipeline"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                A descriptive name to identify this key
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiration">Expiration</Label>
              <Select value={newKeyExpiration} onValueChange={setNewKeyExpiration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim() || isCreating}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Key Created Dialog */}
      <Dialog
        open={!!newlyCreatedKey}
        onOpenChange={(open) => {
          if (!open) {
            setNewlyCreatedKey(null);
            setShowNewKey(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Make sure to copy your API key now. For security reasons, we
                  can&apos;t show it again after you close this dialog.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Your API Key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 rounded-lg bg-gray-100 dark:bg-muted font-mono text-sm break-all">
                  {showNewKey ? newlyCreatedKey?.key : "•".repeat(40)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewKey(!showNewKey)}
                >
                  {showNewKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newlyCreatedKey && handleCopyKey(newlyCreatedKey.key)}
                >
                  {copiedKey ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setNewlyCreatedKey(null);
                setShowNewKey(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
