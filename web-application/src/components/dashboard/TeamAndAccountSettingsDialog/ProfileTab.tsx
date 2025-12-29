"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "lucide-react";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";

export function ProfileTab() {
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
