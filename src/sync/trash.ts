import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const KEEP_BACKUPS = 20;

/**
 * Local safety net: before a skill directory is deleted or overwritten (remote deletion
 * propagated to this machine, or "Use Remote" conflict resolution), it is copied here.
 */
export class Trash {
  constructor(
    private readonly trashDir: string,
    private readonly log: { info(msg: string): void; warn(msg: string): void }
  ) {}

  /** Copy a skill directory into the trash. Returns the backup path, or undefined when there is nothing to back up. */
  async backup(sourceDir: string, label: string): Promise<string | undefined> {
    try {
      const stat = await fs.stat(sourceDir);
      if (!stat.isDirectory()) {
        return undefined;
      }
    } catch {
      return undefined;
    }
    const safeLabel = label.replace(/[^A-Za-z0-9._-]+/g, '_');
    const backupPath = path.join(this.trashDir, `${Date.now()}-${safeLabel}`);
    await fs.mkdir(this.trashDir, { recursive: true });
    await fs.cp(sourceDir, backupPath, { recursive: true });
    this.log.info(`Backed up ${label} to ${backupPath}`);
    await this.prune();
    return backupPath;
  }

  /** Restore a previously backed-up skill directory (overwrites existing files). */
  async restore(backupPath: string, targetDir: string): Promise<void> {
    await fs.cp(backupPath, targetDir, { recursive: true });
    this.log.info(`Restored ${targetDir} from ${backupPath}`);
  }

  private async prune(): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(this.trashDir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // names start with a timestamp → lexicographic sort is chronological
    const excess = dirs.length - KEEP_BACKUPS;
    for (let i = 0; i < excess; i++) {
      try {
        await fs.rm(path.join(this.trashDir, dirs[i]), { recursive: true, force: true });
      } catch (e) {
        this.log.warn(`Failed to prune trash entry ${dirs[i]}: ${String(e)}`);
      }
    }
  }
}
