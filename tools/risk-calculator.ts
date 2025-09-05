#!/usr/bin/env bun

export type Tier = 'minimal' | 'essential' | 'full';

export interface RiskFactors {
  position: 'top' | 'middle' | 'bottom' | 'unknown';
  filesChanged: number;
  critical: boolean;
  isDraft: boolean;
  eventName: string;
  graphiteSkip?: boolean;
}

export class RiskCalculator {
  private weights = {
    filesChanged: {
      threshold: 50,
      weight: 0.3,
    },
    position: {
      top: 0.3,
      bottom: 0.3,
      middle: 0,
      unknown: 0.15,
    },
    critical: 0.3,
    draft: -0.1,
  };

  calculate(factors: RiskFactors): { score: number; tier: Tier; reasoning: string[] } {
    let score = 0;
    const reasoning: string[] = [];

    // Files changed factor
    if (factors.filesChanged > this.weights.filesChanged.threshold) {
      score += this.weights.filesChanged.weight;
      reasoning.push(`High file count (${factors.filesChanged} files)`);
    }

    // Position factor
    const positionWeight = this.weights.position[factors.position];
    if (positionWeight > 0) {
      score += positionWeight;
      reasoning.push(`Stack position: ${factors.position}`);
    }

    // Critical paths
    if (factors.critical) {
      score += this.weights.critical;
      reasoning.push('Critical paths modified');
    }

    // Draft PR (reduces risk)
    if (factors.isDraft) {
      score += this.weights.draft;
      reasoning.push('Draft PR (reduced risk)');
    }

    // Normalize score to 0-1
    score = Math.max(0, Math.min(1, score));

    // Determine tier based on score
    let tier: Tier;
    if (score > 0.7) {
      tier = 'full';
    } else if (score > 0.3) {
      tier = 'essential';
    } else {
      tier = 'minimal';
    }

    // Hard overrides
    if (factors.eventName === 'merge_group') {
      tier = 'full';
      reasoning.push('Merge queue event (forced full)');
    }

    if (factors.graphiteSkip === false) {
      tier = 'full';
      reasoning.push('Graphite optimizer: run full');
    }

    if (factors.critical && factors.eventName !== 'merge_group') {
      tier = 'full';
      reasoning.push('Critical escalation');
    }

    return { score, tier, reasoning };
  }

  // Advanced risk calculation with more factors
  calculateAdvanced(factors: RiskFactors & {
    authorReliability?: number; // 0-1, higher is more reliable
    prAge?: number; // hours
    hasConflicts?: boolean;
    testCoverage?: number; // 0-100
    previousFailures?: number;
  }): { score: number; tier: Tier; reasoning: string[] } {
    const base = this.calculate(factors);
    let { score } = base;
    const { reasoning } = base;

    // Author reliability (if available)
    if (factors.authorReliability !== undefined) {
      const reliabilityAdjustment = (1 - factors.authorReliability) * 0.2;
      score += reliabilityAdjustment;
      if (reliabilityAdjustment > 0.1) {
        reasoning.push(`Low author reliability (${Math.round(factors.authorReliability * 100)}%)`);
      }
    }

    // PR age factor
    if (factors.prAge !== undefined) {
      if (factors.prAge > 72) {
        score += 0.1;
        reasoning.push(`Stale PR (${Math.round(factors.prAge / 24)} days old)`);
      }
    }

    // Conflicts increase risk
    if (factors.hasConflicts) {
      score += 0.2;
      reasoning.push('Has merge conflicts');
    }

    // Low test coverage increases risk
    if (factors.testCoverage !== undefined && factors.testCoverage < 80) {
      score += 0.15;
      reasoning.push(`Low test coverage (${factors.testCoverage}%)`);
    }

    // Previous failures indicate instability
    if (factors.previousFailures && factors.previousFailures > 0) {
      score += Math.min(0.2, factors.previousFailures * 0.05);
      reasoning.push(`${factors.previousFailures} previous failures`);
    }

    // Re-normalize and determine tier
    score = Math.max(0, Math.min(1, score));
    
    let tier: Tier;
    if (score > 0.7) {
      tier = 'full';
    } else if (score > 0.3) {
      tier = 'essential';
    } else {
      tier = 'minimal';
    }

    // Apply hard overrides again
    if (factors.eventName === 'merge_group') {
      tier = 'full';
    }

    return { score, tier, reasoning };
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const factors: RiskFactors = {
    position: 'unknown',
    filesChanged: 0,
    critical: false,
    isDraft: false,
    eventName: 'pull_request',
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--position':
        factors.position = value as any;
        break;
      case '--files-changed':
        factors.filesChanged = parseInt(value, 10) || 0;
        break;
      case '--critical':
        factors.critical = value === 'true';
        break;
      case '--draft':
        factors.isDraft = value === 'true';
        break;
      case '--event':
        factors.eventName = value;
        break;
      case '--graphite-skip':
        factors.graphiteSkip = value === 'true';
        break;
    }
  }

  const calculator = new RiskCalculator();
  const result = calculator.calculate(factors);
  
  // Output just the tier for shell consumption
  console.log(result.tier);
  
  // Log reasoning to stderr for debugging
  if (process.env.DEBUG) {
    console.error('Risk calculation:', result);
  }
}