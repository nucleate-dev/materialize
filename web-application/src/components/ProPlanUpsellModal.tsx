"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductKeys } from "@/GlobalConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { Star, Sparkles, Check } from "lucide-react";
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

  const getUpsellContent = () => {
    switch (reason) {
      case "free_message_limit_reached":
        return {
          limitText: `Free limit reached: ${messageCount}/${messageLimit} messages`,
          title: "Continue building with Pro",
          description:
            "Unlock unlimited AI-powered development and keep building amazing apps.",
          features: [
            "100 messages per month",
            "Priority AI responses",
            "Advanced code generation",
            "Premium support",
          ],
        };
      case "prototype_creation_limit_reached":
        return {
          limitText: "Free limit reached: 5/5 prototypes",
          title: "Create unlimited prototypes with Pro",
          description:
            "You can only create 5 prototypes on the free plan. Upgrade to Pro for unlimited prototype creation.",
          features: [
            "Unlimited prototypes",
            "Advanced prototype features",
            "Priority AI responses",
            "Premium support",
          ],
        };
      default:
        return {
          limitText: "Free limit reached",
          title: "Upgrade to Pro",
          description: "Unlock premium features and continue building.",
          features: [
            "Unlimited access",
            "Priority support",
            "Advanced features",
            "Premium tools",
          ],
        };
    }
  };

  const content = getUpsellContent();

  const handleUpgrade = async () => {
    try {
      setIsProcessing(true);
      await handleCheckout(ProductKeys.PRO_SUBSCRIPTION, router);
      // Keep processing state for 1 second longer to account for Stripe redirect delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      logger.debug("error", "Error starting checkout:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Fallback to billing page if checkout fails
      window.open("/dashboard/billing", "_blank");
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
            <DialogTitle className="text-xl">Upgrade to Pro</DialogTitle>
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
                Upgrade to Pro
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
