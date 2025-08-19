import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

interface FetchViewBody {
  prototype_id: string;
  current_page?: "view" | "edit" | null;
}

/**
 * API Route Handler for prototype fetch-view.
 *
 * This function handles both edit and view requests for prototypes.
 * No auth or paywalling - free users can load prototypes for community page.
 *
 * Flow:
 * 1. Instantiate anon supabase instance, with JWT if provided
 * 2. Attempt to access prototype from DB - if returned, user has viewing privileges
 * 3. If user == prototype owner && current_page == 'edit':
 *    - Fetch dispatch-precheck from control plane
 *    - If active dev-server, return tunnel url
 *    - If active build, return build url
 *    - If doesn't exist, continue with rest of function
 * 4. Load S3 URL from CloudFront, return to client
 */
export async function POST(req: NextRequest) {
  console.log("Fetch view request received");
  try {
    const { prototype_id, current_page }: FetchViewBody = await req.json();

    if (!prototype_id) {
      return NextResponse.json(
        { error: "prototype_id is required" },
        { status: 400 },
      );
    }

    // Get JWT token if provided (optional for this endpoint) & create supabase client
    const token = req.headers.get("authorization")?.split(" ")[1];
    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      },
    );
    const userId = (await supabase.auth.getUser()).data.user?.id;

    // Attempt to access prototype from DB to check viewing privileges
    const { data: prototypeData, error: prototypeError } = await supabase
      .from("prototypes")
      .select("id, owner_id")
      .eq("id", prototype_id)
      .single();

    if (prototypeError || !prototypeData) {
      console.log("Prototype not found or access denied: ", prototypeError);
      return NextResponse.json(
        { error: "Prototype not found or access denied" },
        { status: 404 },
      );
    }

    // Check if user is prototype owner and current_page is 'edit'
    if (
      userId &&
      userId === prototypeData.owner_id &&
      current_page === "edit"
    ) {
      try {
        // Fetch dispatch-precheck from control plane
        console.log(
          "fetching dispatch-precheck to get active tunnel url if exists",
        );
        const precheckResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/dispatch-precheck`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jwt: token,
              prototype_id: prototype_id,
            }),
          },
        );

        if (precheckResponse.ok) {
          const precheckData = await precheckResponse.json();

          // If active dev-server or build exists, return that URL
          if (precheckData.success && precheckData.viewing_url) {
            console.log("returning active instance url from precheck");
            return NextResponse.json({
              viewing_url: precheckData.viewing_url,
              source: "active_instance",
            });
          }
        }
      } catch (precheckError) {
        console.warn(
          "Failed to fetch dispatch precheck, falling back to static build:",
          precheckError,
        );
        // Continue to static build fallback
      }
    }

    // TODO: Load S3 URL from CloudFront
    // This should fetch the static build URL from S3/CloudFront
    // For now, return a placeholder URL
    console.log("returning static build url");
    const staticViewingUrl = `https://${prototype_id}.render.materializeui.com/`;

    return NextResponse.json({
      viewing_url: staticViewingUrl,
      source: "static_build",
    });
  } catch (error) {
    console.error("Fetch view error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
