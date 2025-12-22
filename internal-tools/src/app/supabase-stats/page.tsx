"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Box, Loader2, MessageSquare, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface DailyStat {
    date: string;
    count: number;
}

interface StatsData {
    prototypes: DailyStat[];
    messages: DailyStat[];
    users: DailyStat[];
    totalPrototypes: number;
    totalMessages: number;
    totalUsers: number;
}

function SimpleBarChart({
    data,
    colorClass = "bg-blue-500",
    height = 200
}: {
    data: DailyStat[],
    colorClass?: string,
    height?: number;
}) {
    const max = Math.max(...data.map(d => d.count), 1);

    return (
        <div className="w-full flex flex-col gap-2">
            <div
                className="flex items-end justify-between gap-2 w-full"
                style={{ height }}
            >
                {data.map((item) => {
                    const percent = (item.count / max) * 100;
                    // Format date to show just Month-Day or Day name if needed
                    const dateLabel = new Date(item.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric'
                    });

                    return (
                        <div key={item.date} className="flex-1 flex flex-col items-center gap-1 group">
                            <div className="relative w-full flex items-end justify-center h-full bg-muted/20 rounded-t-sm overflow-hidden">
                                <div
                                    className={cn("w-3/4 min-h-[4px] rounded-t-sm transition-all duration-500", colorClass)}
                                    style={{ height: `${percent}%` }}
                                >
                                    {/* Tooltip-ish label on hover */}
                                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap z-10 pointer-events-none transition-opacity">
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
                <PageHeader title="Supabase Stats" breadcrumbs={[{ title: "Supabase Stats" }]} />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col h-full w-full">
                <PageHeader title="Supabase Stats" breadcrumbs={[{ title: "Supabase Stats" }]} />
                <div className="flex-1 flex items-center justify-center text-destructive">
                    Error: {error}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen">
            <PageHeader title="Supabase Stats" breadcrumbs={[{ title: "Supabase Stats" }]} />

            <main className="flex-1 p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Prototypes Card */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Prototypes Created (7 Days)</CardTitle>
                            <Box className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold mb-4">{stats?.totalPrototypes}</div>
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
                            <CardTitle className="text-sm font-medium">Messages Sent (7 Days)</CardTitle>
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold mb-4">{stats?.totalMessages}</div>
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
                            <CardTitle className="text-sm font-medium">New User Accounts (7 Days)</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold mb-4">{stats?.totalUsers}</div>
                            {stats?.users && (
                                <SimpleBarChart
                                    data={stats.users}
                                    colorClass="bg-orange-500"
                                />
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
