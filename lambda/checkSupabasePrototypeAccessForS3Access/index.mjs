const SUPABASE_URL = "https://hfgjmwidcoszkmvejxhw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZ2ptd2lkY29zemttdmVqeGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDY5MTIsImV4cCI6MjA2ODYyMjkxMn0.wlX6Mc6aRnH2prvcqkYvJ4ccxM6oA3XF5gpX5T13d_w"; // needed for public/project-level access

export const handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const uri = request.uri;
  const host = headers.host[0].value;
  const root = "render.materializeui.com";

  // Only allow our hostnames (*.render.materializeui.com)
  if (!host.endsWith(root)) {
    console.log("Access denied: invalid host", host);
    return {
      status: "403",
      statusDescription: "Forbidden: Invalid Host",
    };
  }

  // Extract prototype ID from "<id>.render.materializeui.com"
  let sub = host.slice(0, -root.length);
  if (sub.endsWith(".")) sub = sub.slice(0, -1);
  if (!sub || !/^[a-zA-Z0-9-]+$/.test(sub)) return request;

  const prototypeId = sub;

  // --- Determine JWT ---
  let jwt = null;

  // 1) Check query param
  const queryParams = request.querystring || "";
  const tokenMatch = queryParams.match(/token=([^&]*)/);
  if (tokenMatch) {
    jwt = tokenMatch[1];
  }

  // 2) If no query param, check cookie
  if (!jwt && headers.cookie) {
    const cookies = headers.cookie[0].value.split(";").map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith("authToken=")) {
        jwt = c.substring("authToken=".length);
        break;
      }
    }
  }

  // --- Supabase Access Check ---
  const supabaseUrl = `${SUPABASE_URL}/rest/v1/prototypes?id=eq.${prototypeId}&select=id,visibility,latest_build_key`;

  let visibility = null;
  let latestBuildKey = null;

  try {
    const response = await fetch(supabaseUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        // Only add Authorization if you *really* have a JWT
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
    });

    if (!response.ok) {
      console.log("Supabase denied access:", response.status);
      return {
        status: "403",
        statusDescription: "Forbidden: Access denied",
      };
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.log("Prototype not found or RLS blocked access");
      return {
        status: "403",
        statusDescription: "Forbidden: Prototype not accessible",
      };
    }

    visibility = data[0].visibility;
    latestBuildKey = data[0].latest_build_key;
  } catch (err) {
    console.log("Error fetching from Supabase:", err.message || err.toString());
    return {
      status: "500",
      statusDescription: "Internal Server Error",
      body: "Error verifying access",
    };
  }

  const buildFolder = latestBuildKey || "latest";

  // --- URI Rewrite Logic ---
  let newUri;
  if (/^\/v\d+\//.test(uri)) {
    // Versioned paths remain unchanged
    newUri = `/${prototypeId}${uri}`;
  } else if (/\.[^\/]+$/.test(uri)) {
    // Files with extensions
    newUri = `/${prototypeId}/${buildFolder}${uri}`;
  } else if (uri === "/" || uri === "") {
    // Root path
    newUri = `/${prototypeId}/${buildFolder}/index.html`;
  } else if (uri.endsWith("/")) {
    // Directory paths
    newUri = `/${prototypeId}/${buildFolder}${uri}index.html`;
  } else {
    // Paths without extensions (assume HTML)
    newUri = `/${prototypeId}/${buildFolder}${uri}.html`;
  }

  console.log("Rewriting URI:", uri, "→", newUri);
  request.uri = newUri;

  // --- If JWT came from query param AND prototype is not PUBLIC, set cookie ---
  if (tokenMatch && visibility !== "PUBLIC") {
    console.log(
      "Prototype is not PUBLIC, setting cookie and redirecting to same URL without token",
    );
    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [{ key: "Location", value: `https://${host}${uri}` }],
        "set-cookie": [
          {
            key: "Set-Cookie",
            value: `authToken=${jwt}; Path=/; Secure; HttpOnly; SameSite=None`,
          },
        ],
      },
    };
  }

  console.log("Serving content (cookie only set for non-public prototypes)");
  return request;
};
