"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { Check, Loader2, Sparkles, Star, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type UpsellReason =
  | "free_message_limit_reached"
  | "prototype_creation_limit_reached";

interface ProPlanUpsellModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpsellReason;
  creditsUsed?: number;
  creditLimit?: number;
  onDismiss?: () => void;
}

export default function ProPlanUpsellModal({
  open,
  onOpenChange,
  reason,
  creditsUsed,
  creditLimit,
  onDismiss,
}: ProPlanUpsellModalProps) {
  const logger = useProductLogger();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const { userPlan } = useSubscriptionAccess();

  // Determine which tier to suggest based on current plan
  const getSuggestedUpgrade = () => {
    return {
      tier: "plus",
      name: "Plus",
      price: "$25/month",
    };
  };

  const suggestedUpgrade = getSuggestedUpgrade();

  const getUpsellContent = () => {
    const nextTierCredits = CreditLimits.PLUS;

    switch (reason) {
      case "free_message_limit_reached":
        return {
          limitText: `Limit reached: ${Math.round(creditsUsed ?? 0)}/${creditLimit ?? nextTierCredits} credits`,
          title: `Continue building with ${suggestedUpgrade.name}`,
          description: `Upgrade to ${suggestedUpgrade.name} for ${nextTierCredits} credits per month and keep building amazing apps.`,
          features: [
            `${nextTierCredits} credits per month`,
            "Priority AI responses",
            "Advanced code generation",
            "Premium support",
          ],
        };
      case "prototype_creation_limit_reached":
        return {
          limitText: "Project limit reached",
          title: `Create unlimited projects with ${suggestedUpgrade.name}`,
          description: `Upgrade to ${suggestedUpgrade.name} for unlimited project creation and advanced features.`,
          features: [
            "Unlimited projects",
            `${nextTierCredits} credits per month`,
            "Advanced prototyping features",
            "Priority support",
          ],
        };
      default:
        return {
          limitText: "Limit reached",
          title: `Upgrade to ${suggestedUpgrade.name}`,
          description: "Unlock premium features and continue building.",
          features: [
            `${nextTierCredits} credits per month`,
            "Unlimited projects",
            "Priority support",
            "Advanced features",
          ],
        };
    }
  };

  const content = getUpsellContent();

  // Credit packs for paid users
  const creditPacks = [
    { credits: 100, price: 25, id: "credit_pack_100" },
    { credits: 500, price: 110, id: "credit_pack_500", bestValue: true },
    { credits: 1000, price: 200, id: "credit_pack_1000" },
  ];

  const handleUpgrade = async (tier?: string) => {
    try {
      setIsProcessing(true);
      const targetTier = tier || suggestedUpgrade.tier;
      logger.log({
        event: "client_upgrade_checkout_clicked",
        properties: {
          source: "pro_plan_upsell_modal",
          reason,
          plan: targetTier,
        },
      });
      await handleCheckout(targetTier, router);
      // Keep processing state for 1 second longer to account for Stripe redirect delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      logger.debug("error", "Error starting checkout:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Fallback to account page if checkout fails
      window.open("/dashboard/account", "_blank");
      setIsProcessing(false);
    }
  };

  const isPaidUser = userPlan !== "free";

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    onOpenChange(false);
  };

  useEffect(() => {
    if (open) {
      logger.log({
        event: "client_pro_plan_upsell_modal_opened",
        properties: {
          reason,
          userPlan,
        },
      });
    }
  }, [open, logger, reason, userPlan]);

  // For paid users, show credit packs; for free users, show upgrade
  if (isPaidUser) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg bg-[#141517] border border-white/10 text-white p-0 gap-0 overflow-hidden shadow-2xl">
          {/* Visual Header */}
          <div className="relative p-8 flex flex-col items-center text-center bg-[#0B0C0E] border-b border-white/5">
            {/* Glow Effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-yellow-500/20 blur-[50px] rounded-full pointer-events-none" />

            <div className="relative w-14 h-14 rounded-2xl bg-[#141517] border border-yellow-500/30 shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-yellow-400 fill-yellow-400/20" />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">
                {content.limitText}
              </span>
            </div>

            <h3 className="text-xl font-medium text-white mb-2 tracking-tight">
              Top Up Credits
            </h3>
            <p className="text-[#8A8F98] text-sm leading-relaxed max-w-[90%] mx-auto">
              Purchase additional credits to keep building.
            </p>
          </div>

          {/* Credit Packs */}
          <div className="p-6 bg-[#141517]">
            <div className="grid grid-cols-3 gap-3">
              {creditPacks.map((pack) => (
                <div
                  key={pack.id}
                  className={cn(
                    "relative rounded-xl border transition-all duration-200 group cursor-pointer flex flex-col",
                    pack.bestValue
                      ? "bg-[#1A1B1E] border-purple-500/50 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)] pt-6 pb-4 px-4"
                      : "bg-[#141517] border-white/10 hover:border-white/20 shadow-sm p-4",
                  )}
                  onClick={() => !isProcessing && handleUpgrade(pack.id)}
                >
                  {pack.bestValue && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full border border-purple-400 whitespace-nowrap">
                      Best Value
                    </div>
                  )}
                  <div className="flex flex-col items-center text-center mb-3">
                    <h4 className="text-white font-medium text-sm mb-1">
                      {pack.credits} Credits
                    </h4>
                    <span className="text-2xl font-semibold text-white">
                      ${pack.price}
                    </span>
                  </div>
                  <div className="text-xs text-[#8A8F98] text-center mb-3 flex-grow">
                    <div>Never expires</div>
                    <div className="mt-1">
                      ${(pack.price / pack.credits).toFixed(2)} / credit
                    </div>
                  </div>
                  <Button
                    className={cn(
                      "w-full h-8 text-xs mt-auto",
                      pack.bestValue
                        ? "bg-white text-black hover:bg-white/90"
                        : "bg-white/5 text-white hover:bg-white/10 border border-white/10",
                    )}
                    disabled={isProcessing}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpgrade(pack.id);
                    }}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Purchase"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="p-6 pt-0 bg-[#141517] flex-col sm:flex-row gap-3">
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="text-[#8A8F98] hover:text-white hover:bg-white/5 w-full"
            >
              Maybe Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Free users - show upgrade modal
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#141517] border border-white/10 text-white p-0 gap-0 overflow-hidden shadow-2xl">
        {/* Visual Header */}
        <div className="relative p-8 flex flex-col items-center text-center bg-[#0B0C0E] border-b border-white/5">
          {/* Glow Effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 blur-[50px] rounded-full pointer-events-none" />

          <div className="relative w-14 h-14 rounded-2xl bg-[#141517] border border-indigo-500/30 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)] flex items-center justify-center mb-6">
            <Star className="w-7 h-7 text-indigo-400 fill-indigo-400/20" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">
              {content.limitText}
            </span>
          </div>

          <h3 className="text-xl font-medium text-white mb-2 tracking-tight">
            {content.title}
          </h3>
          <p className="text-[#8A8F98] text-sm leading-relaxed max-w-[90%] mx-auto">
            {content.description}
          </p>
        </div>

        {/* Features List */}
        <div className="p-8 pb-6 bg-[#141517]">
          <div className="space-y-4">
            {content.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3 group">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-sm text-white/90">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-6 pt-0 bg-[#141517] flex-col sm:flex-row gap-3">
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="text-[#8A8F98] hover:text-white hover:bg-white/5 w-full sm:w-auto"
          >
            Maybe Later
          </Button>
          <Button
            onClick={() => handleUpgrade()}
            disabled={isProcessing}
            className="w-full sm:w-auto bg-white text-black hover:bg-white/90 rounded-full font-semibold shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2 fill-current" />
                Upgrade to {suggestedUpgrade.name} — {suggestedUpgrade.price}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
