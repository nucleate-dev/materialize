"use client";

import * as React from "react";
import Link from "next/link";
import {
  Target,
  Palette,
  Wrench,
  Presentation,
  Zap,
  FileText,
  Menu,
} from "lucide-react";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { cn } from "@/lib/classNames";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

interface UseCase {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  slug: string;
}

const useCases: UseCase[] = [
  {
    icon: Target,
    title: "Prototyping & Validation",
    subtitle: "Turn PRDs into testable prototypes instantly",
    slug: "prototyping",
  },
  {
    icon: Palette,
    title: "Design Exploration",
    subtitle: "See 10 variants in minutes, not 1 in a week",
    slug: "design-exploration",
  },
  {
    icon: Wrench,
    title: "Internal Tools",
    subtitle: "Ship dashboards and admin panels without engineering",
    slug: "internal-tools",
  },
  {
    icon: Presentation,
    title: "Customer Demos",
    subtitle: "Personalized demos that always match your product",
    slug: "customer-demos",
  },
  {
    icon: Zap,
    title: "Vibe Coding",
    subtitle: "Go from concept to app through conversation",
    slug: "vibe-coding",
  },
  {
    icon: FileText,
    title: "Landing Pages",
    subtitle: "Launch marketing pages without waiting for dev",
    slug: "landing-pages",
  },
];

interface UseCaseItemProps {
  useCase: UseCase;
  onClick?: () => void;
  className?: string;
}

function UseCaseItem({ useCase, onClick, className }: UseCaseItemProps) {
  const Icon = useCase.icon;

  return (
    <Link
      href={`/use-cases/${useCase.slug}`}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg",
        "transition-all duration-200 ease-out",
        "hover:bg-accent/50 hover:scale-[1.02]",
        "focus:outline-none focus:ring-2 focus:ring-primary/50",
        "group",
        className
      )}
    >
      <div className="flex-shrink-0 p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-200">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-200">
          {useCase.title}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {useCase.subtitle}
        </span>
      </div>
    </Link>
  );
}

export function UseCasesMegaMenuDesktop() {
  const logger = useProductLogger();

  const handleUseCaseClick = (useCase: UseCase) => {
    logger.log({
      event: "client_landing_page_header_item_clicked",
      properties: {
        component: "UseCasesMegaMenu",
        item: `use_case_${useCase.slug}`,
        destination: `/use-cases/${useCase.slug}`,
        useCase: useCase.title,
      },
    });
  };

  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="bg-transparent hover:bg-accent/50 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=open]:bg-accent/50 data-[state=open]:text-foreground">
            Use Cases
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-[500px] p-4 bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-xl">
              <div className="grid grid-cols-2 gap-1">
                {useCases.map((useCase) => (
                  <UseCaseItem
                    key={useCase.slug}
                    useCase={useCase}
                    onClick={() => handleUseCaseClick(useCase)}
                  />
                ))}
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

interface MobileNavigationProps {
  blogLink?: React.ReactNode;
  authButtons?: React.ReactNode;
}

export function MobileNavigation({
  blogLink,
  authButtons,
}: MobileNavigationProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const logger = useProductLogger();

  const handleUseCaseClick = (useCase: UseCase) => {
    logger.log({
      event: "client_landing_page_header_item_clicked",
      properties: {
        component: "UseCasesMegaMenu",
        item: `use_case_${useCase.slug}`,
        destination: `/use-cases/${useCase.slug}`,
        useCase: useCase.title,
        isMobile: true,
      },
    });
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-200"
          aria-label="Open navigation menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="text-left pb-4 border-b border-border">
          <SheetTitle className="text-lg font-semibold">Navigation</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-full overflow-y-auto py-4">
          {/* Use Cases Section */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Use Cases
            </h3>
            <div className="flex flex-col gap-1">
              {useCases.map((useCase) => (
                <UseCaseItem
                  key={useCase.slug}
                  useCase={useCase}
                  onClick={() => handleUseCaseClick(useCase)}
                />
              ))}
            </div>
          </div>

          {/* Other Links Section */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Resources
            </h3>
            <div className="flex flex-col gap-1 px-3">
              {blogLink && (
                <SheetClose asChild>{blogLink}</SheetClose>
              )}
            </div>
          </div>

          {/* Auth Section */}
          {authButtons && (
            <div className="mt-auto pt-4 border-t border-border">
              <div className="flex flex-col gap-2 px-3">
                {authButtons}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { useCases };
export type { UseCase };
