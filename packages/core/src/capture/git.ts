import { execSync } from 'node:child_process';

/**
 * Minimal git wrapper. We shell out rather than depend on a git library to
 * keep the dependency tree tiny. All commands are run in the given working
 * directory.
 */

export interface GitCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  subject: string;
  files: string[];
}

export class GitClient {
  constructor(private readonly cwd: string) {}

  isRepo(): boolean {
    try {
      this.run('git rev-parse --is-inside-work-tree');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve the repo's top-level directory. Useful for normalizing paths.
   */
  topLevel(): string {
    return this.run('git rev-parse --show-toplevel').trim();
  }

  /**
   * Read recent commits, newest first.
   */
  log(opts: { limit?: number; since?: string } = {}): GitCommit[] {
    const limit = opts.limit ?? 50;
    const since = opts.since ? `--since=${shellQuote(opts.since)}` : '';
    const fmt = '%H%x1f%an%x1f%ae%x1f%at%x1f%s%x1e';
    const raw = this.run(`git log -n ${limit} ${since} --pretty=format:'${fmt}'`);
    const commits: GitCommit[] = [];
    for (const block of raw.split('\x1e').map((s) => s.trim()).filter(Boolean)) {
      const [hash, authorName, authorEmail, authorDate, subject] = block.split('\x1f');
      const files = this.run(`git show --name-only --pretty=format: ${hash}`)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      commits.push({
        hash,
        authorName,
        authorEmail,
        authorDate: parseInt(authorDate, 10) * 1000,
        subject,
        files
      });
    }
    return commits;
  }

  /**
   * Read a file at a specific commit. Returns empty string if the file
   * didn't exist at that commit.
   */
  showFile(commit: string, path: string): string {
    try {
      return this.runRaw(`git show ${commit}:${shellEscapePath(path)}`);
    } catch {
      return '';
    }
  }

  /**
   * Diff two commits for a single file.
   */
  diffFile(fromCommit: string, toCommit: string, path: string): string {
    try {
      return this.runRaw(
        `git diff ${fromCommit} ${toCommit} -- ${shellEscapePath(path)}`
      );
    } catch {
      return '';
    }
  }

  /**
   * Get HEAD commit hash.
   */
  head(): string {
    return this.run('git rev-parse HEAD').trim();
  }

  private run(cmd: string): string {
    return execSync(cmd, {
      cwd: this.cwd,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private runRaw(cmd: string): string {
    return execSync(cmd, {
      cwd: this.cwd,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function shellEscapePath(p: string): string {
  // Git paths are simple. Wrap in quotes and escape internal quotes.
  return `'${p.replace(/'/g, `'\\''`)}'`;
}
