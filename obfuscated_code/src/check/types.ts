import type { ObfuscationMode } from '../types/config.js';
import type { CoverageReport } from '../code/coverage.js';

export interface CheckIssue {
  severity: 'error' | 'warn' | 'info';
  category: 'conflict' | 'route' | 'residual' | 'coverage' | 'preset';
  message: string;
  file?: string;
  line?: number;
}

export interface CheckReport {
  project: string;
  mode: ObfuscationMode;
  passed: boolean;
  issueCount: number;
  issues: CheckIssue[];
  coverage?: CoverageReport;
  checkedAt: string;
}
