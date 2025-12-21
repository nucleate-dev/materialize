"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DocSection } from "@/lib/docs";
import { ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface DocsSidebarProps {
  sections: DocSection[];
}

function SidebarContent({
  sections,
  currentSlug,
  onLinkClick,
}: {
  sections: DocSection[];
  currentSlug: string;
  onLinkClick?: () => void;
}) {
  return (
    <ScrollArea className="h-full py-6 pr-4">
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.slug}>
            <h4 className="mb-2 px-3 text-sm font-semibold text-foreground/70 uppercase tracking-wider">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.pages.map((page) => {
                const isActive = currentSlug === page.slug;
                return (
                  <Link
                    key={page.slug}
                    href={`/docs/${page.slug}`}
                    onClick={onLinkClick}
                    className={`
                      group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors
                      ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                    `}
                  >
                    <ChevronRight
                      className={`h-3 w-3 transition-transform ${isActive ? "text-primary" : "text-muted-foreground/50"}`}
                    />
                    {page.title}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function DocsSidebar({ sections }: DocsSidebarProps) {
  const pathname = usePathname();
  const currentSlug = pathname.replace("/docs/", "");

  return (
    <aside className="hidden lg:block w-64 shrink-0 border-r border-border">
      <div className="sticky top-16 h-[calc(100vh-4rem)]">
        <SidebarContent sections={sections} currentSlug={currentSlug} />
      </div>
    </aside>
  );
}

export function DocsMobileSidebar({ sections }: DocsSidebarProps) {
  const pathname = usePathname();
  const currentSlug = pathname.replace("/docs/", "");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <div className="h-full pt-6">
          <div className="px-6 pb-4 border-b border-border">
            <Link
              href="/"
              className="text-xl font-bold text-foreground"
              onClick={() => setOpen(false)}
            >
              Nucleate
            </Link>
            <p className="text-sm text-muted-foreground mt-1">Documentation</p>
          </div>
          <SidebarContent
            sections={sections}
            currentSlug={currentSlug}
            onLinkClick={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
