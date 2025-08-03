import { Database } from "@/lib/types/database.types";
import { useHasSubscriptionAccess } from "@/lib/utils/payments/PaymentValidationUtils";

export function useGetSubscriptionPlan(): Database["public"]["Enums"]["subscription_plan_type"] {
  const { userPlan } = useHasSubscriptionAccess();
  return userPlan;
}
