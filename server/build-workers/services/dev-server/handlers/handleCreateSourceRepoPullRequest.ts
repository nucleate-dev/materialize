import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";
import { getWorkerContext, SOURCE_REPO_DIR } from "../../../worker.js";

export interface SourceRepoPullRequestInput {
  branchName?: string | null;
  commitMessage: string;
  prTitle: string;
  prDescription: string;
  prototypeChatSessionId?: string | null;
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

function normalizeBranchName(branchName?: string | null): string {
  const fallback = `nucleate-${Date.now()}`;
  const trimmed = branchName?.trim();
  let normalized = trimmed && trimmed.length > 0 ? trimmed : fallback;
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

  const branchName = normalizeBranchName(input.branchName);
  const remoteUrl =
    `https://x-access-token:${installationToken}@github.com/${sourceRepo.fullName}.git`;

  const terminalSession = service.terminalService.getOrCreateTerminalSession(
    "source-repo-pr",
    "generic",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      `cd ${SOURCE_REPO_DIR} && git remote remove origin && git remote add origin ${remoteUrl}`,
    );
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
    await runSourceRepoCommand(
      service,
      terminalSession.id,
      `git checkout -B ${branchName}`,
    );
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
    const prStdout = await runSourceRepoCommand(
      service,
      terminalSession.id,
      `printf '%s' '${
        escapeForSingleQuotes(input.prDescription)
      }' | GITHUB_TOKEN=${installationToken} gh pr create --title "${
        escapeForDoubleQuotes(sanitizedTitle)
      }" --body-file - --head ${branchName} --base ${sourceRepo.defaultBranch}`,
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
    const pullRequestUrl = prUrlMatch[0];
    const pullRequestNumber = Number(prUrlMatch[1]);
    const headSha = (
      await runSourceRepoCommand(
        service,
        terminalSession.id,
        "git rev-parse HEAD",
      )
    ).trim();

    const supabaseClient = service.supabaseClientService.getClient();
    const { data: row, error } = await supabaseClient
      .from("prototype_source_repo_pull_requests")
      .insert({
        prototype_id: prototypeId,
        prototype_chat_session_id: input.prototypeChatSessionId ?? null,
        branch_name: branchName,
        base_branch: sourceRepo.defaultBranch,
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

    if (error || !row) {
      throw error ??
        new Error("Failed to persist source repository PR metadata.");
    }

    logger.consoleLogDevOnly("info", "Created source repository PR", {
      prototypeId,
      branchName,
      pullRequestUrl,
    });

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
