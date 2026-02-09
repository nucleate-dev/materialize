/**
 * User Skills Service
 *
 * Loads user-defined skills from Supabase and writes them to the filesystem
 * so the Claude Agent SDK can discover them via settingSources: ["user"].
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

type TeamSkill = Database["public"]["Tables"]["team_skills"]["Row"];
type ConfigOverride =
  Database["public"]["Tables"]["prototype_ai_config_overrides"]["Row"];

// Directory where skills will be written for SDK discovery
// This should be within the user config path that the SDK reads from
const USER_SKILLS_DIR = "/tmp/.config/claude-code/skills";

export interface LoadedSkill {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isEnabled: boolean;
}

export class UserSkillsService {
  constructor(
    private readonly supabaseClient: SupabaseClient<Database>,
    private readonly logger: SystemLogger,
  ) {}

  /**
   * Load all enabled skills for a team, applying project-level overrides.
   */
  async loadSkills(
    teamId: string,
    prototypeId?: string,
  ): Promise<LoadedSkill[]> {
    // 1. Fetch team skills
    const { data: teamSkills, error: skillsError } = await this.supabaseClient
      .from("team_skills")
      .select("*")
      .eq("team_id", teamId);

    if (skillsError) {
      this.logger.error(skillsError, "Failed to load team skills", { teamId });
      return [];
    }

    if (!teamSkills || teamSkills.length === 0) {
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
          .eq("config_type", "skill");

      if (overridesError) {
        this.logger.warn("Failed to load skill overrides", {
          prototypeId,
          error: overridesError.message,
        });
      } else if (overrideRows) {
        for (const override of overrideRows) {
          overrides.set(override.config_id, override.is_enabled);
        }
      }
    }

    // 3. Build the final list of skills with overrides applied
    const skills: LoadedSkill[] = teamSkills.map((skill) => {
      // Check if there's a project-level override
      const hasOverride = overrides.has(skill.id);
      const isEnabled = hasOverride
        ? overrides.get(skill.id)!
        : skill.is_enabled;

      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.skill_content,
        isEnabled,
      };
    });

    this.logger.info("Loaded user skills", {
      teamId,
      prototypeId,
      totalSkills: skills.length,
      enabledSkills: skills.filter((s) => s.isEnabled).length,
    });

    return skills;
  }

  /**
   * Write enabled skills to the filesystem for SDK discovery.
   * Returns the paths of written skill files.
   */
  async writeSkillsToFilesystem(skills: LoadedSkill[]): Promise<string[]> {
    const enabledSkills = skills.filter((s) => s.isEnabled);
    const writtenPaths: string[] = [];

    if (enabledSkills.length === 0) {
      return writtenPaths;
    }

    // Ensure the skills directory exists
    try {
      await fs.mkdir(USER_SKILLS_DIR, { recursive: true });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create skills directory",
        { dir: USER_SKILLS_DIR },
      );
      return writtenPaths;
    }

    // Write each enabled skill as a SKILL.md file
    for (const skill of enabledSkills) {
      const safeName = this.sanitizeFilename(skill.name);
      const skillDir = path.join(USER_SKILLS_DIR, safeName);
      const skillPath = path.join(skillDir, "SKILL.md");

      try {
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(skillPath, skill.content, "utf-8");
        writtenPaths.push(skillPath);
      } catch (error) {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to write skill file",
          { skillName: skill.name, skillPath },
        );
      }
    }

    this.logger.info("Wrote user skills to filesystem", {
      count: writtenPaths.length,
      dir: USER_SKILLS_DIR,
    });

    return writtenPaths;
  }

  /**
   * Convenience method to load skills and write them to filesystem in one call.
   */
  async loadAndWriteSkills(
    teamId: string,
    prototypeId?: string,
  ): Promise<LoadedSkill[]> {
    const skills = await this.loadSkills(teamId, prototypeId);
    await this.writeSkillsToFilesystem(skills);
    return skills;
  }

  /**
   * Clean up the user skills directory.
   */
  async cleanupSkillsDirectory(): Promise<void> {
    try {
      await fs.rm(USER_SKILLS_DIR, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn("Failed to cleanup skills directory", {
        dir: USER_SKILLS_DIR,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Sanitize a skill name for use as a directory name.
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  }
}
