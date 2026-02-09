/**
 * User Subagents Service
 *
 * Loads user-defined subagents from Supabase and returns them in a format
 * compatible with the Claude Agent SDK's agents option.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

type TeamSubagent = Database["public"]["Tables"]["team_subagents"]["Row"];

/**
 * Agent configuration format expected by the Claude Agent SDK.
 */
export interface AgentConfig {
  description: string;
  prompt: string;
  tools: string[];
}

export interface LoadedSubagent {
  id: string;
  agentName: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  isEnabled: boolean;
}

export class UserSubagentsService {
  constructor(
    private readonly supabaseClient: SupabaseClient<Database>,
    private readonly logger: SystemLogger,
  ) {}

  /**
   * Load all enabled subagents for a team, applying project-level overrides.
   */
  async loadSubagents(
    teamId: string,
    prototypeId?: string,
  ): Promise<LoadedSubagent[]> {
    // 1. Fetch team subagents
    const { data: teamSubagents, error: subagentsError } =
      await this.supabaseClient
        .from("team_subagents")
        .select("*")
        .eq("team_id", teamId);

    if (subagentsError) {
      this.logger.error(subagentsError, "Failed to load team subagents", {
        teamId,
      });
      return [];
    }

    if (!teamSubagents || teamSubagents.length === 0) {
      return [];
    }

    // 2. Fetch project-level overrides if prototypeId is provided
    let overrides: Map<string, boolean> = new Map();
    if (prototypeId) {
      const { data: overrideRows, error: overridesError } =
        await this.supabaseClient
          .from("prototype_ai_config_overrides")
          .select("*")
          .eq("prototype_id", prototypeId)
          .eq("config_type", "subagent");

      if (overridesError) {
        this.logger.warn("Failed to load subagent overrides", {
          prototypeId,
          error: overridesError.message,
        });
      } else if (overrideRows) {
        for (const override of overrideRows) {
          overrides.set(override.config_id, override.is_enabled);
        }
      }
    }

    // 3. Build the final list of subagents with overrides applied
    const subagents: LoadedSubagent[] = teamSubagents.map((agent) => {
      const hasOverride = overrides.has(agent.id);
      const isEnabled = hasOverride
        ? overrides.get(agent.id)!
        : agent.is_enabled;

      return {
        id: agent.id,
        agentName: agent.agent_name,
        description: agent.description,
        systemPrompt: agent.system_prompt,
        allowedTools: agent.allowed_tools ?? [],
        isEnabled,
      };
    });

    this.logger.info("Loaded user subagents", {
      teamId,
      prototypeId,
      totalSubagents: subagents.length,
      enabledSubagents: subagents.filter((s) => s.isEnabled).length,
    });

    return subagents;
  }

  /**
   * Convert loaded subagents to the SDK agent config format.
   * Only returns enabled subagents.
   */
  async getAgentConfigs(
    teamId: string,
    prototypeId?: string,
  ): Promise<Record<string, AgentConfig>> {
    const subagents = await this.loadSubagents(teamId, prototypeId);
    const configs: Record<string, AgentConfig> = {};

    for (const agent of subagents) {
      if (!agent.isEnabled) {
        continue;
      }

      // Use a prefixed name to avoid conflicts with built-in agents
      const agentKey = `user-${this.sanitizeAgentName(agent.agentName)}`;

      configs[agentKey] = {
        description: agent.description,
        prompt: agent.systemPrompt,
        tools: agent.allowedTools,
      };
    }

    this.logger.info("Built agent configs", {
      teamId,
      prototypeId,
      agentCount: Object.keys(configs).length,
      agentNames: Object.keys(configs),
    });

    return configs;
  }

  /**
   * Sanitize an agent name for use as a config key.
   */
  private sanitizeAgentName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  }
}
