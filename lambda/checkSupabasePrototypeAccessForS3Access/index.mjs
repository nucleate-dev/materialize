// Lambda@Edge Viewer-Request handler (Node 18+)
import crypto from "crypto";

const SUPABASE_URL = "https://hfgjmwidcoszkmvejxhw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZ2ptd2lkY29zemttdmVqeGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDY5MTIsImV4cCI6MjA2ODYyMjkxMn0.wlX6Mc6aRnH2prvcqkYvJ4ccxM6oA3XF5gpX5T13d_w"; // needed for public/project-level access

export const handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers || {};
  const uri = request.uri || "/";
  const host = headers.host?.[0]?.value || "";
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

  // --- Determine token (URL query param first, then cookie authToken) ---
  let token = null;
  const queryParams = request.querystring || "";
  const tokenMatch = queryParams.match(/(?:^|&)token=([^&]*)/);
  const tokenFromQuery = Boolean(tokenMatch);
  if (tokenMatch) {
    // IMPORTANT: decode the token value from the URL
    token = decodeURIComponent(tokenMatch[1]);
  }

  // If no token in URL, check cookie header for authToken
  if (!token && headers.cookie && headers.cookie.length) {
    const cookies = headers.cookie[0].value.split(";").map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith("authToken=")) {
        token = c.substring("authToken=".length);
        break;
      }
    }
  }

  // token is now either: (a) from URL, (b) from cookie, or (c) null
  // --- Check if token is the service token first ---
  let isService = false;
  if (token) {
    // verify service token using host + uri (uri will be "/" for your screenshot URL)
    isService = verifyServiceToken({
      tokenB64: token,
      host,
      path: uri,
      secret: MATERIALIZE_SERVICE_ACCESS_TOKEN,
      skew: 30,
    });
  }

  // If it's a service token, bypass Supabase/RLS checks and proceed
  let visibility = null;
  let latestBuildKey = null;

  if (!isService) {
    // Not a service token -> treat token as user JWT (or null) and call Supabase
    const supabaseUrl = `${SUPABASE_URL}/rest/v1/prototypes?id=eq.${prototypeId}&select=id,visibility,latest_build_key`;

    try {
      const response = await fetch(supabaseUrl, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      console.log("Error fetching from Supabase:", err?.message || String(err));
      return {
        status: "500",
        statusDescription: "Internal Server Error",
        body: "Error verifying access",
      };
    }
  } else {
    // isService == true -> bypass Supabase; latestBuildKey remains null and we use fallback 'latest'
    console.log(
      "Service token verified — bypassing Supabase checks for",
      prototypeId,
    );
  }

  const buildFolder = latestBuildKey || "latest";

  // --- URI Rewrite Logic (keep your original behavior) ---
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

  // --- Preserve original cookie + redirect logic for user JWT tokens from query param ---
  // If token came from query param and prototype is not PUBLIC, set cookie and redirect back to same URL without token
  if (tokenFromQuery && !isService && visibility !== "PUBLIC") {
    console.log(
      "Prototype is not PUBLIC, setting cookie and redirecting to same URL without token",
    );
    // remove only the token param from querystring, keep other params intact
    const qs = request.querystring || "";
    const newQs = qs
      .split("&")
      .filter((p) => !p.startsWith("token=") && p !== "")
      .join("&");
    const location = `https://${host}${uri}${newQs ? "?" + newQs : ""}`;

    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [{ key: "Location", value: location }],
        "set-cookie": [
          {
            key: "Set-Cookie",
            value: `authToken=${token}; Path=/; Secure; HttpOnly; SameSite=None`,
          },
        ],
      },
    };
  }

  console.log("Serving content (cookie only set for non-public prototypes)");
  return request;
};

// --- helpers ---
function b64urlToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function timingSafeEq(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyServiceToken({ tokenB64, host, path, secret, skew = 30 }) {
  try {
    if (!tokenB64 || !secret) return false;
    const decoded = b64urlToBuf(tokenB64).toString("utf8"); // "exp:nonce:hmacB64"
    const [expStr, nonce, hmacB64] = decoded.split(":");
    if (!expStr || !nonce || !hmacB64) return false;

    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (now > exp + skew) return false; // expired (+skew)

    const payload = `${host}|${path}|${exp}|${nonce}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest();
    const provided = b64urlToBuf(hmacB64);

    return provided && timingSafeEq(expected, provided);
  } catch {
    return false;
  }
}
