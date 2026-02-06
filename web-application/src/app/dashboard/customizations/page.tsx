"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveTeam } from "@/contexts/TeamContext";
import { Sparkles, Bot, Plug } from "lucide-react";
import { SkillsSection } from "./SkillsSection";
import { SubagentsSection } from "./SubagentsSection";
import { McpServersSection } from "./McpServersSection";

type CustomizationTab = "skills" | "subagents" | "mcp-servers";

export default function CustomizationsPage() {
  const { activeTeam } = useActiveTeam();
  const [activeTab, setActiveTab] = useState<CustomizationTab>("skills");

  const teamId = activeTeam?.id ?? null;

  return (
    <div className="relative min-h-screen text-foreground font-sans">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header */}
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
            Customizations
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Define custom skills, AI subagents, and connect external MCP servers
            to extend your AI capabilities.
          </p>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as CustomizationTab)}
          className="w-full"
        >
          <TabsList className="mb-8 bg-accent/50 p-1 rounded-lg">
            <TabsTrigger
              value="skills"
              className="gap-2 data-[state=active]:bg-background"
            >
              <Sparkles className="w-4 h-4" />
              Skills
            </TabsTrigger>
            <TabsTrigger
              value="subagents"
              className="gap-2 data-[state=active]:bg-background"
            >
              <Bot className="w-4 h-4" />
              Subagents
            </TabsTrigger>
            <TabsTrigger
              value="mcp-servers"
              className="gap-2 data-[state=active]:bg-background"
            >
              <Plug className="w-4 h-4" />
              MCP Servers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="skills" className="mt-0">
            <SkillsSection teamId={teamId} />
          </TabsContent>

          <TabsContent value="subagents" className="mt-0">
            <SubagentsSection teamId={teamId} />
          </TabsContent>

          <TabsContent value="mcp-servers" className="mt-0">
            <McpServersSection teamId={teamId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
