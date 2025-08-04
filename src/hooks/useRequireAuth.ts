import { User } from "@supabase/supabase-js";
import { supabase } from "@/ClientConstants";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Hook that enforces authentication by ensuring the user is logged in.
 *
 * If the user is not authenticated, they will be redirected to the login page (`/login`).
 * This hook checks the current user's authentication status via Supabase, retrieves the user
 * with a fresh JWT token, and listens for authentication state changes (e.g., login, logout).
 *
 * The hook manages an internal loading state (`userIsLoading`) while checking for the user's session.
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
      },
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