"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WaitlistModal({ open, onOpenChange }: WaitlistModalProps) {
  const handleJoinWaitlist = () => {
    window.open(
      "https://docs.google.com/forms/d/e/1FAIpQLSfQ6d-hfVG5x250NpqnTJVPFmMcMqEfFZKUnmTTET7nzD2GEw/viewform?usp=header",
      "_blank",
      "noopener noreferrer"
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Coming Soon!
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            Materialize is still in development. We&apos;re working hard to bring you the best
            React Native prototyping experience.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-4">
          <p className="text-center text-gray-600 dark:text-gray-400">
            Want to be the first to know when we launch?
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={handleJoinWaitlist} className="flex-1">
              Join Waitlist
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}