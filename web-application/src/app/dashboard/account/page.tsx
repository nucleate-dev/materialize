import { TEAM_ACCOUNT_CREDITS_SETTINGS_PATH } from "@/GlobalConstants";
import { redirect } from "next/navigation";

export default function DashboardAccountRedirectPage() {
  redirect(TEAM_ACCOUNT_CREDITS_SETTINGS_PATH);
}
