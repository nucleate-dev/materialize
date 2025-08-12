import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

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
  try {
    const { prototype_id, current_page }: FetchViewBody = await req.json();

    if (!prototype_id) {
      return NextResponse.json({ error: "prototype_id is required" }, { status: 400 });
    }

    // Get JWT token if provided (optional for this endpoint)
    const token = req.headers.get("authorization")?.split(" ")[1];
    let userId: string | null = null;

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // If JWT token is provided, authenticate the user with Supabase
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.sub;
        
        // Set the session with the provided JWT token
        await supabase.auth.setSession({
          access_token: token,
          refresh_token: '' // Not needed for this use case
        });
      } catch (error) {
        // Invalid token - continue as anonymous user
        console.warn("Invalid JWT token provided, continuing as anonymous user");
      }
    }

    // Attempt to access prototype from DB to check viewing privileges
    const { data: prototypeData, error: prototypeError } = await supabase
      .from("prototypes")
      .select("id, owner_id, title, description")
      .eq("id", prototype_id)
      .single();

    if (prototypeError || !prototypeData) {
      return NextResponse.json({ error: "Prototype not found or access denied" }, { status: 404 });
    }

    // Check if user is prototype owner and current_page is 'edit'
    if (userId && userId === prototypeData.owner_id && current_page === "edit") {
      try {
        // Fetch dispatch-precheck from control plane
        const precheckResponse = await fetch(`${process.env.SERVER_ENDPOINT}/dispatch-precheck`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jwt: token,
            prototype_id: prototype_id,
          }),
        });

        if (precheckResponse.ok) {
          const precheckData = await precheckResponse.json();
          
          // If active dev-server or build exists, return that URL
          if (precheckData.success && precheckData.viewing_url) {
            return NextResponse.json({
              viewing_url: precheckData.viewing_url,
              source: "active_instance"
            });
          }
        }
      } catch (precheckError) {
        console.warn("Failed to fetch dispatch precheck, falling back to static build:", precheckError);
        // Continue to static build fallback
      }
    }

    // TODO: Load S3 URL from CloudFront
    // This should fetch the static build URL from S3/CloudFront
    // For now, return a placeholder URL
    const staticViewingUrl = `https://static-builds.materializeui.com/${prototype_id}`;

    return NextResponse.json({
      viewing_url: staticViewingUrl,
      source: "static_build"
    });

  } catch (error) {
    console.error("Fetch view error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}