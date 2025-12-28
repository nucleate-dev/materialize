"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { X, User, CreditCard, Key } from "lucide-react";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { usePostHog } from "posthog-js/react";
import { ProfileTab } from "./ProfileTab";
import { ClaudeConnectionTab } from "./ClaudeConnectionTab";
import { CreditsAndSubscriptionsTab } from "./CreditsAndSubscriptionsTab";

type SettingsTab = "profile" | "credits" | "claude";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamAndAccountsSettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const { userRow } = useCustomUserRow();
  const posthog = usePostHog();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const isClaudeConnectionEnabled =
    posthog?.isFeatureEnabled("claude-code-cli-with-personal-token") ?? false;

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: "profile", label: userRow?.name || "Profile", icon: User },
    { id: "credits", label: "Credits and subscriptions", icon: CreditCard },
    ...(isClaudeConnectionEnabled
      ? [{ id: "claude" as const, label: "Claude connection", icon: Key }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60" />
        <DialogContent
          hideCloseButton
          className="fixed max-w-none w-[90vw] h-[90vh] p-0 border border-black/10 dark:border-white/10 rounded-lg flex bg-background"
        >
          {/* Dialog Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
            {/* Tabs */}
            <div className="flex-1 p-2">
              <SidebarGroup>
                <SidebarGroupLabel>Account</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <SidebarMenuItem key={tab.id}>
                          <SidebarMenuButton
                            isActive={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                          >
                            <Icon />
                            <span>{tab.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto relative">
            {/* Close button */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-6 top-6 z-10"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>

            {/* Content */}
            <div className="h-full">
              {activeTab === "profile" && <ProfileTab />}
              {activeTab === "credits" && <CreditsAndSubscriptionsTab />}
              {activeTab === "claude" && <ClaudeConnectionTab />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
