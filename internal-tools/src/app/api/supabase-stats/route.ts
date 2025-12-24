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

    // Generate buckets for the last 7 days (including today)
    // We generate keys in YYYY-MM-DD format (UTC)
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    // The oldest date is the last one in the array
    const oldestDateStr = dates[dates.length - 1];
    // Start from the beginning of that day
    const queryStartDate = `${oldestDateStr}T00:00:00.000Z`;

    // Fetch data for the last 7 days from the 3 tables
    // 1. Prototypes
    const { data: prototypesData, error: prototypesError } = await supabase
      .from("prototypes")
      .select("created_at")
      .gte("created_at", queryStartDate);

    if (prototypesError) throw prototypesError;

    // 2. Messages
    // Fetch all for the time range to ensure we capture everything, then filter
    const { data: messagesDataRaw, error: messagesError } = await supabase
      .from("prototype_chat_messages")
      .select("created_at, role")
      .gte("created_at", queryStartDate);

    if (messagesError) throw messagesError;

    // Filter in memory for role 'user'
    const messagesData = (messagesDataRaw || []).filter(
      (m) => m.role === "user" || m.role === "User",
    );

    // 3. Users
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("created_at")
      .gte("created_at", queryStartDate);

    if (usersError) throw usersError;

    // Helper to aggregate by date
    const aggregateData = (items: { created_at: string | null; }[]) => {
      const counts: Record<string, number> = {};

      // Initialize with 0 for our target dates
      dates.forEach(d => {
        counts[d] = 0;
      });

      items.forEach((item) => {
        if (!item.created_at) return;
        const dateStr = new Date(item.created_at).toISOString().split("T")[0];
        // Only count if it falls within our buckets
        if (counts[dateStr] !== undefined) {
          counts[dateStr]++;
        }
      });

      // Return array sorted by date (ascending)
      return Object.entries(counts)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, count]) => ({ date, count }));
    };

    const prototypesStats = aggregateData(prototypesData || []);
    const messagesStats = aggregateData(messagesData || []);
    const usersStats = aggregateData(usersData || []);

    // 4. Onboarding Survey Stats
    const { data: surveyData, error: surveyError } = await supabase
      .from("user_onboarding_survey")
      .select("role, ai_coding_experience, referral_source, use_cases, created_at");

    if (surveyError) throw surveyError;

    // Aggregate survey data by different dimensions
    const aggregateByCounts = (items: { [key: string]: string | null }[], field: string) => {
      const counts: Record<string, number> = {};
      items.forEach((item) => {
        const value = item[field];
        if (value) {
          counts[value] = (counts[value] || 0) + 1;
        }
      });
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    // For use_cases which is a text array, we need to unnest and count each value
    const aggregateUseCases = (items: { use_cases: string[] | null }[]) => {
      const counts: Record<string, number> = {};
      items.forEach((item) => {
        if (item.use_cases && Array.isArray(item.use_cases)) {
          item.use_cases.forEach((useCase) => {
            if (useCase) {
              counts[useCase] = (counts[useCase] || 0) + 1;
            }
          });
        }
      });
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    const surveyStats = {
      totalResponses: surveyData?.length || 0,
      byRole: aggregateByCounts(surveyData || [], "role"),
      byExperience: aggregateByCounts(surveyData || [], "ai_coding_experience"),
      byReferralSource: aggregateByCounts(surveyData || [], "referral_source"),
      byUseCases: aggregateUseCases(surveyData || []),
      daily: aggregateData((surveyData || []).map(s => ({ created_at: s.created_at }))),
    };

    const stats = {
      prototypes: prototypesStats,
      messages: messagesStats,
      users: usersStats,
      // Calculate totals from the stats to ensure consistency with the graph
      totalPrototypes: prototypesStats.reduce((acc, curr) => acc + curr.count, 0),
      totalMessages: messagesStats.reduce((acc, curr) => acc + curr.count, 0),
      totalUsers: usersStats.reduce((acc, curr) => acc + curr.count, 0),
      // Onboarding survey stats
      onboardingSurvey: surveyStats,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      { status: 500 },
    );
  }
}
