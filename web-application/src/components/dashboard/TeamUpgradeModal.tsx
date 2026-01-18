"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveTeam } from "@/contexts/TeamContext";
import { Loader2, Users } from "lucide-react";
import { CreditLimits } from "@/lib/types/serverAPITypes";

interface TeamUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (seatQuantity: number) => Promise<void>;
}

const PRICE_PER_SEAT = 35;
const CREDITS_PER_SEAT = CreditLimits.TEAM;
const MIN_SEATS = 1;

export function TeamUpgradeModal({
  isOpen,
  onClose,
  onConfirm,
}: TeamUpgradeModalProps) {
  const { teamMembers } = useActiveTeam();

  // Calculate default seat count based on non-viewer members
  const getNonViewerCount = useCallback(() => {
    if (!teamMembers || teamMembers.length === 0) {
      return MIN_SEATS; // Default minimum
    }
    const nonViewers = teamMembers.filter((member) => member.role !== "viewer");
    return Math.max(MIN_SEATS, nonViewers.length);
  }, [teamMembers]);

  const [seatQuantity, setSeatQuantity] = useState(getNonViewerCount());
  const [isProcessing, setIsProcessing] = useState(false);

  // Update seat quantity when modal opens or team members change
  useEffect(() => {
    if (isOpen) {
      setSeatQuantity(getNonViewerCount());
    }
  }, [getNonViewerCount, isOpen]);

  const totalPrice = seatQuantity * PRICE_PER_SEAT;
  const totalCredits = seatQuantity * CREDITS_PER_SEAT;

  const handleSeatChange = (value: string) => {
    const num = parseInt(value) || MIN_SEATS;
    setSeatQuantity(Math.max(MIN_SEATS, num));
  };

  const handleConfirm = async () => {
    if (seatQuantity < MIN_SEATS) {
      alert(`Team plan requires at least ${MIN_SEATS} seats`);
      return;
    }

    setIsProcessing(true);
    try {
      await onConfirm(seatQuantity);
    } catch {
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Upgrade to Team Plan
          </DialogTitle>
          <DialogDescription>
            Add team members with different permission levels and collaborate
            together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Seat Quantity Input */}
          <div className="space-y-2">
            <Label htmlFor="seats" className="text-sm font-medium">
              Number of Seats
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  setSeatQuantity(Math.max(MIN_SEATS, seatQuantity - 1))
                }
                disabled={seatQuantity <= MIN_SEATS}
                className="h-10 w-10"
              >
                -
              </Button>
              <Input
                id="seats"
                type="number"
                min={MIN_SEATS}
                value={seatQuantity}
                onChange={(e) => handleSeatChange(e.target.value)}
                className="text-center h-10 text-lg font-medium"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSeatQuantity(seatQuantity + 1)}
                className="h-10 w-10"
              >
                +
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You currently have {getNonViewerCount()} non-viewer member
              {getNonViewerCount() !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Pricing Breakdown */}
          <div className="rounded-lg bg-muted border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price per seat</span>
              <span className="font-medium">${PRICE_PER_SEAT}/month</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Number of seats</span>
              <span className="font-medium">× {seatQuantity}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-semibold text-lg">${totalPrice}/month</span>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Team Plan Includes:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>
                  <strong className="text-foreground">
                    {totalCredits.toLocaleString()} credits
                  </strong>{" "}
                  per month ({CREDITS_PER_SEAT} per seat)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>Unlimited team members with Viewer roles</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>
                  Multiple team members with Owner, Admin, and Editor roles
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>Live collaboration on projects</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>Priority support</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              `Continue to Checkout ($${totalPrice}/mo)`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
