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
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { StarIcon, SparklesIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProPlanUpsellModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageCount: number;
  messageLimit: number;
  onDismiss?: () => void;
}

export default function ProPlanUpsellModal({
  open,
  onOpenChange,
  messageCount,
  messageLimit,
  onDismiss,
}: ProPlanUpsellModalProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUpgrade = async () => {
    try {
      setIsProcessing(true);
      await handleCheckout(ProductKeys.PRO_SUBSCRIPTION, router);
      // Keep processing state for 1 second longer to account for Stripe redirect delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      console.error("Error starting checkout:", error);
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
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30">
              <StarIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-xl">Upgrade to Pro</DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-full mb-4">
              <SparklesIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                Free limit reached: {messageCount}/{messageLimit} messages
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Continue building with Pro
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Unlock unlimited AI-powered development and keep building amazing
              apps.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-foreground">
                100 messages per month
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-foreground">
                Priority AI responses
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-foreground">
                Advanced code generation
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-foreground">Premium support</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleDismiss}>
            Maybe Later
          </Button>
          <Button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <StarIcon className="w-4 h-4 mr-2" />
                Upgrade to Pro
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
