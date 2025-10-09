import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { AuthApiError } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

interface CreateTestUserPayload {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

function generateSecurePassword() {
  const random = randomBytes(24).toString("base64url");
  // Ensure a mix of characters and a reasonable length for Supabase password policy
  return random.slice(0, 20);
}

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const nameParts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { email, firstName, lastName, password } =
      (await request.json()) as CreateTestUserPayload;

    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json(
        { error: { message: "Email is required" } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const passwordToUse =
      typeof password === "string" ? password : generateSecurePassword();

    const { data: createdUser, error: createUserError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: passwordToUse,
        email_confirm: true,
        user_metadata: {
          first_name: firstName?.trim() || null,
          last_name: lastName?.trim() || null,
          is_test_user: true,
          created_via: "internal-tools",
        },
        app_metadata: {
          roles: ["test"],
        },
      });

    if (createUserError || !createdUser?.user) {
      if (createUserError instanceof AuthApiError && createUserError.status === 422) {
        return NextResponse.json(
          {
            error: {
              message:
                "A user with this email already exists. Consider using the +alias pattern for Gmail addresses.",
            },
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: { message: createUserError?.message ?? "Failed to create user" } },
        { status: 500 }
      );
    }

    const authUser = createdUser.user;

    const displayName = buildDisplayName(firstName, lastName);

    const { error: upsertError } = await supabase
      .from("users")
      .upsert(
        {
          id: authUser.id,
          email: normalizedEmail,
          name: displayName,
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      await supabase.auth.admin.deleteUser(authUser.id);
      return NextResponse.json(
        {
          error: {
            message: `Failed to sync user profile: ${upsertError.message}`,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: authUser.id,
        email: normalizedEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        displayName,
        password: passwordToUse,
        createdAt: authUser.created_at,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred while creating the test user.";

    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
