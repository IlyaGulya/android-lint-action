import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitCli } from "@/src/git";

describe("GitCli", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-lint-git-"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports full history for an ordinary clone", async () => {
    execFileSync("git", ["init", "-q"], { cwd: tempDir });
    process.chdir(tempDir);

    await expect(new GitCli().hasFullHistory()).resolves.toBe(true);
  });

  it("reports no full history outside a git repository", async () => {
    process.chdir(tempDir);

    await expect(new GitCli().hasFullHistory()).resolves.toBe(false);
  });

  it("reports no full history for a shallow clone", async () => {
    const origin = path.join(tempDir, "origin");
    const shallow = path.join(tempDir, "shallow");
    fs.mkdirSync(origin);
    const git = (args: string[], cwd: string) =>
      execFileSync("git", args, {
        cwd,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });

    git(["init", "-q"], origin);
    for (const n of [1, 2]) {
      fs.writeFileSync(path.join(origin, `f${n}.txt`), `${n}`);
      git(["add", "."], origin);
      git(["commit", "-q", "-m", `c${n}`], origin);
    }
    git(["clone", "-q", "--depth=1", `file://${origin}`, shallow], tempDir);
    process.chdir(shallow);

    await expect(new GitCli().hasFullHistory()).resolves.toBe(false);
  });
});
