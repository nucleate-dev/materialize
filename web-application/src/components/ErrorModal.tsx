"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

type ErrorModalProps = {
  show: boolean;
  onClose: () => void;
  errorMessage: string;
};

export default function ErrorModal({
  show,
  onClose,
  errorMessage,
}: ErrorModalProps) {
  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-[#141517] border border-white/10 text-white shadow-2xl">
        <DialogHeader className="text-center space-y-3 pb-2">
          <div className="flex items-center justify-center">
            <div className="p-2.5 bg-[#0B0C0E] border border-white/10 rounded-xl shadow-inner">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <DialogTitle className="text-xl font-medium tracking-tight text-white">
            Error
          </DialogTitle>
        </DialogHeader>

        <div className="text-center mb-4">
          <p className="text-sm text-[#8A8F98] leading-relaxed break-words">
            {errorMessage}
          </p>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            onClick={onClose}
            className="w-full h-11 bg-white text-black hover:bg-white/90 font-medium rounded-lg"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}