#!/usr/bin/env bun

/**
 * @fileoverview Migration script to help repositories adopt Belay CI.
 *
 * This module provides automated migration from existing CI configurations
 * to the Belay zero-config workflow. It analyzes existing workflows, backs
 * them up, and generates appropriate Belay configuration.
 *
 * @example
 * ```bash
 * # Run migration with defaults
 * bunx github:outfitter-dev/actions/tools/migrate-to-belay.ts
 *
 * # Run with options
 * bunx github:outfitter-dev/actions/tools/migrate-to-belay.ts --graphite --no-backup
 * ```
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Options for controlling the Belay migration process.
 *
 * @example
 * ```ts
 * const options: MigrationOptions = {
 *   backup: true,
 *   graphite: true,
 *   force: false,
 * };
 * ```
 */
interface MigrationOptions {
  /** Whether to backup existing workflows (default: true) */
  backup?: boolean;
  /** Force migration even if conflicts detected */
  force?: boolean;
  /** Enable Graphite CI Optimizer integration */
  graphite?: boolean;
  /** Preserve custom workflow steps in generated config */
  preserveCustom?: boolean;
}

/**
 * Analysis result from scanning existing CI configuration.
 *
 * Contains detailed information about the repository's current CI setup,
 * including detected workflows, complexity indicators, and custom configurations
 * that may need special handling during migration.
 *
 * @example
 * ```ts
 * const analysis: CIAnalysis = {
 *   hasCI: true,
 *   workflows: ['ci.yml', 'deploy.yml'],
 *   usesGraphite: false,
 *   usesMatrix: true,
 *   customSecrets: ['DEPLOY_KEY'],
 *   customSteps: 25,
 *   isComplex: true,
 *   language: 'bun',
 * };
 * ```
 */
interface CIAnalysis {
  /** Whether any CI configuration exists in `.github/workflows` */
  hasCI: boolean;
  /** List of workflow filenames found */
  workflows: string[];
  /** Whether Graphite CI integration is detected */
  usesGraphite: boolean;
  /** Whether matrix builds are used (increases complexity) */
  usesMatrix: boolean;
  /** List of custom secrets (excluding GITHUB_TOKEN, GRAPHITE_TOKEN) */
  customSecrets: string[];
  /** Estimated number of custom steps across all workflows */
  customSteps: number;
  /** Whether the setup is considered complex (>20 steps, matrix, or >2 secrets) */
  isComplex: boolean;
  /** Detected primary programming language */
  language: string;
}

/**
 * Migrates a repository from existing CI workflows to Belay.
 *
 * Performs the following steps:
 * 1. Analyzes existing CI configuration
 * 2. Backs up existing workflows (optional)
 * 3. Creates the Belay workflow file
 * 4. Generates `.ci.toml` for complex setups
 * 5. Provides migration guidance and next steps
 *
 * @example
 * ```ts
 * const migrator = new BelayMigrator('/path/to/repo');
 * await migrator.migrate({ backup: true, graphite: true });
 * ```
 */
class BelayMigrator {
  private repoRoot: string;
  private existingWorkflows: string[] = [];

  /**
   * Creates a new BelayMigrator instance.
   *
   * @param repoRoot - Root directory of the repository to migrate. Defaults to `process.cwd()`.
   */
  constructor(repoRoot = process.cwd()) {
    this.repoRoot = repoRoot;
  }

  /**
   * Executes the migration to Belay CI.
   *
   * This is the main entry point for migration. It orchestrates the entire
   * migration process and outputs progress to the console.
   *
   * @param options - Migration options controlling backup, Graphite integration, etc.
   * @returns Promise that resolves when migration is complete
   *
   * @example
   * ```ts
   * const migrator = new BelayMigrator();
   *
   * // Basic migration with defaults
   * await migrator.migrate();
   *
   * // Migration with Graphite and no backup
   * await migrator.migrate({
   *   backup: false,
   *   graphite: true,
   * });
   * ```
   */
  async migrate(options: MigrationOptions = {}): Promise<void> {
    console.log('🚀 Migrating to Belay CI...\n');
    
    // 1. Detect existing CI setup
    const analysis = this.analyzeExistingCI();
    this.reportAnalysis(analysis);
    
    // 2. Backup existing workflows if requested
    if (options.backup !== false) {
      this.backupExistingWorkflows();
    }
    
    // 3. Create Belay workflow
    const workflowPath = this.createBelayWorkflow(analysis, options);
    
    // 4. Create optional .ci.toml if complex setup detected
    if (analysis.isComplex) {
      this.createCIConfig(analysis);
    }
    
    // 5. Provide migration report
    this.printMigrationReport(workflowPath, analysis);
  }

  private analyzeExistingCI(): CIAnalysis {
    const workflowsDir = join(this.repoRoot, '.github/workflows');
    const hasCI = existsSync(workflowsDir);
    
    let workflows: string[] = [];
    let usesGraphite = false;
    let usesMatrix = false;
    let customSecrets: string[] = [];
    let customSteps = 0;
    
    if (hasCI) {
      const files = Bun.spawnSync(['ls', workflowsDir]).stdout.toString().trim().split('\n');
      workflows = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      
      // Analyze existing workflows
      workflows.forEach(file => {
        const content = readFileSync(join(workflowsDir, file), 'utf-8');
        if (content.includes('graphite')) usesGraphite = true;
        if (content.includes('matrix:')) usesMatrix = true;
        
        // Extract custom secrets
        const secretMatches = content.match(/\$\{\{\s*secrets\.(\w+)\s*\}\}/g) || [];
        secretMatches.forEach(match => {
          const secret = match.match(/secrets\.(\w+)/)?.[1];
          if (secret && !['GITHUB_TOKEN', 'GRAPHITE_CI_OPTIMIZER_TOKEN'].includes(secret)) {
            customSecrets.push(secret);
          }
        });
        
        // Count custom steps (rough estimate)
        customSteps += (content.match(/^\s+-\s+(run|uses):/gm) || []).length;
      });
    }
    
    return {
      hasCI,
      workflows,
      usesGraphite,
      usesMatrix,
      customSecrets: [...new Set(customSecrets)],
      customSteps,
      isComplex: customSteps > 20 || usesMatrix || customSecrets.length > 2,
      language: this.detectLanguage(),
    };
  }

  private detectLanguage(): string {
    if (existsSync(join(this.repoRoot, 'bun.lockb')) || existsSync(join(this.repoRoot, 'bun.lock'))) return 'bun';
    if (existsSync(join(this.repoRoot, 'package-lock.json'))) return 'node-npm';
    if (existsSync(join(this.repoRoot, 'yarn.lock'))) return 'node-yarn';
    if (existsSync(join(this.repoRoot, 'pnpm-lock.yaml'))) return 'node-pnpm';
    if (existsSync(join(this.repoRoot, 'Cargo.toml'))) return 'rust';
    if (existsSync(join(this.repoRoot, 'go.mod'))) return 'go';
    if (existsSync(join(this.repoRoot, 'requirements.txt'))) return 'python';
    if (existsSync(join(this.repoRoot, 'pom.xml'))) return 'java-maven';
    if (existsSync(join(this.repoRoot, 'build.gradle'))) return 'java-gradle';
    return 'unknown';
  }

  private reportAnalysis(analysis: CIAnalysis): void {
    console.log('📊 Current CI Analysis:');
    console.log(`  Language: ${analysis.language}`);
    console.log(`  Existing workflows: ${analysis.workflows.length}`);
    if (analysis.workflows.length > 0) {
      console.log(`    - ${analysis.workflows.join('\n    - ')}`);
    }
    console.log(`  Uses Graphite: ${analysis.usesGraphite ? 'Yes' : 'No'}`);
    console.log(`  Complex setup: ${analysis.isComplex ? 'Yes' : 'No'}`);
    if (analysis.customSecrets.length > 0) {
      console.log(`  Custom secrets: ${analysis.customSecrets.join(', ')}`);
    }
    console.log();
  }

  private backupExistingWorkflows(): void {
    const workflowsDir = join(this.repoRoot, '.github/workflows');
    if (!existsSync(workflowsDir)) return;
    
    const backupDir = join(this.repoRoot, '.github/workflows.backup');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    
    const files = Bun.spawnSync(['ls', workflowsDir]).stdout.toString().trim().split('\n');
    files.forEach(file => {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        const content = readFileSync(join(workflowsDir, file), 'utf-8');
        writeFileSync(join(backupDir, file), content);
        console.log(`  📁 Backed up: ${file}`);
      }
    });
    console.log();
  }

  private createBelayWorkflow(analysis: CIAnalysis, options: MigrationOptions): string {
    const workflowsDir = join(this.repoRoot, '.github/workflows');
    if (!existsSync(workflowsDir)) {
      mkdirSync(workflowsDir, { recursive: true });
    }
    
    const useGraphite = options.graphite ?? analysis.usesGraphite;
    
    let workflow = `# Belay Zero-Config CI
# Generated by migrate-to-belay.ts
# Docs: https://github.com/outfitter-dev/actions

name: CI

on:
  pull_request:
  merge_group:
${analysis.isComplex ? '  workflow_dispatch:\n' : ''}
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@v1
${useGraphite ? '    with:\n      use_graphite: true\n' : ''}    secrets: inherit
`;

    if (analysis.customSecrets.length > 0) {
      workflow += `
    # Custom secrets detected - ensure these are set in repository settings:
    # ${analysis.customSecrets.map(s => `- ${s}`).join('\n    # ')}
`;
    }

    const targetPath = join(workflowsDir, 'belay.yml');
    writeFileSync(targetPath, workflow);
    console.log(`✅ Created: .github/workflows/belay.yml\n`);
    
    return targetPath;
  }

  private createCIConfig(analysis: CIAnalysis): void {
    const lines: string[] = [];
    lines.push(`# Belay CI configuration (TOML)`);
    lines.push(`timeout_minutes = 30`);
    lines.push("");
    lines.push(`ignore = ["**/*.md", "docs/**"]`);
    lines.push("");
    const critical: string[] = [
      'packages/**/package.json',
      '**/schema.*',
      '.github/**',
    ];
    // Add language-specific critical paths
    switch (analysis.language) {
      case 'rust':
        critical.push('**/Cargo.toml');
        break;
      case 'go':
        critical.push('**/go.mod');
        break;
      case 'python':
        critical.push('**/pyproject.toml');
        critical.push('**/requirements.txt');
        break;
    }
    lines.push('critical_globs = [');
    critical.forEach((g, i) => {
      lines.push(`  "${g}"${i === critical.length - 1 ? '' : ','}`);
    });
    lines.push(']');
    lines.push("");
    lines.push(`[outputs]`);
    lines.push(`comment = false`);
    lines.push(`webhook = false`);

    const configPath = join(this.repoRoot, '.ci.toml');
    writeFileSync(configPath, lines.join('\n'));
    console.log(`✅ Created: .ci.toml (optional config)\n`);
  }

  private printMigrationReport(workflowPath: string, analysis: CIAnalysis): void {
    console.log('📋 Migration Complete!\n');
    console.log('Next steps:');
    console.log('1. Review the generated workflow at .github/workflows/belay.yml');
    
    if (analysis.workflows.length > 0) {
      console.log('2. Test Belay alongside existing workflows');
      console.log('3. Once confident, remove old workflows:');
      analysis.workflows.forEach(w => {
        if (!w.includes('belay')) {
          console.log(`   rm .github/workflows/${w}`);
        }
      });
    } else {
      console.log('2. Commit and push to test Belay CI');
    }
    
    if (analysis.customSecrets.length > 0) {
      console.log(`\n⚠️  Custom secrets detected. Ensure these are configured in GitHub:`);
      console.log(`   Settings → Secrets → Actions → New repository secret`);
      analysis.customSecrets.forEach(s => console.log(`   - ${s}`));
    }
    
    console.log('\n🎯 To enable additional features:');
    console.log('  - PR comments: Set CI_STICKY_COMMENTS=true secret');
    console.log('  - Webhooks: Set CI_STATUS_WEBHOOK=<url> secret');
    console.log('  - Graphite: Set GRAPHITE_CI_OPTIMIZER_TOKEN secret');
    
    console.log('\n📚 Documentation: https://github.com/outfitter-dev/actions');
  }
}

// CLI execution
if (import.meta.main) {
  const migrator = new BelayMigrator();
  
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    backup: !args.includes('--no-backup'),
    force: args.includes('--force'),
    graphite: args.includes('--graphite'),
    preserveCustom: args.includes('--preserve'),
  };
  
  await migrator.migrate(options);
}
