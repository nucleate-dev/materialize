"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/classNames";
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

const SectionCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "bg-white dark:bg-[#141517] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden shadow-sm dark:shadow-none",
      className,
    )}
  >
    {children}
  </div>
);

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
        <SectionCard>
          <div className="p-6 flex items-center gap-6">
            <Avatar className="h-16 w-16 border border-black/10 dark:border-white/10">
              {userRow?.avatar_url && (
                <AvatarImage src={userRow.avatar_url} alt={userRow.name || "User"} />
              )}
              <AvatarFallback className="bg-gray-100 dark:bg-[#1A1B1E] text-gray-900 dark:text-white font-medium text-lg">
                {getInitials(userRow?.name || "U")}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1 flex-1">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white">
                {userRow?.name || "User"}
              </h2>
              <p className="text-gray-600 dark:text-[#8A8F98] text-sm">
                {userRow?.email}
              </p>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-[#1A1B1E]/50 px-6 py-3 border-t border-black/5 dark:border-white/5 flex items-center text-xs text-gray-600 dark:text-[#8A8F98]">
            <Calendar className="w-3.5 h-3.5 mr-2 opacity-70" />
            Member since{" "}
            {memberSince?.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </SectionCard>
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
          <div className="w-64 border-r border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#0A0A0B] flex flex-col">
            <div className="p-4 border-b border-black/5 dark:border-white/5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Settings
              </h2>
            </div>

            {/* Tabs */}
            <nav className="flex-1 p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      activeTab === tab.id
                        ? "bg-white dark:bg-[#1A1B1E] text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-[#8A8F98] hover:bg-white/50 dark:hover:bg-white/5",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto relative">
            {/* Close button */}
            <DialogClose className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
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
