"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { usePersonalTeam } from "@/hooks/usePersonalTeam";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { Check, ChevronRight, Plus, Settings, UserPlus, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

interface TeamSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamSelectorDialog({
  open,
  onOpenChange,
}: TeamSelectorDialogProps) {
  const router = useRouter();
  const logger = useProductLogger();
  const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();
  const { team } = usePersonalTeam();
  const {
    creditsRemaining,
    totalAvailableCredits,
    loading: creditsLoading,
  } = useCreditUsage();

  const isFree = userPlan === "free";
  const usagePercentage = totalAvailableCredits > 0
    ? ((totalAvailableCredits - creditsRemaining) / totalAvailableCredits) * 100
    : 0;

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const teamName = "Personal"; // For now, we'll use a default name
  const teamInitials = getInitials(teamName);

  const handleUpgrade = () => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "TeamSelectorDialog",
        item: "upgrade",
        current_plan: userPlan,
        target_plan: "plus",
      },
    });
    onOpenChange(false);
    void handleCheckout("plus", router);
  };

  const handleSettings = () => {
    logger.log({
      event: "client_dashboard_settings_clicked",
      properties: {
        component: "TeamSelectorDialog",
      },
    });
    onOpenChange(false);
    router.push("/dashboard/account");
  };

  const handleInviteMembers = () => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "TeamSelectorDialog",
        item: "invite_members",
      },
    });
    onOpenChange(false);
    router.push("/dashboard/account");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-xl font-bold text-primary">
                {teamInitials}
              </span>
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {teamName}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {isFree ? "Free Plan" : `${userPlan} Plan`} • 1 member
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Settings and Invite buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSettings}
              className="flex-1"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleInviteMembers}
              className="flex-1"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite members
            </Button>
          </div>

          {/* Upgrade section (only for free users) */}
          {isFree && !loadingSubscriptionData && (
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-sm">Turn Pro</span>
                </div>
                <Button
                  onClick={handleUpgrade}
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                >
                  Upgrade
                </Button>
              </div>
            </div>
          )}

          {/* Credits section */}
          {!creditsLoading && (
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Credits</span>
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-semibold">{creditsRemaining}</span>
                  <span className="text-muted-foreground">left</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <Progress value={usagePercentage} className="h-2" />
              {isFree && (
                <p className="text-xs text-muted-foreground">
                  Daily credits reset at midnight UTC
                </p>
              )}
            </div>
          )}

          {/* All workspaces section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              All workspaces
            </h3>
            <div className="space-y-1">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                onClick={() => {
                  // Current workspace - do nothing
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {teamInitials}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{teamName}</span>
                    {isFree && (
                      <Badge variant="secondary" className="text-xs">
                        FREE
                      </Badge>
                    )}
                  </div>
                </div>
                <Check className="w-4 h-4 text-primary" />
              </button>
            </div>
          </div>

          {/* Create new workspace button */}
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isFree}
            onClick={() => {
              if (!isFree) {
                logger.log({
                  event: "client_dashboard_sidebar_item_clicked",
                  properties: {
                    component: "TeamSelectorDialog",
                    item: "create_workspace",
                  },
                });
                // TODO: Implement create workspace functionality
              }
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create new workspace
            {isFree && (
              <Badge variant="secondary" className="ml-auto text-xs">
                PLUS
              </Badge>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
