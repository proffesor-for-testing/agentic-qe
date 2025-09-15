/**
 * GitHub API Integration Utilities
 * Provides comprehensive GitHub API integration for agentic-qe framework
 */

import { Octokit } from '@octokit/rest';
// import { createAppAuth } from '@octokit/auth-app';
import { createTokenAuth } from '@octokit/auth-token';
// import { retry } from '@octokit/plugin-retry';
// import { throttling } from '@octokit/plugin-throttling';

// Enhanced Octokit with plugins
const MyOctokit = Octokit; // .plugin(retry, throttling);

export interface GitHubConfig {
  auth: {
    type: 'token' | 'app';
    token?: string;
    appId?: number;
    privateKey?: string;
    installationId?: number;
  };
  baseUrl?: string;
  userAgent?: string;
  previews?: string[];
}

export interface Repository {
  owner: string;
  repo: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  body?: string;
  head: string;
  base: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  mergeable?: boolean;
  mergeable_state?: string;
  user: {
    login: string;
    id: number;
  };
  assignees: Array<{
    login: string;
    id: number;
  }>;
  reviewers: Array<{
    login: string;
    id: number;
  }>;
  labels: Array<{
    name: string;
    color: string;
    description?: string;
  }>;
  checks?: CheckRun[];
  reviews?: ReviewInfo[];
}

export interface IssueInfo {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    id: number;
  };
  assignees: Array<{
    login: string;
    id: number;
  }>;
  labels: Array<{
    name: string;
    color: string;
    description?: string;
  }>;
  milestone?: {
    title: string;
    number: number;
    state: 'open' | 'closed';
  };
  created_at: string;
  updated_at: string;
}

export interface CheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  output?: {
    title?: string;
    summary?: string;
    text?: string;
  };
}

export interface ReviewInfo {
  id: number;
  user: {
    login: string;
    id: number;
  };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  body?: string;
  submitted_at: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  workflow_id: number;
  head_branch: string;
  head_sha: string;
  event: string;
  created_at: string;
  updated_at: string;
}

export class GitHubApiClient {
  private octokit: InstanceType<typeof MyOctokit>;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;

    const authConfig = config.auth.type === 'app'
      ? {
          type: 'app',
          appId: config.auth.appId!,
          privateKey: config.auth.privateKey!,
          installationId: config.auth.installationId!,
        }
      : config.auth.token!;

    this.octokit = new MyOctokit({
      auth: authConfig,
      baseUrl: config.baseUrl || 'https://api.github.com',
      userAgent: config.userAgent || 'agentic-qe-framework',
      previews: config.previews || [],
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
          console.warn(`Retrying after ${retryAfter} seconds!`);
          return true;
        },
        onSecondaryRateLimit: (retryAfter: number, options: any) => {
          console.warn(`Secondary rate limit triggered for request ${options.method} ${options.url}`);
          console.warn(`Retrying after ${retryAfter} seconds!`);
          return true;
        },
      },
    });
  }

  // Repository Management
  async getRepository(repo: Repository) {
    const { data } = await this.octokit.repos.get({
      owner: repo.owner,
      repo: repo.repo,
    });
    return data;
  }

  async listRepositories(org?: string, type: 'all' | 'owner' | 'public' | 'private' | 'member' = 'all') {
    if (org) {
      const { data } = await this.octokit.repos.listForOrg({
        org,
        type: type as any,
        per_page: 100,
      });
      return data;
    } else {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        type: type as any,
        per_page: 100,
      });
      return data;
    }
  }

  // Pull Request Management
  async getPullRequest(repo: Repository, pullNumber: number): Promise<PullRequestInfo> {
    const { data: pr } = await this.octokit.pulls.get({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
    });

    const { data: reviews } = await this.octokit.pulls.listReviews({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
    });

    const { data: checks } = await this.octokit.checks.listForRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: pr.head.sha,
    });

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || undefined,
      head: pr.head.ref,
      base: pr.base.ref,
      state: pr.state as 'open' | 'closed' | 'merged',
      draft: pr.draft || false,
      mergeable: pr.mergeable || undefined,
      mergeable_state: pr.mergeable_state || undefined,
      user: {
        login: pr.user.login,
        id: pr.user.id,
      },
      assignees: (pr.assignees || []).map((assignee: any) => ({
        login: assignee.login,
        id: assignee.id,
      })),
      reviewers: (pr.requested_reviewers || []).map((reviewer: any) => ({
        login: reviewer.login,
        id: reviewer.id,
      })),
      labels: pr.labels.map((label: any) => ({
        name: label.name,
        color: label.color,
        description: label.description || undefined,
      })),
      checks: checks.check_runs.map((check: any) => ({
        id: check.id,
        name: check.name,
        status: check.status as 'queued' | 'in_progress' | 'completed',
        conclusion: check.conclusion as any,
        output: check.output ? {
          title: check.output.title || undefined,
          summary: check.output.summary || undefined,
          text: check.output.text || undefined,
        } : undefined,
      })),
      reviews: reviews.map((review: any) => ({
        id: review.id,
        user: {
          login: review.user?.login || 'unknown',
          id: review.user?.id || 0,
        },
        state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
        body: review.body || undefined,
        submitted_at: review.submitted_at || new Date().toISOString(),
      })),
    };
  }

  async listPullRequests(repo: Repository, state: 'open' | 'closed' | 'all' = 'open') {
    const { data } = await this.octokit.pulls.list({
      owner: repo.owner,
      repo: repo.repo,
      state,
      per_page: 100,
    });
    return data;
  }

  async createPullRequest(repo: Repository, options: {
    title: string;
    body?: string;
    head: string;
    base: string;
    draft?: boolean;
  }) {
    const { data } = await this.octokit.pulls.create({
      owner: repo.owner,
      repo: repo.repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft || false,
    });
    return data;
  }

  async updatePullRequest(repo: Repository, pullNumber: number, options: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
  }) {
    const { data } = await this.octokit.pulls.update({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
      ...options,
    });
    return data;
  }

  async mergePullRequest(repo: Repository, pullNumber: number, options: {
    commit_title?: string;
    commit_message?: string;
    merge_method?: 'merge' | 'squash' | 'rebase';
  } = {}) {
    const { data } = await this.octokit.pulls.merge({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
      ...options,
    });
    return data;
  }

  async requestReviewers(repo: Repository, pullNumber: number, reviewers: string[], teamReviewers?: string[]) {
    const { data } = await this.octokit.pulls.requestReviewers({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
      reviewers,
      team_reviewers: teamReviewers,
    });
    return data;
  }

  async createReview(repo: Repository, pullNumber: number, options: {
    body?: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: Array<{
      path: string;
      line: number;
      body: string;
    }>;
  }) {
    const { data } = await this.octokit.pulls.createReview({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
      body: options.body,
      event: options.event,
      comments: options.comments,
    });
    return data;
  }

  // Issue Management
  async getIssue(repo: Repository, issueNumber: number): Promise<IssueInfo> {
    const { data } = await this.octokit.issues.get({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body || undefined,
      state: data.state as 'open' | 'closed',
      user: {
        login: data.user?.login || 'unknown',
        id: data.user?.id || 0,
      },
      assignees: (data.assignees || []).map((assignee: any) => ({
        login: assignee.login,
        id: assignee.id,
      })),
      labels: data.labels.map((label: any) => ({
        name: typeof label === 'string' ? label : (label.name || ''),
        color: typeof label === 'string' ? '#000000' : (label.color || '#000000'),
        description: typeof label === 'string' ? undefined : (label.description || undefined),
      })),
      milestone: data.milestone ? {
        title: data.milestone.title,
        number: data.milestone.number,
        state: data.milestone.state as 'open' | 'closed',
      } : undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async listIssues(repo: Repository, options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    milestone?: string;
  } = {}) {
    const { data } = await this.octokit.issues.listForRepo({
      owner: repo.owner,
      repo: repo.repo,
      state: options.state || 'open',
      labels: options.labels?.join(','),
      assignee: options.assignee,
      milestone: options.milestone,
      per_page: 100,
    });
    return data;
  }

  async createIssue(repo: Repository, options: {
    title: string;
    body?: string;
    assignees?: string[];
    labels?: string[];
    milestone?: number;
  }) {
    const { data } = await this.octokit.issues.create({
      owner: repo.owner,
      repo: repo.repo,
      title: options.title,
      body: options.body,
      assignees: options.assignees,
      labels: options.labels,
      milestone: options.milestone,
    });
    return data;
  }

  async updateIssue(repo: Repository, issueNumber: number, options: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    assignees?: string[];
    labels?: string[];
  }) {
    const { data } = await this.octokit.issues.update({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      ...options,
    });
    return data;
  }

  async addLabelsToIssue(repo: Repository, issueNumber: number, labels: string[]) {
    const { data } = await this.octokit.issues.addLabels({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      labels,
    });
    return data;
  }

  async assignIssue(repo: Repository, issueNumber: number, assignees: string[]) {
    const { data } = await this.octokit.issues.addAssignees({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      assignees,
    });
    return data;
  }

  // Workflow Management
  async listWorkflows(repo: Repository) {
    const { data } = await this.octokit.actions.listRepoWorkflows({
      owner: repo.owner,
      repo: repo.repo,
    });
    return data.workflows;
  }

  async getWorkflowRuns(repo: Repository, workflowId?: number): Promise<WorkflowRun[]> {
    const { data } = workflowId
      ? await this.octokit.actions.listWorkflowRuns({
          owner: repo.owner,
          repo: repo.repo,
          workflow_id: workflowId,
        })
      : await this.octokit.actions.listWorkflowRunsForRepo({
          owner: repo.owner,
          repo: repo.repo,
        });

    return data.workflow_runs.map((run: any) => ({
      id: run.id,
      name: run.name || 'Unnamed workflow',
      status: run.status as 'queued' | 'in_progress' | 'completed',
      conclusion: run.conclusion as any,
      workflow_id: run.workflow_id,
      head_branch: run.head_branch || '',
      head_sha: run.head_sha,
      event: run.event,
      created_at: run.created_at,
      updated_at: run.updated_at,
    }));
  }

  async triggerWorkflow(repo: Repository, workflowId: number, ref: string, inputs?: Record<string, any>) {
    const { data } = await this.octokit.actions.createWorkflowDispatch({
      owner: repo.owner,
      repo: repo.repo,
      workflow_id: workflowId,
      ref,
      inputs,
    });
    return data;
  }

  async cancelWorkflowRun(repo: Repository, runId: number) {
    const { data } = await this.octokit.actions.cancelWorkflowRun({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
    });
    return data;
  }

  // Release Management
  async listReleases(repo: Repository) {
    const { data } = await this.octokit.repos.listReleases({
      owner: repo.owner,
      repo: repo.repo,
    });
    return data;
  }

  async createRelease(repo: Repository, options: {
    tag_name: string;
    target_commitish?: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  }) {
    const { data } = await this.octokit.repos.createRelease({
      owner: repo.owner,
      repo: repo.repo,
      tag_name: options.tag_name,
      target_commitish: options.target_commitish,
      name: options.name,
      body: options.body,
      draft: options.draft || false,
      prerelease: options.prerelease || false,
    });
    return data;
  }

  // Branch Management
  async listBranches(repo: Repository) {
    const { data } = await this.octokit.repos.listBranches({
      owner: repo.owner,
      repo: repo.repo,
    });
    return data;
  }

  async createBranch(repo: Repository, branchName: string, fromSha: string) {
    const { data } = await this.octokit.git.createRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    });
    return data;
  }

  async deleteBranch(repo: Repository, branchName: string) {
    const { data } = await this.octokit.git.deleteRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `heads/${branchName}`,
    });
    return data;
  }

  // Status and Check Management
  async createStatus(repo: Repository, sha: string, options: {
    state: 'error' | 'failure' | 'pending' | 'success';
    target_url?: string;
    description?: string;
    context?: string;
  }) {
    const { data } = await this.octokit.repos.createCommitStatus({
      owner: repo.owner,
      repo: repo.repo,
      sha,
      state: options.state,
      target_url: options.target_url,
      description: options.description,
      context: options.context,
    });
    return data;
  }

  async createCheckRun(repo: Repository, options: {
    name: string;
    head_sha: string;
    status?: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
    output?: {
      title: string;
      summary: string;
      text?: string;
    };
  }) {
    const { data } = await this.octokit.checks.create({
      owner: repo.owner,
      repo: repo.repo,
      name: options.name,
      head_sha: options.head_sha,
      status: options.status,
      conclusion: options.conclusion,
      output: options.output,
    });
    return data;
  }

  // Repository Content
  async getFileContent(repo: Repository, path: string, ref?: string) {
    const { data } = await this.octokit.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path,
      ref,
    });
    return data;
  }

  async createOrUpdateFile(repo: Repository, path: string, options: {
    message: string;
    content: string; // base64 encoded
    sha?: string; // required for updates
    branch?: string;
  }) {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: repo.owner,
      repo: repo.repo,
      path,
      message: options.message,
      content: options.content,
      sha: options.sha,
      branch: options.branch,
    });
    return data;
  }

  // Webhook Management
  async listWebhooks(repo: Repository) {
    const { data } = await this.octokit.repos.listWebhooks({
      owner: repo.owner,
      repo: repo.repo,
    });
    return data;
  }

  async createWebhook(repo: Repository, options: {
    config: {
      url: string;
      content_type?: 'json' | 'form';
      secret?: string;
      insecure_ssl?: '0' | '1';
    };
    events?: string[];
    active?: boolean;
  }) {
    const { data } = await this.octokit.repos.createWebhook({
      owner: repo.owner,
      repo: repo.repo,
      config: options.config,
      events: options.events || ['push', 'pull_request'],
      active: options.active !== false,
    });
    return data;
  }

  // Utility Methods
  async rateLimit() {
    const { data } = await this.octokit.rateLimit.get();
    return data;
  }

  async user() {
    const { data } = await this.octokit.users.getAuthenticated();
    return data;
  }
}

export default GitHubApiClient;