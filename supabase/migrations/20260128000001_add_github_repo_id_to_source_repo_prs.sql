-- Add github_repo_id column to prototype_source_repo_pull_requests for stable webhook matching
-- This allows matching PRs by repo ID + PR number instead of URL (which changes on repo rename)

begin;

alter table public.prototype_source_repo_pull_requests
  add column if not exists github_repo_id bigint null;

-- Create index for efficient webhook lookups by repo ID + PR number
create index if not exists prototype_source_repo_pull_requests_repo_pr_idx
  on public.prototype_source_repo_pull_requests(github_repo_id, github_pull_request_number)
  where github_repo_id is not null;

commit;
