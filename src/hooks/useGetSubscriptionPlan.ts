import { Database } from "@/lib/types/database.types";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";

export function useGetSubscriptionPlan(): Database["public"]["Enums"]["subscription_plan_type"] {
  const { userPlan } = useSubscriptionAccess();
  return userPlan;
}
