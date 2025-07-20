import { supabase } from "@/GlobalConstants";
import {
  AuthError,
  AuthResponse,
  UserResponse,
  AuthTokenResponsePassword,
  OAuthResponse,
  Provider,
  User,
} from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// -----------------------------------------------------------------------------
// SUPABASE AUTH UTIL WRAPPERS:
// wrappers around the supabase auth API. Update the code within the wrappers
// if you'd like to change your auth provider to something other than supabase
// -----------------------------------------------------------------------------

/**
 * Registers a new user with Supabase authentication using an email, password, and optional profile information.
 *
 * This function signs up a user with the provided email and password, and sends additional user metadata
 * such as first name, last name, and phone number. The first and last names are formatted to capitalize
 * the first letter and convert the rest to lowercase before being stored.
 *
 * The metadata includes:
 * - `full_name`: Concatenated and formatted first and last names.
 * - `first_name`: The formatted first name.
 * - `last_name`: The formatted last name.
 * - `phone_number`: Optional phone number provided during sign-up.
 *
 * @param {Object} params - An object containing user details.
 * @param {string} params.email - The user's email address.
 * @param {string} params.password - The user's password.
 * @param {string} [params.firstName=""] - Optional first name for the user (default is an empty string).
 * @param {string} [params.lastName=""] - Optional last name for the user (default is an empty string).
 * @param {string} [params.phoneNumber=""] - Optional phone number for the user (default is an empty string).
 *
 * @returns {Promise<AuthResponse>} - A promise that resolves to the response from the Supabase sign-up process,
 * including any relevant user or session data.
 *
 * @example
 * const response = await signUp({
 *   email: "user@example.com",
 *   password: "securePassword123",
 *   firstName: "John",
 *   lastName: "Doe",
 *   phoneNumber: "555-1234"
 * });
 *
 * if (response.error) {
 *   console.error(response.error.message);
 * } else {
 *   console.log("User signed up successfully!");
 * }
 */
export async function signUp({
  email,
  password,
  firstName = "",
  lastName = "",
  phoneNumber = "",
}: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}): Promise<AuthResponse> {
  const firstNameFormatted =
    firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  const lastNameFormatted =
    lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
  const response = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        // send additional metadata for this user
        full_name: firstNameFormatted + " " + lastNameFormatted,
        email,
        first_name: firstNameFormatted,
        last_name: lastNameFormatted,
        phone_number: phoneNumber,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/auth/callback`, // note: make sure the redirectTo URL is allowed in your supabase dashboard
    },
  });
  return response;
}

/**
 * Authenticates a user using their email and password via Supabase.
 *
 * This function logs in a user by calling Supabase's `signInWithPassword` method with the provided
 * email and password. If successful, it returns the authentication response which includes session
 * data, user information, and tokens.
 *
 * @param {Object} params - An object containing the user's login credentials.
 * @param {string} params.email - The user's email address.
 * @param {string} params.password - The user's password.
 *
 * @returns {Promise<AuthTokenResponsePassword>} - A promise that resolves to the response from the Supabase login process,
 * which includes user data, access token, refresh token, and session information.
 *
 * @example
 * const response = await login({ email: "user@example.com", password: "securePassword123" });
 *
 * if (response.error) {
 *   console.error("Login failed:", response.error.message);
 * } else {
 *   console.log("Login successful!", response.data);
 * }
 */
export async function login({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<AuthTokenResponsePassword> {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
}

/**
 * Logs out the current authenticated user from Supabase.
 *
 * This function calls Supabase's `signOut` method to log out the currently authenticated user.
 * It clears the user's session and any stored authentication tokens. If the logout is successful,
 * it returns `null`. Otherwise, it returns an error.
 *
 * @returns {Promise<AuthError | null>} - A promise that resolves to `null` if the logout is successful,
 * or an `AuthError` if an error occurs during the sign-out process.
 *
 * @example
 * const error = await logout();
 *
 * if (error) {
 *   console.error("Logout failed:", error.message);
 * } else {
 *   console.log("Logout successful!");
 * }
 */
export async function logout(): Promise<AuthError | null> {
  const { error } = await supabase.auth.signOut();
  return error;
}

/**
 * Sends a password reset email to the specified user.
 *
 * This function triggers a password reset email to be sent to the user via Supabase's `resetPasswordForEmail` method.
 * The email will contain a link that allows the user to reset their password, with an optional `redirectTo` URL
 * to specify where the user will be redirected after completing the reset.
 *
 * @param {Object} params - An object containing the user's email and redirection URL.
 * @param {string} params.email - The email address of the user requesting the password reset.
 * @param {string} params.redirectTo - The URL to redirect the user to after resetting their password.
 *
 * @returns {Promise<AuthError | null>} - A promise that resolves to `null` if the email is successfully sent,
 * or an `AuthError` if there is an issue with sending the email.
 *
 * @example
 * const error = await sendPasswordResetToEmail({
 *   email: "user@example.com",
 *   redirectTo: "https://yourapp.com/reset-password"
 * });
 *
 * if (error) {
 *   console.error("Failed to send password reset email:", error.message);
 * } else {
 *   console.log("Password reset email sent successfully!");
 * }
 */
export async function sendPasswordResetToEmail({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}): Promise<AuthError | null> {
  const response = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  return response.error;
}

/**
 * Updates the password for the currently authenticated user.
 *
 * This function uses Supabase's `updateUser` method to update the password for the authenticated user.
 * The new password is provided as an input, and upon success, the user information is returned in the response.
 *
 * @param {Object} params - An object containing the new password.
 * @param {string} params.newPassword - The new password to set for the user.
 *
 * @returns {Promise<UserResponse>} - A promise that resolves to a `UserResponse`, which contains the updated user information
 * and any relevant session data.
 *
 * @example
 * const response = await updatePasswordForUser({ newPassword: "newSecurePassword123" });
 *
 * if (response.error) {
 *   console.error("Failed to update password:", response.error.message);
 * } else {
 *   console.log("Password updated successfully!");
 * }
 */
export async function updatePasswordForUser({
  newPassword,
}: {
  newPassword: string;
}): Promise<UserResponse> {
  return await supabase.auth.updateUser({
    password: newPassword,
  });
}

/**
 * Signs in a user using OAuth via a specified provider.
 *
 * This function uses Supabase's `signInWithOAuth` method to authenticate a user using an external OAuth provider
 * such as Google, GitHub, Facebook, etc. It also allows for an optional `redirectTo` URL, which determines where
 * the user will be redirected after successful authentication. If `redirectTo` is not provided, the user will be
 * redirected to the `/dashboard` page by default.
 *
 * @param {Provider} provider - The OAuth provider to authenticate the user (e.g., 'google', 'github').
 * @param {string | null} redirectTo - Optional URL to redirect the user after successful authentication. If null,
 * the user will be redirected to the dashboard.
 *
 * @returns {Promise<OAuthResponse>} - A promise that resolves to the `OAuthResponse` object from Supabase,
 * which contains information about the user session and tokens, or an error if authentication fails.
 *
 * @example
 * const response = await signInWithOAuth("google", "/welcome");
 *
 * if (response.error) {
 *   console.error("OAuth sign-in failed:", response.error.message);
 * } else {
 *   console.log("OAuth sign-in successful!");
 * }
 */
export async function signInWithOAuth(
  provider: Provider,
  redirectTo: string | null
): Promise<OAuthResponse> {
  return await supabase.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: redirectTo
        ? `${process.env.NEXT_PUBLIC_SITE_BASE_URL} + ${redirectTo}`
        : `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard`,
    },
  });
}

// -----------------------------------------------------------------------------
// CLIENT HOOKS: access your user info and require authentication
// -----------------------------------------------------------------------------

/**
 * Custom hook to retrieve the current authenticated user of the application using Supabase Auth.
 *
 * This hook performs an initial session check with `supabase.auth.getSession()` to get the
 * currently authenticated user without querying the server repeatedly (efficient). It listens for
 * authentication state changes using `supabase.auth.onAuthStateChange`, ensuring that any changes
 * to the user's session (login, logout) are reflected in the hook's state.
 *
 * Note: This hook does not refresh the JWT token automatically, so use it in places where you do not
 * need a refreshed token. It's suitable for general usage throughout the application where user data
 * is needed without a strict need for real-time session updates.
 *
 * @returns {Object} - An object containing:
 *  - `user`: The current authenticated user object, or `null` if no user is authenticated.
 *  - `userIsLoading`: A boolean flag indicating whether the user data is still loading.
 *
 * @example
 * const { user, userIsLoading } = useUser();
 *
 * if (userIsLoading) return <p>Loading...</p>;
 *
 * if (user) return <p>Welcome, {user.email}</p>;
 *
 * return <p>Please log in.</p>;
 */
export const useUser = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userIsLoading, setUserIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then((response) => {
        setUser(response.data.session?.user ?? null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setUserIsLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    // Cleanup the listener when the component unmounts
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return { user, userIsLoading };
};

/**
 * Hook that enforces authentication by ensuring the user is logged in.
 *
 * If the user is not authenticated, they will be redirected to the login page (`/login`).
 * This hook checks the current user's authentication status via Supabase, retrieves the user
 * with a fresh JWT token, and listens for authentication state changes (e.g., login, logout).
 *
 * The hook manages an internal loading state (`userIsLoading`) while checking for the user’s session.
 * Once the loading completes, if no user is found, the hook triggers a client-side redirect to the
 * login page using Next.js `useRouter`. If a user is authenticated, it returns the current user object.
 *
 * @returns {User | null} - The currently authenticated user with a fresh JWT token, or `null` if no user is logged in.
 *
 * @example
 * const user = useRequireAuth(); // if the user doesn't load, it will automatically redirect you to the login page
 */
export const useRequireAuth = () => {
  const router = useRouter();
  //   const { user, userIsLoading } = useUser();
  const [user, setUser] = useState<User | null>();
  const [userIsLoading, setUserIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then((response) => {
        setUser(response.data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setUserIsLoading(false));

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    // Cleanup the listener when the component unmounts
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userIsLoading === false && !user) {
      router.push("/login");
    }
  }, [user, router, userIsLoading]);

  return user;
};
