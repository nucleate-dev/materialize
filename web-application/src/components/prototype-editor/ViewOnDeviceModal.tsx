"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { Copy, Monitor } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback } from "react";
import { toast } from "sonner";

interface ViewOnDeviceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  viewing_url: string;
  currentRenderStatus?: RenderStatus;
}

export function ViewOnDeviceModal({
  isOpen,
  onOpenChange,
  viewing_url,
  currentRenderStatus = "Static build",
}: ViewOnDeviceModalProps) {
  // Generate Expo Go deep link from viewing URL
  const getExpoGoDeepLink = useCallback(() => {
    if (!viewing_url) return "";

    try {
      // Extract the URL without protocol
      const url = new URL(viewing_url);
      const hostWithPath = `${url.host}${url.pathname}${url.search}`;

      // Format as Expo Go deep link
      // exp://NGROK_URL format for Expo Go
      return `exp://${hostWithPath}`;
    } catch {
      return "";
    }
  }, [viewing_url]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-accent border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            View on Device
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {currentRenderStatus === "Connected"
              ? "Scan this QR code with your phone's camera to open in Expo Go"
              : "Public viewing URL"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-6 py-6">
          {viewing_url && currentRenderStatus === "Connected" ? (
            <>
              <div className="bg-white p-4 rounded-xl shadow-lg">
                <QRCodeSVG
                  value={getExpoGoDeepLink()}
                  size={200}
                  level="H"
                />
              </div>
              <div className="text-center space-y-2 w-full px-4">
                <p className="text-xs text-muted-foreground">
                  Requires Expo Go installed on your device
                </p>
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border border-border">
                  <p className="text-xs font-mono text-foreground/70 break-all flex-1 text-left line-clamp-1">
                    {getExpoGoDeepLink()}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 hover:bg-accent"
                    onClick={() => {
                      navigator.clipboard.writeText(getExpoGoDeepLink());
                      toast.success("Deep link copied");
                    }}
                  >
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center space-y-4 w-full">
              <div className="w-12 h-12 bg-accent/50 rounded-full flex items-center justify-center mx-auto">
                <Monitor className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="w-full">
                <p className="text-sm text-muted-foreground mb-2">
                  Viewing URL
                </p>
                <div className="flex items-center gap-2 bg-background p-1 rounded-lg border border-border">
                  <div className="px-3 py-1.5 text-xs font-mono text-foreground/80 truncate flex-1">
                    {viewing_url}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(viewing_url);
                      toast.success("URL copied to clipboard!");
                    }}
                    className="h-7 px-3 hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
