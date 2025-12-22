import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Force dynamic to ensure we get fresh data
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
});

export async function GET() {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        const startDate = sevenDaysAgo.toISOString();

        // Fetch data for the last 7 days from the 3 tables
        // We only need created_at to count

        // 1. Prototypes
        const { data: prototypesData, error: prototypesError } = await supabase
            .from("prototypes")
            .select("created_at")
            .gte("created_at", startDate);

        if (prototypesError) throw prototypesError;

        // 2. Messages
        const { data: messagesData, error: messagesError } = await supabase
            .from("prototype_chat_messages")
            .select("created_at")
            .gte("created_at", startDate);

        if (messagesError) throw messagesError;

        // 3. Users
        const { data: usersData, error: usersError } = await supabase
            .from("users")
            .select("created_at")
            .gte("created_at", startDate);

        if (usersError) throw usersError;

        // Helper to aggregate by date (YYYY-MM-DD)
        const aggregateByDay = (items: { created_at: string | null; }[]) => {
            const counts: Record<string, number> = {};

            // Initialize last 7 days with 0
            for (let i = 0; i < 7; i++) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                counts[dateStr] = 0;
            }

            items.forEach((item) => {
                if (!item.created_at) return;
                const dateStr = new Date(item.created_at).toISOString().split('T')[0];
                if (counts[dateStr] !== undefined) {
                    counts[dateStr]++;
                }
            });

            // Sort by date key
            return Object.entries(counts)
                .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                .map(([date, count]) => ({ date, count }));
        };

        const stats = {
            prototypes: aggregateByDay(prototypesData || []),
            messages: aggregateByDay(messagesData || []),
            users: aggregateByDay(usersData || []),
            totalPrototypes: prototypesData?.length || 0,
            totalMessages: messagesData?.length || 0,
            totalUsers: usersData?.length || 0,
        };

        return NextResponse.json(stats);
    } catch (error) {
        console.error("Error fetching stats:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch stats" },
            { status: 500 }
        );
    }
}
