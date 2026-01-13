"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  Check,
  Trash2,
  ExternalLink,
  Key,
  Crown,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useRouter } from "next/navigation";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { supabase } from "@/ClientConstants";
import { SectionCard, SectionHeader } from "./SettingsHelpers";

export function ClaudeConnectionTab() {
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();
  const { activeTeam } = useActiveTeam();
  const { user } = useUser();
  const router = useRouter();

  const [isProcessingUpgrade, setIsProcessingUpgrade] =
    useState<boolean>(false);
  const [hasClaudeToken, setHasClaudeToken] = useState<boolean>(false);
  const [claudeTokenInput, setClaudeTokenInput] = useState<string>("");
  const [isSavingToken, setIsSavingToken] = useState<boolean>(false);
  const [isDeletingToken, setIsDeletingToken] = useState<boolean>(false);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const currentSubscription = (userPlan as string) || "free";

  const handleUpgradeClick = async (targetPlan: string) => {
    try {
      setIsProcessingUpgrade(true);
      logger.log({
        event: "client_upgrade_checkout_clicked",
        properties: {
          source: "settings_dialog_claude",
          plan: targetPlan,
        },
      });
      if (activeTeam?.id) {
        await handleCheckout(targetPlan, router, activeTeam.id);
      }
      setTimeout(() => setIsProcessingUpgrade(false), 2000);
    } catch (error) {
      logger.debug("error", "Error starting checkout:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setIsProcessingUpgrade(false);
    }
  };

  // Check if user has a Claude token
  const checkClaudeToken = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("user_claude_tokens")
        .select("oauth_token, is_valid")
        .eq("user_id", user.id)
        .eq("is_valid", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasClaudeToken(true);
      } else {
        setHasClaudeToken(false);
      }
    } catch (error) {
      logger.debug("error", "Error checking Claude token:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setHasClaudeToken(false);
    }
  }, [logger, user?.id]);

  // Save Claude token
  const handleSaveClaudeToken = async () => {
    if (!user?.id || !claudeTokenInput.trim()) {
      setTokenError("Please enter a token");
      return;
    }

    setIsSavingToken(true);
    setTokenError(null);
    setTokenSaveSuccess(false);

    try {
      const { error } = await supabase.from("user_claude_tokens").upsert(
        {
          user_id: user.id,
          oauth_token: claudeTokenInput.trim(),
          token_type: "setup-token",
          is_valid: true,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) throw error;

      setTokenSaveSuccess(true);
      setClaudeTokenInput("");
      await checkClaudeToken();

      setTimeout(() => setTokenSaveSuccess(false), 3000);
    } catch (error) {
      logger.debug("error", "Error saving claude token", {
        error,
      });
      setTokenError(
        error instanceof Error ? error.message : "Failed to save token",
      );
    } finally {
      setIsSavingToken(false);
    }
  };

  // Delete Claude token
  const handleDeleteClaudeToken = async () => {
    if (!user?.id) return;

    setIsDeletingToken(true);
    setTokenError(null);

    try {
      const { error } = await supabase
        .from("user_claude_tokens")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setHasClaudeToken(false);
    } catch (error) {
      logger.debug("error", "Error deleting claude token: ", {
        error,
      });
      setTokenError(
        error instanceof Error ? error.message : "Failed to delete token",
      );
    } finally {
      setIsDeletingToken(false);
    }
  };

  // Check for token on mount and when user changes
  useEffect(() => {
    void checkClaudeToken();
  }, [checkClaudeToken]);

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Claude Connection
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Connect your Claude Pro or Max subscription for AI chat.
          </p>
        </div>

        {/* Claude Subscription Connection */}
        <SectionCard>
          <SectionHeader
            title="Claude Subscription"
            description="Connect your Claude Pro or Max subscription for AI chat"
            icon={Key}
          />
          <div className="p-6 space-y-6">
            {currentSubscription === "free" ? (
              /* Free Plan - Upgrade Required */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Crown className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-purple-700 dark:text-purple-300 mb-1">
                      Upgrade Required
                    </p>
                    <p className="text-sm text-purple-600 dark:text-purple-400">
                      Connect your Claude Pro or Max subscription to use
                      unlimited AI chat. This feature is available for Plus
                      subscribers and above.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleUpgradeClick("plus")}
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                  disabled={isProcessingUpgrade}
                >
                  {isProcessingUpgrade ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Crown className="w-4 h-4 mr-2" />
                  )}
                  Upgrade to Plus
                </Button>
              </div>
            ) : hasClaudeToken ? (
              /* Token Connected State */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                      Claude Subscription Connected
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Your AI chat will use your Claude Pro/Max subscription
                      instead of API credits.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleDeleteClaudeToken}
                    variant="outline"
                    disabled={isDeletingToken}
                    className="border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    {isDeletingToken ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              /* No Token State - Paid User */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Connect Your Claude Subscription
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      Use your Claude Pro or Max subscription for unlimited AI
                      chat (~10x cheaper than API credits).
                    </p>
                    <ol className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-decimal">
                      <li>
                        Run{" "}
                        <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                          claude setup-token
                        </code>{" "}
                        in your terminal
                      </li>
                      <li>Copy the token it gives you</li>
                      <li>Paste it below and click Save</li>
                    </ol>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Claude Token
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={claudeTokenInput}
                        onChange={(e) => setClaudeTokenInput(e.target.value)}
                        placeholder="Paste your token here"
                        className="flex-1 px-3 py-2 bg-white dark:bg-[#1A1B1E] border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                      />
                      <Button
                        onClick={handleSaveClaudeToken}
                        disabled={isSavingToken || !claudeTokenInput.trim()}
                        className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                      >
                        {isSavingToken ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Save Token"
                        )}
                      </Button>
                    </div>
                  </div>

                  {tokenSaveSuccess && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Check className="w-4 h-4" />
                      Token saved successfully!
                    </div>
                  )}

                  {tokenError && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {tokenError}
                    </div>
                  )}

                  <a
                    href="https://docs.anthropic.com/en/docs/agents/claude-cli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Learn more about Claude Code CLI
                  </a>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
