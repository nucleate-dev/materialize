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
import { X, User } from "lucide-react";
import AccountSettings from "@/app/dashboard/account/page";

type SettingsTab = "account";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: "account", label: "Account", icon: User },
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
              {activeTab === "account" && <AccountSettings />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
