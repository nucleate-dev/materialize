"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditLimits, ProductKeys } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { Check, Sparkles, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type UpsellReason =
  | "free_message_limit_reached"
  | "prototype_creation_limit_reached";

interface ProPlanUpsellModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpsellReason;
  messageCount?: number;
  messageLimit?: number;
  onDismiss?: () => void;
}

export default function ProPlanUpsellModal({
  open,
  onOpenChange,
  reason,
  messageCount,
  messageLimit,
  onDismiss,
}: ProPlanUpsellModalProps) {
  const logger = useProductLogger();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const { userPlan } = useSubscriptionAccess();

  // Determine which tier to suggest based on current plan
  const getSuggestedUpgrade = () => {
    switch (userPlan) {
      case "free":
        return {
          tier: ProductKeys.PLUS_SUBSCRIPTION,
          name: "Plus",
          price: "$20/month",
        };
      case "plus":
        return {
          tier: ProductKeys.PRO_SUBSCRIPTION,
          name: "Pro",
          price: "$50/month",
        };
      case "pro":
        return {
          tier: ProductKeys.MAX_SUBSCRIPTION,
          name: "Max",
          price: "$200/month",
        };
      default:
        return {
          tier: ProductKeys.PLUS_SUBSCRIPTION,
          name: "Plus",
          price: "$20/month",
        };
    }
  };

  const suggestedUpgrade = getSuggestedUpgrade();

  const getUpsellContent = () => {
    const getCreditLimitForPlan = (plan: string) => {
      switch (plan) {
        case "Plus":
          return CreditLimits.PLUS;
        case "Pro":
          return CreditLimits.PRO;
        case "Max":
          return CreditLimits.MAX;
        default:
          return CreditLimits.PLUS;
      }
    };

    const nextTierCredits = getCreditLimitForPlan(suggestedUpgrade.name);

    switch (reason) {
      case "free_message_limit_reached":
        return {
          limitText: `Limit reached: ${messageCount}/${messageLimit} credits`,
          title: `Continue building with ${suggestedUpgrade.name}`,
          description: `Upgrade to ${suggestedUpgrade.name} for ${nextTierCredits} credits per month and keep building amazing apps.`,
          features: [
            `${nextTierCredits} credits per month`,
            "Priority AI responses",
            "Advanced code generation",
            suggestedUpgrade.name === "Max" ? "Dedicated support" : "Premium support",
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
            suggestedUpgrade.name === "Max" ? "Dedicated support" : "Priority support",
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

  const handleUpgrade = async () => {
    try {
      setIsProcessing(true);
      await handleCheckout(suggestedUpgrade.tier, router);
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

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-muted">
              <Star className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              Upgrade to {suggestedUpgrade.name}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 rounded-full mb-4">
              <Sparkles className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {content.limitText}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {content.title}
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              {content.description}
            </p>
          </div>

          <div className="space-y-3">
            {content.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <Check className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleDismiss}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Star className="w-4 h-4 mr-2" />
                Upgrade to {suggestedUpgrade.name} - {suggestedUpgrade.price}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
