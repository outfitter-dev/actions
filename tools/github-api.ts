#!/usr/bin/env bun

export interface GitHubContext {
  owner: string;
  repo: string;
  token?: string;
}

export class GitHubAPI {
  private baseUrl = 'https://api.github.com';
  private context: GitHubContext;
  private retryDelays = [1000, 2000, 4000]; // Exponential backoff

  constructor(context: GitHubContext) {
    this.context = context;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries = 3
  ): Promise<Response> {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '@outfitter/actions',
      ...options.headers,
    };

    if (this.context.token) {
      headers['Authorization'] = `token ${this.context.token}`;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });
        
        // Check rate limits
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');
        
        if (remaining === '0' && reset) {
          const resetTime = parseInt(reset, 10) * 1000;
          const waitTime = resetTime - Date.now();
          if (waitTime > 0) {
            console.error(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        if (response.ok || attempt === retries) {
          return response;
        }

        // Retry on 5xx errors
        if (response.status >= 500) {
          const delay = this.retryDelays[attempt] || 8000;
          console.error(`Server error (${response.status}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === retries) throw error;
        
        const delay = this.retryDelays[attempt] || 8000;
        console.error(`Network error. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async getPullRequest(number: number): Promise<any> {
    const url = `${this.baseUrl}/repos/${this.context.owner}/${this.context.repo}/pulls/${number}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  async listPullRequests(params: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: 'asc' | 'desc';
  } = {}): Promise<any[]> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.append(key, value);
    });

    const url = `${this.baseUrl}/repos/${this.context.owner}/${this.context.repo}/pulls?${searchParams}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  async getStackPosition(prNumber: number): Promise<'top' | 'middle' | 'bottom' | 'unknown'> {
    try {
      const pr = await this.getPullRequest(prNumber);
      const baseBranch = pr.base.ref;
      const headBranch = pr.head.ref;

      // Check if base is default branch
      const repoInfo = await this.getRepository();
      const defaultBranch = repoInfo.default_branch;

      if (baseBranch === defaultBranch) {
        // Check if other PRs target this PR's branch
        const childPRs = await this.listPullRequests({
          state: 'open',
          base: headBranch,
        });

        if (childPRs.length === 0) {
          return 'top'; // No children, at the top
        }
        return 'bottom'; // Has children, at the bottom
      }

      // Middle of stack (has a non-default base)
      const childPRs = await this.listPullRequests({
        state: 'open',
        base: headBranch,
      });

      return childPRs.length === 0 ? 'top' : 'middle';
    } catch (error) {
      console.error('Failed to determine stack position:', error);
      return 'unknown';
    }
  }

  async getRepository(): Promise<any> {
    const url = `${this.baseUrl}/repos/${this.context.owner}/${this.context.repo}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  async getCommit(sha: string): Promise<any> {
    const url = `${this.baseUrl}/repos/${this.context.owner}/${this.context.repo}/commits/${sha}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  async getWorkflowRuns(params: {
    actor?: string;
    branch?: string;
    event?: string;
    status?: 'queued' | 'in_progress' | 'completed';
    per_page?: number;
  } = {}): Promise<any> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.append(key, value.toString());
    });

    const url = `${this.baseUrl}/repos/${this.context.owner}/${this.context.repo}/actions/runs?${searchParams}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  async getAuthorReliability(author: string): Promise<number> {
    try {
      // Get recent PRs by author
      const recentPRs = await this.listPullRequests({
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
      });

      const authorPRs = recentPRs.filter(pr => pr.user.login === author).slice(0, 10);
      
      if (authorPRs.length === 0) return 0.5; // Unknown author

      // Calculate success rate
      const merged = authorPRs.filter(pr => pr.merged_at).length;
      const reliability = merged / authorPRs.length;

      return reliability;
    } catch {
      return 0.5; // Default to neutral
    }
  }
}

// CLI interface
if (import.meta.main) {
  const command = process.argv[2];
  const context: GitHubContext = {
    owner: process.env.GITHUB_REPOSITORY_OWNER || '',
    repo: process.env.GITHUB_REPOSITORY?.split('/')[1] || '',
    token: process.env.GITHUB_TOKEN,
  };

  const api = new GitHubAPI(context);

  switch (command) {
    case 'stack-position': {
      const prNumber = parseInt(process.argv[3], 10);
      if (!prNumber) {
        console.error('Usage: github-api.ts stack-position <pr-number>');
        process.exit(1);
      }
      const position = await api.getStackPosition(prNumber);
      console.log(position);
      break;
    }

    case 'author-reliability': {
      const author = process.argv[3];
      if (!author) {
        console.error('Usage: github-api.ts author-reliability <author>');
        process.exit(1);
      }
      const reliability = await api.getAuthorReliability(author);
      console.log(reliability.toFixed(2));
      break;
    }

    default:
      console.error('Unknown command:', command);
      console.error('Available commands: stack-position, author-reliability');
      process.exit(1);
  }
}