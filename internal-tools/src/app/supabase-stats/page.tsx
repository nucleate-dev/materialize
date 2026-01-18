"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Box,
  Briefcase,
  ClipboardList,
  Loader2,
  MessageSquare,
  Share2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

interface DailyStat {
  date: string;
  count: number;
}

interface CategoryStat {
  name: string;
  count: number;
}

interface OnboardingSurveyStats {
  totalResponses: number;
  byRole: CategoryStat[];
  byExperience: CategoryStat[];
  byReferralSource: CategoryStat[];
  byUseCases: CategoryStat[];
  daily: DailyStat[];
}

interface StatsData {
  prototypes: DailyStat[];
  messages: DailyStat[];
  users: DailyStat[];
  totalPrototypes: number;
  totalMessages: number;
  totalUsers: number;
  onboardingSurvey: OnboardingSurveyStats;
}

function SimpleBarChart({
  data,
  colorClass = "bg-blue-500",
  height = 200,
}: {
  data: DailyStat[];
  colorClass?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex justify-between gap-2 w-full" style={{ height }}>
        {data.map((item) => {
          const percent = (item.count / max) * 100;
          // Format date to show just Month-Day or Day name if needed
          const dateLabel = new Date(item.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={item.date}
              className="flex-1 flex flex-col items-center gap-1 group"
            >
              {/* Track - uses flex-1 to fill vertical space above the label */}
              <div className="relative w-full flex items-end justify-center flex-1 bg-muted/20 rounded-t-sm">
                <div
                  className={cn(
                    "w-3/4 min-h-[4px] rounded-t-sm transition-all duration-500 relative",
                    colorClass,
                  )}
                  style={{ height: `${percent}%` }}
                >
                  {/* Tooltip-ish label on hover */}
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap z-50 pointer-events-none transition-opacity">
                    {item.count}
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {dateLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBarChart({
  data,
  colorClass = "bg-blue-500",
}: {
  data: CategoryStat[];
  colorClass?: string;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full flex flex-col gap-2">
      {data.map((item) => {
        const percent = (item.count / max) * 100;
        return (
          <div key={item.name} className="flex items-center gap-2 group">
            <div
              className="w-28 text-xs text-muted-foreground truncate"
              title={item.name}
            >
              {item.name}
            </div>
            <div className="flex-1 h-6 bg-muted/20 rounded-sm relative">
              <div
                className={cn(
                  "h-full rounded-sm transition-all duration-500",
                  colorClass,
                )}
                style={{ width: `${percent}%` }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium">
                {item.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SupabaseStatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/supabase-stats");
        if (!res.ok) {
          throw new Error("Failed to fetch stats");
        }
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full w-full">
        <PageHeader
          title="Supabase Stats"
          breadcrumbs={[{ title: "Supabase Stats" }]}
        />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full w-full">
        <PageHeader
          title="Supabase Stats"
          breadcrumbs={[{ title: "Supabase Stats" }]}
        />
        <div className="flex-1 flex items-center justify-center text-destructive">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title="Supabase Stats"
        breadcrumbs={[{ title: "Supabase Stats" }]}
      />

      <main className="flex-1 p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Prototypes Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Prototypes Created (7 Days)
              </CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-4">
                {stats?.totalPrototypes}
              </div>
              {stats?.prototypes && (
                <SimpleBarChart
                  data={stats.prototypes}
                  colorClass="bg-indigo-500"
                />
              )}
            </CardContent>
          </Card>

          {/* Messages Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                User Messages Sent (7 Days)
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-4">
                {stats?.totalMessages}
              </div>
              {stats?.messages && (
                <SimpleBarChart
                  data={stats.messages}
                  colorClass="bg-emerald-500"
                />
              )}
            </CardContent>
          </Card>

          {/* Users Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                New User Accounts (7 Days)
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-4">{stats?.totalUsers}</div>
              {stats?.users && (
                <SimpleBarChart data={stats.users} colorClass="bg-orange-500" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Onboarding Survey Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Onboarding Survey</h2>
            <span className="text-sm text-muted-foreground">
              ({stats?.onboardingSurvey?.totalResponses || 0} total responses)
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Survey Completions (7 Days) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Survey Completions (7 Days)
                </CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-4">
                  {stats?.onboardingSurvey?.daily?.reduce(
                    (acc, curr) => acc + curr.count,
                    0,
                  ) || 0}
                </div>
                {stats?.onboardingSurvey?.daily && (
                  <SimpleBarChart
                    data={stats.onboardingSurvey.daily}
                    colorClass="bg-violet-500"
                  />
                )}
              </CardContent>
            </Card>

            {/* By Role */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">By Role</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats?.onboardingSurvey?.byRole &&
                stats.onboardingSurvey.byRole.length > 0 ? (
                  <HorizontalBarChart
                    data={stats.onboardingSurvey.byRole}
                    colorClass="bg-sky-500"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">No data</div>
                )}
              </CardContent>
            </Card>

            {/* By AI Coding Experience */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  By AI Coding Experience
                </CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats?.onboardingSurvey?.byExperience &&
                stats.onboardingSurvey.byExperience.length > 0 ? (
                  <HorizontalBarChart
                    data={stats.onboardingSurvey.byExperience}
                    colorClass="bg-amber-500"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">No data</div>
                )}
              </CardContent>
            </Card>

            {/* By Referral Source */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  By Referral Source
                </CardTitle>
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats?.onboardingSurvey?.byReferralSource &&
                stats.onboardingSurvey.byReferralSource.length > 0 ? (
                  <HorizontalBarChart
                    data={stats.onboardingSurvey.byReferralSource}
                    colorClass="bg-rose-500"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">No data</div>
                )}
              </CardContent>
            </Card>

            {/* By Use Cases */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  By Use Cases
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats?.onboardingSurvey?.byUseCases &&
                stats.onboardingSurvey.byUseCases.length > 0 ? (
                  <HorizontalBarChart
                    data={stats.onboardingSurvey.byUseCases}
                    colorClass="bg-teal-500"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">No data</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
