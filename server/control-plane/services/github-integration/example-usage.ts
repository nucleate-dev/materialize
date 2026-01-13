// // Example: How to use the encrypted GitHub token to fetch repositories
// // This file is for documentation purposes only

// import { createClient } from "@supabase/supabase-js";
// import { decrypt } from "../../utils/encryptionUtils.js";
// import type { Database } from "../../types/supabase.js";

// /**
//  * Example: Fetch repositories for a team's GitHub installation
//  */
// export async function fetchTeamRepositories(teamId: string) {
//   // 1. Get the team's GitHub integration from database using service role
//   const supabase = createClient<Database>(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role required for token access
//   );

//   // Fetch metadata from github_integrations
//   const { data: integration, error: metadataError } = await supabase
//     .from("github_integrations")
//     .select("account_login, installation_id")
//     .eq("team_id", teamId)
//     .single();

//   if (metadataError || !integration) {
//     throw new Error("GitHub integration not found");
//   }

//   // Fetch tokens from separate table (only service role can do this)
//   const { data: tokenData, error: tokenError } = await supabase
//     .from("github_integration_tokens")
//     .select("token_encrypted")
//     .eq("team_id", teamId)
//     .single();

//   if (tokenError || !tokenData) {
//     throw new Error("GitHub integration tokens not found");
//   }

//   // 2. Decrypt the token (happens on backend only!)
//   const accessToken = decrypt(tokenData.token_encrypted);
//   // ☝️ This uses the GITHUB_TOKEN_ENCRYPTION_KEY from environment
//   // The token is now in plaintext and ready to use

//   // 3. Use the decrypted token to call GitHub API
//   const response = await fetch(
//     `https://api.github.com/user/repos`,
//     {
//       headers: {
//         "Accept": "application/vnd.github+json",
//         "Authorization": `Bearer ${accessToken}`, // ✅ Decrypted token
//         "X-GitHub-Api-Version": "2022-11-28",
//       },
//     },
//   );

//   if (!response.ok) {
//     throw new Error("Failed to fetch repositories");
//   }

//   const repos = await response.json();

//   // 4. Return the repositories (safe to send to client)
//   return repos.map((repo: any) => ({
//     name: repo.name,
//     full_name: repo.full_name,
//     private: repo.private,
//     url: repo.html_url,
//   }));

//   // Note: The decrypted token NEVER leaves the backend!
//   // We only send the repo data to the client.
// }

// /**
//  * Example: Create a branch in a repository
//  */
// export async function createBranch(
//   teamId: string,
//   repoOwner: string,
//   repoName: string,
//   branchName: string,
//   fromBranch: string = "main",
// ) {
//   const supabase = createClient<Database>(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role required for token access
//   );

//   // 1. Get encrypted token from tokens table (service role only)
//   const { data: tokenData } = await supabase
//     .from("github_integration_tokens")
//     .select("token_encrypted")
//     .eq("team_id", teamId)
//     .single();

//   if (!tokenData) {
//     throw new Error("GitHub integration not found");
//   }

//   // 2. Decrypt the token
//   const accessToken = decrypt(tokenData.token_encrypted);

//   // 3. Get the SHA of the branch we want to branch from
//   const refResponse = await fetch(
//     `https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${fromBranch}`,
//     {
//       headers: {
//         "Accept": "application/vnd.github+json",
//         "Authorization": `Bearer ${accessToken}`,
//         "X-GitHub-Api-Version": "2022-11-28",
//       },
//     },
//   );

//   const refData = await refResponse.json();
//   const sha = refData.object.sha;

//   // 4. Create the new branch
//   const createResponse = await fetch(
//     `https://api.github.com/repos/${repoOwner}/${repoName}/git/refs`,
//     {
//       method: "POST",
//       headers: {
//         "Accept": "application/vnd.github+json",
//         "Authorization": `Bearer ${accessToken}`,
//         "X-GitHub-Api-Version": "2022-11-28",
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         ref: `refs/heads/${branchName}`,
//         sha: sha,
//       }),
//     },
//   );

//   if (!createResponse.ok) {
//     throw new Error("Failed to create branch");
//   }

//   return await createResponse.json();
// }

// /**
//  * Security Note:
//  *
//  * The decrypted token ONLY exists in memory on the backend server
//  * during the API call. It is:
//  *
//  * ✅ Stored encrypted in the database (in separate `github_integration_tokens` table)
//  * ✅ Completely isolated from client access (NO RLS policies on tokens table)
//  * ✅ Only accessible via service role (SUPABASE_SERVICE_ROLE_KEY)
//  * ✅ Decrypted only when needed for API calls
//  * ✅ Never sent to the client/frontend (not even in encrypted form)
//  * ✅ Never logged (token values should never appear in logs)
//  * ✅ Immediately discarded after use (garbage collected)
//  *
//  * This is called "encryption at rest" with "defense in depth":
//  * - The data is protected while stored (encryption)
//  * - The encrypted data is isolated from regular users (separate table, no RLS)
//  * - Only the backend service can decrypt and use tokens
//  */
