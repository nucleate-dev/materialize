const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEPLOY_ROOT_DOMAIN =
  process.env.APPS_DEPLOY_ROOT_DOMAIN || "app.nucleate.dev";

export const handler = async (event) => {
  const request = event.Records?.[0]?.cf?.request;
  if (!request) {
    console.log("Invalid CloudFront request event");
    return forbidden("Invalid request");
  }

  const headers = request.headers || {};
  const host = headers.host?.[0]?.value || "";
  const uri = request.uri || "/";

  if (!host.endsWith(DEPLOY_ROOT_DOMAIN)) {
    console.log("Access denied: invalid host", { host });
    return forbidden("Invalid host");
  }

  let slug = host.slice(0, -DEPLOY_ROOT_DOMAIN.length);
  if (slug.endsWith(".")) {
    slug = slug.slice(0, -1);
  }

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return forbidden("Invalid slug");
  }
  slug = slug.toLowerCase();

  try {
    const supabaseHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    };

    const prototypeResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/prototypes?slug=eq.${encodeURIComponent(
        slug,
      )}&select=id,latest_deploy_key`,
      { headers: supabaseHeaders },
    );
    if (!prototypeResponse.ok) {
      console.log("Failed to load prototype for slug", {
        slug,
        status: prototypeResponse.status,
      });
      return forbidden("Prototype not found");
    }
    const prototypeData = await prototypeResponse.json();
    const prototypeId = prototypeData?.[0]?.id;
    const deploymentKey = prototypeData?.[0]?.latest_deploy_key;
    if (!prototypeId) {
      console.log("No prototype for slug", { slug });
      return forbidden("Prototype not found");
    }
    if (!deploymentKey) {
      console.log("No deployable build found", { prototypeId });
      return forbidden("Deployment not available");
    }

    const newUri = rewriteUri(uri, prototypeId, deploymentKey);
    request.uri = newUri;
    return request;
  } catch (error) {
    console.log("Unexpected error mapping slug to deployment", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "500",
      statusDescription: "Internal Server Error",
    };
  }
};

function rewriteUri(uri, prototypeId, deploymentKey) {
  if (/^\/v\d+\//.test(uri)) {
    return `/${prototypeId}${uri}`;
  }
  if (/\.[^/]+$/.test(uri)) {
    return `/${prototypeId}/${deploymentKey}${uri}`;
  }
  if (uri === "/" || uri === "") {
    return `/${prototypeId}/${deploymentKey}/index.html`;
  }
  if (uri.endsWith("/")) {
    return `/${prototypeId}/${deploymentKey}${uri}index.html`;
  }
  return `/${prototypeId}/${deploymentKey}${uri}.html`;
}

function forbidden(message) {
  return {
    status: "403",
    statusDescription: `Forbidden: ${message}`,
  };
}
