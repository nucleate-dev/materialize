import { User } from "@supabase/supabase-js";
import { supabase } from "@/ClientConstants";
import { useEffect, useState } from "react";

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
      },
    );

    // Cleanup the listener when the component unmounts
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return { user, userIsLoading };
};