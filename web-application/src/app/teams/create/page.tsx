"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GridBackground } from "@/components/shared/GridComponent";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/ClientConstants";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { CheckIcon, X } from "lucide-react";
import { CreditLimits } from "@/lib/types/serverAPITypes";

type PlanType = "plus" | "team";

export default function CreateTeamPage() {
  const router = useRouter();
  const logger = useProductLogger();
  const { setActiveTeam } = useActiveTeam();
  const { user } = useUser();
  const [teamName, setTeamName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [seatQuantity, setSeatQuantity] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTeam = async () => {
    if (!teamName.trim() || !selectedPlan || !user?.id) return;

    setIsCreating(true);

    try {
      // Generate UUID client-side so we know the team ID
      const teamId = crypto.randomUUID();

      // Create the team and select it back (works because creator can see empty teams)
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          id: teamId,
          name: teamName.trim(),
          created_by: user.id,
          personal_owner_user_id: null, // NOT a personal team
        })
        .select()
        .single();

      if (teamError || !team) {
        logger.debug("error", "Failed to create team", { error: teamError });
        alert("Failed to create team. Please try again.");
        setIsCreating(false);
        return;
      }

      // Add user as owner to the team
      const { error: membershipError } = await supabase
        .from("team_memberships")
        .insert({
          team_id: team.id,
          user_id: user.id,
          role: "owner",
        });

      if (membershipError) {
        logger.debug("error", "Failed to add user to team", {
          error: membershipError,
        });
        alert("Failed to add you to the team. Please try again.");
        setIsCreating(false);
        return;
      }

      // Update active team
      setActiveTeam(team);

      // Log analytics
      logger.log({
        event: "client_team_created",
        properties: {
          team_id: team.id,
          team_name: teamName,
          plan: selectedPlan,
          seat_quantity: selectedPlan === "team" ? seatQuantity : undefined,
        },
      });

      // Initiate checkout
      await handleCheckout(
        selectedPlan,
        router,
        team.id,
        selectedPlan === "team" ? seatQuantity : undefined,
      );
    } catch (error) {
      logger.debug("error", "Error creating team", {
        error: error instanceof Error ? error.message : String(error),
      });
      alert("An error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const canContinue = teamName.trim().length > 0 && selectedPlan !== null;

  const pricingPlans = [
    {
      name: "Plus",
      price: "$25",
      period: "per month",
      description: "For everyone",
      features: [
        "Everything in Free",
        "100 credits a month included",
        "Additional credit packs available",
        "Unlimited projects",
        "Unlimited folders",
        "View, edit, and export code",
      ],
      productKey: "plus" as const,
    },
    {
      name: "Team",
      price: "$35",
      period: "per seat/month",
      description: "For teams",
      features: [
        "Everything in Plus",
        "Unlimited viewers",
        "Multiple collaborators",
        "Team workspace",
        "Shared credits pool",
        "Priority support",
      ],
      productKey: "team" as const,
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      {/* Close button - outside main content container */}
      <button
        onClick={() => router.back()}
        className="fixed top-6 right-6 z-50 p-2 hover:bg-white/10 rounded-lg transition-colors"
        disabled={isCreating}
      >
        <X className="w-5 h-5" />
      </button>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 mb-3">
            Create a new team
          </h1>
          <p className="text-[#8A8F98] text-base max-w-md mx-auto">
            Set up your team workspace and choose a plan
          </p>
        </div>

        {/* Team Creation Card */}
        <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
          {/* Glow Effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-20"></div>

          <div className="relative bg-[#141517] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-8">
            {/* Team Name Section */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-white mb-3">
                Team name
              </label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                disabled={isCreating}
                className="bg-[#0B0C0E] border-white/10 text-white placeholder:text-white/30 h-12 text-base"
                maxLength={100}
              />
            </div>

            {/* Plan Selection Section */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-white mb-4">
                Select plan
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pricingPlans.map((plan) => (
                  <button
                    key={plan.productKey}
                    onClick={() => setSelectedPlan(plan.productKey)}
                    disabled={isCreating}
                    className={`relative p-6 rounded-xl flex flex-col text-left transition-all duration-200 ${
                      selectedPlan === plan.productKey
                        ? "bg-[#1A1B1E] border-2 border-indigo-500/50 shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]"
                        : "bg-transparent border-2 border-white/10 hover:border-white/20"
                    }`}
                  >
                    {selectedPlan === plan.productKey && (
                      <div className="absolute -top-3 -right-3 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-5 h-5 text-white" />
                      </div>
                    )}

                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-white">
                        {plan.name}
                      </h3>
                      <p className="text-sm text-[#8A8F98] mt-1 h-10">
                        {plan.description}
                      </p>
                    </div>

                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="text-3xl font-medium text-white">
                        {plan.price}
                      </span>
                      <span className="text-[#8A8F98] text-sm">
                        /{plan.period}
                      </span>
                    </div>

                    {/* Seat Selector for Team plan */}
                    {plan.productKey === "team" && selectedPlan === "team" && (
                      <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-sm font-medium text-white mb-3">
                          Number of seats
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSeatQuantity(Math.max(1, seatQuantity - 1));
                            }}
                            disabled={seatQuantity <= 1 || isCreating}
                            className="h-9 w-9 bg-white/5 hover:bg-white/10 border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={seatQuantity}
                            onChange={(e) => {
                              const num = parseInt(e.target.value) || 1;
                              setSeatQuantity(Math.max(1, num));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-center h-9 w-20 text-sm bg-[#0B0C0E] border-white/20 text-white"
                            disabled={isCreating}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSeatQuantity(seatQuantity + 1);
                            }}
                            disabled={isCreating}
                            className="h-9 w-9 bg-white/5 hover:bg-white/10 border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            +
                          </Button>
                          <div className="text-xs text-muted-foreground ml-2">
                            {(
                              seatQuantity * CreditLimits.TEAM
                            ).toLocaleString()}{" "}
                            credits/mo
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 mt-auto">
                      {plan.features.map((feature, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-sm text-[#8A8F98]"
                        >
                          <CheckIcon className="w-4 h-4 text-white/40 shrink-0" />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Create Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleCreateTeam}
                disabled={!canContinue || isCreating}
                size="lg"
                className="bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-8"
              >
                {isCreating ? "Creating team..." : "Create team & continue"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
