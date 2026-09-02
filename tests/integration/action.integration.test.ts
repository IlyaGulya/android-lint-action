import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAction } from "@/src/action";
import { AnnotationReporter } from "@/src/annotations";
import { FileSystem, NodeFileSystem } from "@/src/fs";
import { Git } from "@/src/git";
import { Inputs } from "@/src/inputs/inputs";
import { Logger } from "@/src/logger";
import { ReviewDog, ReviewDogDeliveryError } from "@/src/reviewdog";
import { StepSummary } from "@/src/summary";
import { XmlConverter, XmlConverterImpl } from "@/src/xml-converter";

describe("Action Integration", () => {
  let tempDir: string;
  let logger: Logger;
  let fileSystem: FileSystem;
  let xmlConverter: XmlConverter;
  let reviewDog: ReviewDog;
  let baseInputs: Inputs;
  let git: Git;
  let logged: string[];

  const run = (inputs: Inputs = baseInputs) =>
    runAction(
      inputs,
      fileSystem,
      xmlConverter,
      reviewDog,
      logger,
      git,
      new AnnotationReporter(logger),
      new StepSummary((path, body) => fs.promises.appendFile(path, body)),
    );

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-lint-action-"));
    logged = [];
    logger = {
      info: vi.fn((message: string) => logged.push(message)),
      error: vi.fn((message: string) => logged.push(message)),
    };
    git = { hasFullHistory: vi.fn().mockResolvedValue(false) };
    fileSystem = new NodeFileSystem();
    xmlConverter = new XmlConverterImpl(fileSystem);
    reviewDog = {
      ensureInstalled: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
    };
    baseInputs = {
      github_token: "fake-token",
      lint_xml_file: "tests/fixtures/issues.xml",
      reporter: "github-pr-check",
      level: "warning",
      reviewdog_flags: "",
    };
    vi.stubEnv("RUNNER_WORKSPACE", process.cwd());
    vi.stubEnv("GITHUB_REPOSITORY", "test/repo");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("converts XML and runs reviewdog", async () => {
    await run();
    expect(logger.info).toHaveBeenCalledWith("Running android-lint-action");
    expect(reviewDog.run).toHaveBeenCalled();
  });

  it("handles invalid XML files", async () => {
    const inputs = {
      ...baseInputs,
      lint_xml_file: "non_existent_file.xml", // Use a file that definitely doesn't exist
    };

    // Mock xmlConverter to throw an error when given this specific file
    xmlConverter.convertLintToCheckstyle = vi
      .fn()
      .mockImplementation(filePath => {
        if (filePath === "non_existent_file.xml") {
          throw new Error("File not found");
        }
        return Promise.resolve("");
      });

    await expect(run(inputs)).rejects.toThrow();
  });

  // Regression test for the failure that motivated this change: on a PR with
  // more than 300 changed files reviewdog cannot fetch the diff, and the job
  // used to go red even though lint itself had produced a clean report.
  describe("PR with more than 300 changed files", () => {
    beforeEach(() => {
      git = { hasFullHistory: vi.fn().mockResolvedValue(true) };
      reviewDog.run = vi
        .fn()
        .mockRejectedValue(
          new ReviewDogDeliveryError(
            1,
            "fail to get diff: failed to run git fetch: fatal: could not " +
              "read Username for 'https://github.com': No such device or address",
          ),
        );
    });

    it("asks reviewdog to skip the redundant fetch on a full checkout", async () => {
      await run();

      const extraEnv = vi.mocked(reviewDog.run).mock.calls[0]?.[6];
      expect(extraEnv).toEqual({ REVIEWDOG_SKIP_GIT_FETCH: "true" });
    });

    it("reports the real issues as annotations and does not fail", async () => {
      await expect(run()).resolves.toBeUndefined();

      const annotations = logged.filter(line => line.startsWith("::"));
      expect(annotations.length).toBeGreaterThan(0);
      expect(annotations[0]).toMatch(/^::(warning|error) /);
    });

    it("records the issues in the step summary", async () => {
      const summaryFile = path.join(tempDir, "summary.md");
      vi.stubEnv("GITHUB_STEP_SUMMARY", summaryFile);

      await run();

      const written = fs.readFileSync(summaryFile, "utf8");
      expect(written).toContain("### Android Lint");
      expect(written).toContain("| Severity | Issue | Location | Message |");
    });
  });
});
