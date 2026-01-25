import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";
import { getWorkerContext, SOURCE_REPO_DIR } from "../../../worker.js";

export interface SourceRepoPullRequestInput {
  branchName: string;
  commitMessage: string;
  prTitle: string;
  prDescription: string;
  existingPullRequestNumber?: number | null;
  prototypeChatSessionId?: string | null;
}

export interface PrepareSourceRepoBranchInput {
  branchName: string;
  baseBranch?: string | null;
  existingPullRequestNumber?: number | null;
}

function escapeForDoubleQuotes(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function escapeForSingleQuotes(value: string): string {
  // In single-quoted shell strings, only single quotes need escaping.
  // Pattern: end current quote, add escaped single quote, start new quote.
  return value.replace(/'/g, "'\\''");
}

function sanitizeSingleLine(value: string): string {
  // Collapse any newlines/carriage returns to spaces for single-line fields like PR title.
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normalizeBranchName(branchName: string): string {
  let normalized = branchName?.trim();
  normalized = normalized.replace(/\s+/g, "-").replace(/[^A-Za-z0-9/_-]/g, "-");
  if (!normalized.startsWith("nucleate-")) {
    normalized = `nucleate-${normalized}`;
  }
  return normalized;
}

async function runSourceRepoCommand(
  service: NucleateDevelopmentServerService,
  terminalSessionId: string,
  command: string,
  options?: { timeoutMs?: number; allowFailure?: boolean },
): Promise<string> {
  const { response } = await service.sandboxService.runCommandInternal({
    command: "sh",
    args: ["-c", `cd ${SOURCE_REPO_DIR} && ${command}`],
    timeout_ms: options?.timeoutMs ?? 60000,
    strip_ansi: true,
    session_id: terminalSessionId,
  });

  if (response.error || response.data?.status !== "success") {
    if (options?.allowFailure) {
      return response.data?.stdout ?? "";
    }
    const errorMessage = response.error?.message ||
      response.data?.stdout ||
      "Source repository command failed";
    throw new Error(errorMessage);
  }

  return response.data?.stdout ?? "";
}

export async function createSourceRepoPullRequest(
  service: NucleateDevelopmentServerService,
  input: SourceRepoPullRequestInput,
  logger: SystemLogger,
): Promise<{ branchName: string; pullRequestUrl: string }> {
  const sourceRepo = service.sourceRepository;
  if (!sourceRepo) {
    throw new Error("No source repository is configured for this sandbox.");
  }

  const workerContext = getWorkerContext();
  const { prototypeId } = workerContext;
  if (!prototypeId) {
    throw new Error(
      "Missing worker context for source repository PR creation (need prototype ID).",
    );
  }

  const installationToken =
    service.githubInstallationToken?.installationToken ?? null;
  if (!installationToken) {
    throw new Error(
      "Source repository installation token is not available.",
    );
  }

  const requestedBranchName = normalizeBranchName(input.branchName);
  let branchName = requestedBranchName;
  let pullRequestUrl: string | null = null;
  let pullRequestNumber = input.existingPullRequestNumber ?? null;
  let baseBranch = sourceRepo.defaultBranch;
  const remoteUrl =
    `https://x-access-token:${installationToken}@github.com/${sourceRepo.fullName}.git`;

  const terminalSession = service.terminalService.getOrCreateTerminalSession(
    "source-repo-pr",
    "generic",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  await runSourceRepoCommand(
    service,
    terminalSession.id,
    `cd ${SOURCE_REPO_DIR} && git remote add origin ${remoteUrl}`,
  );

  if (pullRequestNumber !== null) {
    const prMetadataRaw = await runSourceRepoCommand(
      service,
      terminalSession.id,
      `GH_TOKEN=${installationToken} gh pr view ${pullRequestNumber} --json headRefName,url,baseRefName`,
    );
    // Strip any ANSI escape codes and spinner output before the JSON
    const jsonMatch = prMetadataRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `Failed to parse metadata for PR #${pullRequestNumber}. Raw output: ${
          prMetadataRaw.slice(0, 200)
        }`,
      );
    }
    let prMetadata: {
      headRefName?: string;
      url?: string;
      baseRefName?: string;
    };
    try {
      prMetadata = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(
        `Failed to parse existing PR metadata. Raw output: ${
          prMetadataRaw.slice(0, 200)
        }`,
      );
    }
    if (!prMetadata.headRefName) {
      throw new Error(
        `Unable to determine branch name for PR #${pullRequestNumber}.`,
      );
    }
    branchName = prMetadata.headRefName;
    pullRequestUrl = prMetadata.url ?? null;
    baseBranch = prMetadata.baseRefName ?? baseBranch;
  }

  try {
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      `git config user.email "bot@nucleate.dev"`,
    );
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      `git config user.name "Nucleate"`,
    );
    const currentBranch = (await service.sandboxService.runCommandInternal({
      command: "git ",
      args: [`rev-parse --abbrev-ref HEAD`],
      timeout_ms: 60000,
      strip_ansi: true,
      session_id: terminalSession.id,
      cwd: SOURCE_REPO_DIR,
    })).response.data?.stdout.trim();
    if (!currentBranch?.includes(branchName)) {
      logger.consoleLogDevOnly(
        "info",
        `current branch !== branchName`,
        { currentBranch, branchName },
      );
      throw new Error(
        `Source repository is currently on branch "${currentBranch}", but PR operations expect "${branchName}". Run the PrepareSourceRepoBranch tool (mcp__devtools__PrepareSourceRepoBranch) to switch branches before creating or updating a PR.`,
      );
    }
    await runSourceRepoCommand(service, terminalSession.id, "git add -A");

    try {
      // Use printf piped to git commit -F - to safely handle multiline commit messages.
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `printf '%s' '${
          escapeForSingleQuotes(input.commitMessage)
        }' | git commit -F -`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      if (errorMessage.toLowerCase().includes("nothing to commit")) {
        throw new Error(
          "No source repository changes detected to commit. Make edits before creating a PR.",
        );
      }
      throw error instanceof Error ? error : new Error(errorMessage);
    }

    await runSourceRepoCommand(
      service,
      terminalSession.id,
      `git push -u origin ${branchName}`,
    );

    // Sanitize PR title to single line; use printf piped to --body-file - for multiline body.
    const sanitizedTitle = sanitizeSingleLine(input.prTitle);

    if (pullRequestNumber !== null) {
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `printf '%s' '${
          escapeForSingleQuotes(input.prDescription)
        }' | GH_TOKEN=${installationToken} gh pr edit ${pullRequestNumber} --title "${
          escapeForDoubleQuotes(sanitizedTitle)
        }" --body-file -`,
        { timeoutMs: 120000 },
      );
      if (!pullRequestUrl) {
        const prUrlRaw = await runSourceRepoCommand(
          service,
          terminalSession.id,
          `GH_TOKEN=${installationToken} gh pr view ${pullRequestNumber} --json url`,
        );
        // Strip any ANSI escape codes and spinner output before the JSON
        const jsonMatch = prUrlRaw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error(
            `Failed to parse metadata for PR #${pullRequestNumber}. Raw output: ${
              prUrlRaw.slice(0, 200)
            }`,
          );
        }
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          pullRequestUrl = parsed?.url ?? null;
        } catch {
          // Fall back to best-effort match
          const match = prUrlRaw.match(/https:\/\/github\.com\/\S+/);
          pullRequestUrl = match ? match[0] : null;
        }
      }
    } else {
      const prStdout = await runSourceRepoCommand(
        service,
        terminalSession.id,
        `printf '%s' '${
          escapeForSingleQuotes(input.prDescription)
        }' | GH_TOKEN=${installationToken} gh pr create --title "${
          escapeForDoubleQuotes(sanitizedTitle)
        }" --body-file - --head ${branchName} --base ${baseBranch}`,
        { timeoutMs: 120000 },
      );

      const prUrlMatch = prStdout.match(
        /https:\/\/github\.com\/\S+\/pull\/(\d+)/,
      );
      if (!prUrlMatch) {
        throw new Error(
          `Failed to parse pull request URL from gh output: ${
            prStdout.slice(0, 200)
          }`,
        );
      }
      pullRequestUrl = prUrlMatch[0];
      pullRequestNumber = Number(prUrlMatch[1]);
    }

    if (!pullRequestNumber || !pullRequestUrl) {
      throw new Error(
        "Successfully pushed or updated PR, but failed to determine PR metadata.",
      );
    }
    const headSha = (
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        "git rev-parse HEAD",
      )
    ).trim();

    const supabaseClient = service.supabaseClientService.getClient();
    if (input.existingPullRequestNumber) {
      const { data, error } = await supabaseClient
        .from("prototype_source_repo_pull_requests")
        .update({
          prototype_chat_session_id: input.prototypeChatSessionId ?? null,
          branch_name: branchName,
          base_branch: baseBranch,
          pr_title: input.prTitle,
          pr_body: input.prDescription,
          github_repo_id: sourceRepo.githubRepoId,
          github_pull_request_url: pullRequestUrl,
          head_sha: headSha,
          status: "open",
        })
        .eq("prototype_id", prototypeId)
        .eq("github_pull_request_number", pullRequestNumber)
        .select()
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }
      if (!data) {
        const insertResult = await supabaseClient
          .from("prototype_source_repo_pull_requests")
          .insert({
            prototype_id: prototypeId,
            prototype_chat_session_id: input.prototypeChatSessionId ?? null,
            branch_name: branchName,
            base_branch: baseBranch,
            pr_title: input.prTitle,
            pr_body: input.prDescription,
            github_repo_id: sourceRepo.githubRepoId,
            github_pull_request_number: pullRequestNumber,
            github_pull_request_url: pullRequestUrl,
            head_sha: headSha,
            status: "open",
          })
          .select()
          .single();
        if (insertResult.error || !insertResult.data) {
          throw insertResult.error ??
            new Error("Failed to persist source repository PR metadata.");
        }
      }
    } else {
      const { data, error } = await supabaseClient
        .from("prototype_source_repo_pull_requests")
        .insert({
          prototype_id: prototypeId,
          prototype_chat_session_id: input.prototypeChatSessionId ?? null,
          branch_name: branchName,
          base_branch: baseBranch,
          pr_title: input.prTitle,
          pr_body: input.prDescription,
          github_repo_id: sourceRepo.githubRepoId,
          github_pull_request_number: pullRequestNumber,
          github_pull_request_url: pullRequestUrl,
          head_sha: headSha,
          status: "open",
        })
        .select()
        .single();

      if (error || !data) {
        throw error ??
          new Error("Failed to persist source repository PR metadata.");
      }
    }

    logger.consoleLogDevOnly(
      "info",
      input.existingPullRequestNumber
        ? "Updated source repository PR"
        : "Created source repository PR",
      {
        prototypeId,
        branchName,
        pullRequestUrl,
      },
    );

    return { branchName, pullRequestUrl };
  } finally {
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      "git remote remove origin",
    );
    service.terminalService.closeSession(terminalSession.id);
  }
}

export async function prepareSourceRepoBranch(
  service: NucleateDevelopmentServerService,
  input: PrepareSourceRepoBranchInput,
  logger: SystemLogger,
): Promise<
  { branchName: string; baseBranch: string; pullRequestNumber?: number | null }
> {
  const sourceRepo = service.sourceRepository;
  if (!sourceRepo) {
    throw new Error("No source repository is configured for this sandbox.");
  }

  const workerContext = getWorkerContext();
  const { prototypeId } = workerContext;
  if (!prototypeId) {
    throw new Error(
      "Missing worker context for source repository branch preparation (need prototype ID).",
    );
  }

  const installationToken =
    service.githubInstallationToken?.installationToken ?? null;
  if (!installationToken) {
    throw new Error(
      "Source repository installation token is not available.",
    );
  }

  const remoteUrl =
    `https://x-access-token:${installationToken}@github.com/${sourceRepo.fullName}.git`;

  const terminalSession = service.terminalService.getOrCreateTerminalSession(
    "source-repo-pr-prepare",
    "generic",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  await runSourceRepoCommand(
    service,
    terminalSession.id,
    `cd ${SOURCE_REPO_DIR} && git remote add origin ${remoteUrl}`,
  );

  let branchName = normalizeBranchName(input.branchName);
  let baseBranch = input.baseBranch?.trim() || sourceRepo.defaultBranch;
  const pullRequestNumber = input.existingPullRequestNumber ?? null;

  if (pullRequestNumber !== null) {
    const prMetadataRaw = await runSourceRepoCommand(
      service,
      terminalSession.id,
      `GH_TOKEN=${installationToken} gh pr view ${pullRequestNumber} --json headRefName,baseRefName`,
    );

    // Strip any ANSI escape codes and spinner output before the JSON
    const jsonMatch = prMetadataRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `Failed to parse metadata for PR #${pullRequestNumber}. Raw output: ${
          prMetadataRaw.slice(0, 200)
        }`,
      );
    }

    let prMetadata: {
      headRefName?: string;
      baseRefName?: string;
    };
    try {
      prMetadata = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(
        `Failed to parse metadata for PR #${pullRequestNumber}. Raw output: ${
          prMetadataRaw.slice(0, 200)
        }`,
      );
    }
    if (!prMetadata.headRefName) {
      throw new Error(
        `Unable to determine branch for PR #${pullRequestNumber}.`,
      );
    }
    branchName = prMetadata.headRefName;
    baseBranch = prMetadata.baseRefName ?? baseBranch;
  }

  try {
    if (pullRequestNumber !== null) {
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `git fetch origin ${branchName}`,
      );
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `git checkout -B ${branchName} origin/${branchName}`,
      );
    } else {
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `git fetch origin ${baseBranch}`,
      );
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        `git checkout -B ${branchName} origin/${baseBranch}`,
      );
    }

    logger.consoleLogDevOnly(
      "info",
      pullRequestNumber !== null
        ? "Checked out existing PR branch in source repository"
        : "Prepared new branch for source repository changes",
      {
        prototypeId,
        branchName,
        baseBranch,
        pullRequestNumber,
      },
    );

    return { branchName, baseBranch, pullRequestNumber };
  } finally {
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      "git remote remove origin",
      { allowFailure: true },
    );
    service.terminalService.closeSession(terminalSession.id);
  }
}
