import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface Git {
  /**
   * True when the checkout has full history, i.e. `git fetch` is not needed to
   * resolve the PR's merge base locally.
   */
  hasFullHistory(): Promise<boolean>;
}

export class GitCli implements Git {
  async hasFullHistory(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", [
        "rev-parse",
        "--is-shallow-repository",
      ]);
      return stdout.trim() === "false";
    } catch {
      // Not a git repo, or git is unavailable: assume we cannot rely on local
      // history and let reviewdog fetch as usual.
      return false;
    }
  }
}
