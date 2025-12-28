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
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { X, User, Settings, Calendar } from "lucide-react";
import AccountSettings from "@/app/dashboard/account/page";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";

type SettingsTab = "profile" | "account";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProfileTab() {
  const { userRow } = useCustomUserRow();
  const { user } = useUser();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const memberSince = user?.created_at ? new Date(user.created_at) : new Date();

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Profile
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Manage your profile information.
          </p>
        </div>

        {/* Profile Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-16 w-16 border border-border">
                {userRow?.avatar_url && (
                  <AvatarImage
                    src={userRow.avatar_url}
                    alt={userRow.name || "User"}
                  />
                )}
                <AvatarFallback className="text-lg font-medium">
                  {getInitials(userRow?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1 flex-1">
                <h2 className="text-xl font-medium">
                  {userRow?.name || "User"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {userRow?.email}
                </p>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 mr-2" />
              Member since{" "}
              {memberSince?.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { userRow } = useCustomUserRow();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: "profile", label: userRow?.name || "Profile", icon: User },
    { id: "account", label: "Account", icon: Settings },
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
              {activeTab === "account" && <AccountSettings />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
