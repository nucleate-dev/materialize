import type { SystemLogger } from "../../../loggers/SystemLogger.js";
import { getWorkerContext } from "../../../worker.js";
import type { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";

export interface SourceRepoPullRequestSummary {
  branchName: string;
  pullRequestNumber: number;
  pullRequestUrl: string | null;
  title: string;
  body: string | null;
  updatedAt: string | null;
}

export async function listNucleateSourceRepoPullRequests(
  service: NucleateDevelopmentServerService,
  logger: SystemLogger,
): Promise<SourceRepoPullRequestSummary[]> {
  const workerContext = getWorkerContext();
  const { prototypeId } = workerContext;
  if (!prototypeId) {
    throw new Error(
      "Missing worker context for listing source repository PRs (need prototype ID).",
    );
  }

  const supabaseClient = service.supabaseClientService.getClient();
  const { data, error } = await supabaseClient
    .from("prototype_source_repo_pull_requests")
    .select(
      "branch_name,pr_title,pr_body,github_pull_request_number,github_pull_request_url,status,updated_at",
    )
    .eq("prototype_id", prototypeId)
    .eq("status", "open")
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const summaries: SourceRepoPullRequestSummary[] = rows.map((row) => ({
    branchName: row.branch_name,
    pullRequestNumber: row.github_pull_request_number,
    pullRequestUrl: row.github_pull_request_url ?? null,
    title: row.pr_title ?? "",
    body: row.pr_body ?? null,
    updatedAt: row.updated_at ?? null,
  }));

  logger.consoleLogDevOnly("info", "Listed open source repository PRs", {
    prototypeId,
    count: summaries.length,
  });

  return summaries;
}
