import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/classNames";
import { Database } from "@/lib/types/supabase";
import {
  AlertTriangle,
  Folder,
  Loader2,
  Lock,
  Palette,
  Rocket,
  Sparkles,
  Settings,
} from "lucide-react";
import {
  VIEWER_ROLE_RESTRICTION_MESSAGE,
  ENABLE_DESIGN_SYSTEM,
} from "@/GlobalConstants";
import {
  PLATFORM_OPTIONS,
  PrototypeFramework,
} from "@/hooks/usePrototypePlatformOptions";
import { VisibilityOption, PrototypeVisibility } from "@/hooks/usePrototypeVisibilityOptions";
import { useState } from "react";

export type DesignStyle = Database["public"]["Enums"]["design_style"];
export type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

export type FolderOption = {
  id: string;
  name: string;
  folder_context: Database["public"]["Tables"]["folders"]["Row"]["folder_context"];
};

export interface NewPrototypeModalUIProps {
  open: boolean;
  onClose: () => void;
  
  // State
  name: string;
  setName: (name: string) => void;
  touched: boolean;
  isCreating: boolean;
  framework: PrototypeFramework;
  setFramework: (framework: PrototypeFramework) => void;
  
  // Visibility
  visibility: PrototypeVisibility;
  handleVisibilityChange: (value: PrototypeVisibility) => void;
  visibilityOptions: VisibilityOption[];
  
  // Upsell
  showUpsellModal: boolean;
  setShowUpsellModal: (show: boolean) => void;
  
  // Subscription / Limits
  userPlan: string | null;
  prototypeCount: number;
  isLoadingCount: boolean;
  onUpgradeClick: () => void;
  isUserPlanSubscribed: boolean;

  // Advanced Options
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  
  // Folders
  folders: FolderOption[];
  selectedFolder: string | null;
  setSelectedFolder: (id: string | null) => void;
  isLoadingFolders: boolean;
  
  // Design Systems
  designStyle: DesignStyle;
  setDesignStyle: (style: DesignStyle) => void;
  availableDesignStyles: DesignStyle[];
  getDesignStyleLabel: (style: DesignStyle) => string;
  customDesignSystemId: string | null;
  setCustomDesignSystemId: (id: string | null) => void;
  designSystems: DesignSystemRow[];
  
  // Form
  handleSubmit: (e: React.FormEvent) => void;
  
  // Manual selection tracking
  setHasManualDesignSelection: (val: boolean) => void;
  
  isViewer: boolean;
}

export default function NewPrototypeModalUI({
  open,
  onClose,
  name,
  setName,
  touched,
  isCreating,
  framework,
  setFramework,
  visibility,
  handleVisibilityChange,
  visibilityOptions,
  showUpsellModal,
  setShowUpsellModal,
  userPlan,
  prototypeCount,
  isLoadingCount,
  onUpgradeClick,
  isUserPlanSubscribed,
  showAdvanced,
  setShowAdvanced,
  folders,
  selectedFolder,
  setSelectedFolder,
  isLoadingFolders,
  designStyle,
  setDesignStyle,
  availableDesignStyles,
  getDesignStyleLabel,
  customDesignSystemId,
  setCustomDesignSystemId,
  designSystems,
  handleSubmit,
  setHasManualDesignSelection,
  isViewer,
}: NewPrototypeModalUIProps) {
  const [activeTab, setActiveTab] = useState<"essentials" | "advanced">("essentials");
  const isLimitReached = userPlan === "free" && prototypeCount >= 5;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border border-border text-foreground shadow-2xl">
          <DialogHeader className="text-center space-y-3 pb-2">
            <div className="flex items-center justify-center">
              <div className="p-2.5 bg-muted border border-border rounded-xl shadow-inner">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
            </div>
            <DialogTitle className="text-xl font-medium tracking-tight text-foreground">
              Create New Project
            </DialogTitle>
            {userPlan === "free" && (
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isLoadingCount ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Check Limits
                  </span>
                ) : (
                  <span>{prototypeCount}/5 Free Projects Used</span>
                )}
              </div>
            )}
          </DialogHeader>

          {isLimitReached && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-amber-800 dark:text-yellow-200 mb-1">
                    Limit Reached
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-yellow-200/70 mb-3 leading-relaxed">
                    Free plans include 5 projects. Upgrade to Plus for unlimited
                    projects.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs bg-amber-500 text-white dark:text-black hover:bg-amber-600 dark:hover:bg-yellow-400 border-0"
                    onClick={onUpgradeClick}
                  >
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab("essentials")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200",
                activeTab === "essentials"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Rocket className="w-3.5 h-3.5" />
                <span>Essentials</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("advanced")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200",
                activeTab === "advanced"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                <span>Advanced</span>
              </div>
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className={cn(
              "space-y-5",
              isLimitReached && "opacity-50 pointer-events-none"
            )}
          >
            {/* ESSENTIALS TAB */}
            {activeTab === "essentials" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="space-y-2">
                  <Label
                    htmlFor="prototype-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Project Name
                  </Label>
                  <Input
                    id="prototype-name"
                    type="text"
                    placeholder="e.g. Fitness Tracker App"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      "h-11 bg-background border-border text-foreground focus:border-primary placeholder:text-muted-foreground/50 transition-all",
                      touched &&
                        !name.trim() &&
                        "border-destructive/50 focus-visible:ring-destructive/20"
                    )}
                    autoFocus
                    maxLength={64}
                  />
                  {touched && !name.trim() && (
                    <p className="text-xs text-destructive">Name is required</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="platform-select"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Platform
                  </Label>
                  <Select
                    value={framework}
                    onValueChange={(value) =>
                      setFramework(value as PrototypeFramework)
                    }
                    disabled={isCreating}
                  >
                    <SelectTrigger
                      id="platform-select"
                      className="h-11 bg-background border-border text-foreground focus:ring-0"
                    >
                      <div className="flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-muted-foreground" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      {PLATFORM_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="focus:bg-muted focus:text-foreground cursor-pointer"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="prototype-visibility"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Visibility
                    </Label>
                    {!isUserPlanSubscribed && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Upgrade for Private
                      </span>
                    )}
                  </div>
                  <Select
                    value={visibility}
                    onValueChange={handleVisibilityChange}
                    disabled={isCreating}
                  >
                    <SelectTrigger
                      id="prototype-visibility"
                      className="h-11 bg-background border-border text-foreground focus:ring-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      {visibilityOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="focus:bg-muted focus:text-foreground cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground" />
                              <span>{option.label}</span>
                              {option.isLocked && (
                                <Lock className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ADVANCED TAB */}
            {activeTab === "advanced" && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="space-y-2">
                  <Label
                    htmlFor="project-select"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Folder
                  </Label>
                  <Select
                    value={selectedFolder || "none"}
                    onValueChange={(value) => {
                      setSelectedFolder(value === "none" ? null : value);
                      setHasManualDesignSelection(false);
                    }}
                  >
                    <SelectTrigger className="h-11 bg-background border-border text-foreground text-sm focus:ring-0">
                      <div className="flex items-center gap-2 truncate">
                        <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Select folder..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      <SelectItem
                        value="none"
                        className="focus:bg-muted focus:text-foreground cursor-pointer text-sm"
                      >
                        No folder
                      </SelectItem>
                      {isLoadingFolders ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                        </div>
                      ) : (
                        folders.map((project) => (
                          <SelectItem
                            key={project.id}
                            value={project.id}
                            className="focus:bg-muted focus:text-foreground cursor-pointer text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                              {project.name}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {ENABLE_DESIGN_SYSTEM && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="design-style"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Style
                    </Label>
                    <Select
                      value={designStyle}
                      onValueChange={(value) => {
                        setDesignStyle(value as DesignStyle);
                        setHasManualDesignSelection(true);
                      }}
                    >
                      <SelectTrigger
                        id="design-style"
                        className="h-11 bg-background border-border text-foreground text-sm focus:ring-0"
                      >
                        <div className="flex items-center gap-2">
                          <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        {availableDesignStyles.map((style) => (
                          <SelectItem
                            key={style}
                            value={style}
                            className="focus:bg-muted focus:text-foreground cursor-pointer text-sm"
                          >
                            {getDesignStyleLabel(style)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {ENABLE_DESIGN_SYSTEM && designSystems.length > 0 && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="custom-design-system"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Design System
                    </Label>
                    <Select
                      value={customDesignSystemId ?? "none"}
                      onValueChange={(value) => {
                        setCustomDesignSystemId(value === "none" ? null : value);
                        setHasManualDesignSelection(true);
                      }}
                    >
                      <SelectTrigger
                        id="custom-design-system"
                        className="h-11 bg-background border-border text-foreground text-sm focus:ring-0"
                      >
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        <SelectItem
                          value="none"
                          className="focus:bg-muted focus:text-foreground cursor-pointer text-sm"
                        >
                          None
                        </SelectItem>
                        {designSystems.map((system) => (
                          <SelectItem
                            key={system.id}
                            value={String(system.id)}
                            className="focus:bg-muted focus:text-foreground cursor-pointer text-sm"
                          >
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    These settings are optional. You can leave them as defaults.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button (visible on both tabs) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full pt-2">
                    <Button
                      type="submit"
                      disabled={
                        isCreating ||
                        !name.trim() ||
                        isLimitReached ||
                        isViewer
                      }
                      className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-lg"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4 mr-2" />
                          Create Project
                        </>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                {isViewer && (
                  <TooltipContent>
                    <p>{VIEWER_ROLE_RESTRICTION_MESSAGE}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </form>
        </DialogContent>
      </Dialog>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </>
  );
}
