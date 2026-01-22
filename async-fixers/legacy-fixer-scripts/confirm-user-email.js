#!/usr/bin/env node

/**
 * Script to confirm a user's email using the Supabase admin API
 *
 * Usage: node confirm-user-email.js <user_id>
 *
 * This script:
 * 1. Loads environment variables from .env file
 * 2. Creates a Supabase client with service role key
 * 3. Uses the admin API to set email_confirmed_at for the specified user
 */

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Validate environment variables
function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error("Please ensure .env file exists with all required variables");
    process.exit(1);
  }
}

// Initialize Supabase client
function initSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: node confirm-user-email.js <user_id>");
    process.exit(1);
  }

  validateEnv();
  const supabase = initSupabase();

  console.log(`Confirming email for user: ${userId}`);

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (error) {
    console.error("Failed to confirm user email:", error.message);
    process.exit(1);
  }

  console.log("Email confirmed successfully");
  console.log("User:", data.user.email);
  console.log("Confirmed at:", data.user.email_confirmed_at);
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
