"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useActiveTeam } from "@/contexts/TeamContext";
import { cn } from "@/lib/classNames";
import {
  Check,
  ChevronsUpDown,
  FileText,
  Figma,
  Github,
  Loader2,
  Link2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface ContextDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
};

export default function ContextDropdown({
  isOpen,
  onClose,
}: ContextDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { activeTeam } = useActiveTeam();
  const comboboxId = useId();

  const [githubStatus, setGithubStatus] = useState<{
    connected: boolean;
    loading: boolean;
  }>({ connected: false, loading: true });
  const [repositories, setRepositories] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  // Fetch GitHub status and repositories when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    async function fetchGitHubData() {
      if (!activeTeam?.id) {
        setGithubStatus({ connected: false, loading: false });
        return;
      }

      setGithubStatus({ connected: false, loading: true });

      try {
        const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!serverEndpoint || !token) {
          setGithubStatus({ connected: false, loading: false });
          return;
        }

        // Check GitHub integration status
        const statusResponse = await fetch(
          `${serverEndpoint}/github/status?teamId=${activeTeam.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const statusResult = await statusResponse.json();
        const isConnected = statusResult.data?.connected ?? false;
        setGithubStatus({ connected: isConnected, loading: false });

        // If connected, fetch repositories
        if (isConnected) {
          setIsLoadingRepos(true);
          try {
            const reposResponse = await fetch(
              `${serverEndpoint}/github/repositories?teamId=${activeTeam.id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            );

            const reposResult = await reposResponse.json();
            if (reposResult.data?.repositories) {
              setRepositories(
                reposResult.data.repositories.map(
                  (repo: { id: number; name: string; full_name: string }) => ({
                    id: repo.id,
                    name: repo.name,
                    full_name: repo.full_name,
                  }),
                ),
              );
            }
          } catch {
            // Failed to fetch repositories
          } finally {
            setIsLoadingRepos(false);
          }
        }
      } catch {
        setGithubStatus({ connected: false, loading: false });
      }
    }

    fetchGitHubData();
  }, [isOpen, activeTeam?.id]);

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        // Don't close if clicking inside the combobox popover
        const popoverContent = document.querySelector(
          "[data-radix-popper-content-wrapper]",
        );
        if (popoverContent?.contains(event.target as Node)) {
          return;
        }
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleLinkRepository = () => {
    if (!selectedRepoId) return;

    setIsLinking(true);
    // TODO: Implement backend route to link repository
    // For now, just simulate the action
    console.log("Linking repository:", selectedRepoId);
    setIsLinking(false);
  };

  const selectedRepo = repositories.find((repo) => repo.id === selectedRepoId);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full mb-2 right-0 w-80 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="text-base font-semibold text-foreground">Context</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Link context for Nucleate to reference.
        </div>
      </div>

      {/* GitHub Repository Section */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Github className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            GitHub Repository
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Reference existing repo for themes, components, and screens. Push PRs
          with desired changes.
        </p>

        {githubStatus.loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Checking GitHub connection...</span>
          </div>
        ) : !githubStatus.connected ? (
          <div className="text-xs text-muted-foreground py-2 px-3 bg-muted/50 rounded-md">
            Connect GitHub in team settings to link a repository.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Repository Selector */}
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  aria-controls={comboboxId}
                  disabled={isLoadingRepos}
                  className={cn(
                    "h-9 w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    "flex items-center justify-between",
                  )}
                >
                  <span className="truncate text-left">
                    {isLoadingRepos ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading repositories...
                      </span>
                    ) : selectedRepo ? (
                      selectedRepo.full_name
                    ) : (
                      <span className="text-muted-foreground">
                        Select a repository...
                      </span>
                    )}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 bg-card border-border"
                align="start"
              >
                <Command className="bg-card">
                  <CommandInput
                    placeholder="Search repositories..."
                    className="h-9 border-0 focus:ring-0 text-foreground"
                  />
                  <CommandList id={comboboxId}>
                    <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                      No repository found.
                    </CommandEmpty>
                    <CommandGroup>
                      {repositories.map((repo) => (
                        <CommandItem
                          key={repo.id}
                          value={repo.full_name}
                          onSelect={() => {
                            setSelectedRepoId(
                              repo.id === selectedRepoId ? null : repo.id,
                            );
                            setComboboxOpen(false);
                          }}
                          className="cursor-pointer text-foreground hover:bg-muted"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedRepoId === repo.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {repo.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Figma Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Figma className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Figma</span>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Coming Soon
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Import designs directly from Figma to guide your prototype&apos;s look
          and feel.
        </p>
      </div>

      {/* Google Docs Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Google Docs
            </span>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Coming Soon
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Link product specs and documentation to provide additional context for
          your agent.
        </p>
      </div>

      {/* Footer with Add Context Button */}
      <div className="p-4 border-t border-border bg-muted/30">
        <Button
          type="button"
          onClick={handleLinkRepository}
          disabled={!selectedRepoId || isLinking}
          className="w-full h-9"
        >
          {isLinking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Adding...
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4 mr-2" />
              Add Context
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
