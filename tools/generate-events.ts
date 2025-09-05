#!/usr/bin/env bun

export interface PullRequestEvent {
  event_name: 'pull_request';
  action: 'opened' | 'synchronize' | 'reopened';
  pull_request: {
    number: number;
    draft: boolean;
    changed_files: number;
    base: { ref: string };
    head: { ref: string };
    user: { login: string };
  };
  repository: {
    owner: { login: string };
    name: string;
  };
}

export interface MergeGroupEvent {
  event_name: 'merge_group';
  merge_group: {
    head_sha: string;
    base_ref: string;
  };
  repository: {
    owner: { login: string };
    name: string;
  };
}

export class EventGenerator {
  generatePullRequest(options: {
    number?: number;
    draft?: boolean;
    changedFiles?: number;
    base?: string;
    head?: string;
    user?: string;
    owner?: string;
    repo?: string;
  } = {}): PullRequestEvent {
    return {
      event_name: 'pull_request',
      action: 'synchronize',
      pull_request: {
        number: options.number ?? 123,
        draft: options.draft ?? false,
        changed_files: options.changedFiles ?? 10,
        base: { ref: options.base ?? 'main' },
        head: { ref: options.head ?? 'feature/test' },
        user: { login: options.user ?? 'developer' },
      },
      repository: {
        owner: { login: options.owner ?? 'outfitter-dev' },
        name: options.repo ?? 'test-repo',
      },
    };
  }

  generateMergeGroup(options: {
    sha?: string;
    base?: string;
    owner?: string;
    repo?: string;
  } = {}): MergeGroupEvent {
    return {
      event_name: 'merge_group',
      merge_group: {
        head_sha: options.sha ?? 'abc123def456',
        base_ref: options.base ?? 'refs/heads/main',
      },
      repository: {
        owner: { login: options.owner ?? 'outfitter-dev' },
        name: options.repo ?? 'test-repo',
      },
    };
  }

  generateStackedPRs(): PullRequestEvent[] {
    return [
      this.generatePullRequest({
        number: 1,
        base: 'main',
        head: 'feat/base',
        changedFiles: 5,
      }),
      this.generatePullRequest({
        number: 2,
        base: 'feat/base',
        head: 'feat/middle',
        changedFiles: 15,
      }),
      this.generatePullRequest({
        number: 3,
        base: 'feat/middle',
        head: 'feat/top',
        changedFiles: 3,
      }),
    ];
  }

  generateScenarios(): Record<string, any> {
    return {
      'minimal-risk': this.generatePullRequest({
        draft: true,
        changedFiles: 2,
      }),
      'essential-risk': this.generatePullRequest({
        changedFiles: 25,
      }),
      'full-risk': this.generatePullRequest({
        changedFiles: 100,
        base: 'release/v2',
      }),
      'agent-pr': this.generatePullRequest({
        user: 'dependabot[bot]',
        changedFiles: 1,
      }),
      'merge-queue': this.generateMergeGroup(),
      'stacked-bottom': this.generateStackedPRs()[0],
      'stacked-middle': this.generateStackedPRs()[1],
      'stacked-top': this.generateStackedPRs()[2],
    };
  }
}

// CLI interface
if (import.meta.main) {
  const scenario = process.argv[2] || 'list';
  const generator = new EventGenerator();

  if (scenario === 'list') {
    console.log('Available scenarios:');
    Object.keys(generator.generateScenarios()).forEach(name => {
      console.log(`  - ${name}`);
    });
    console.log('\nUsage: generate-events.ts <scenario>');
  } else {
    const scenarios = generator.generateScenarios();
    const event = scenarios[scenario];
    
    if (event) {
      console.log(JSON.stringify(event, null, 2));
    } else {
      console.error(`Unknown scenario: ${scenario}`);
      console.error('Run without arguments to see available scenarios');
      process.exit(1);
    }
  }
}