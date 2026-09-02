import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockedObject,
  vi,
} from "vitest";

import { runAction } from "@/src/action";
import { Annotations } from "@/src/annotations";
import { FileSystem } from "@/src/fs";
import { Git } from "@/src/git";
import { Inputs } from "@/src/inputs/inputs";
import { Logger } from "@/src/logger";
import { ReviewDog, ReviewDogDeliveryError } from "@/src/reviewdog";
import { Summary } from "@/src/summary";
import { LintIssue, XmlConverter } from "@/src/xml-converter";

describe("Action", () => {
  let mockInputs: Inputs;
  let logger: Logger;
  let fileSystem: MockedObject<FileSystem>;
  let xmlConverter: MockedObject<XmlConverter>;
  let reviewDog: MockedObject<ReviewDog>;
  let git: MockedObject<Git>;
  let annotations: MockedObject<Annotations>;
  let summary: MockedObject<Summary>;

  const issues: LintIssue[] = [
    {
      id: "UnusedResources",
      message: "The resource R.string.foo appears to be unused",
      severity: "warning",
      location: { file: "app/src/main/res/values/strings.xml", line: 4 },
    },
  ];

  const run = () =>
    runAction(
      mockInputs,
      fileSystem,
      xmlConverter,
      reviewDog,
      logger,
      git,
      annotations,
      summary,
    );

  beforeEach(() => {
    vi.resetAllMocks();
    mockInputs = {
      github_token: "fake-token",
      lint_xml_file: "path/to/lint.xml",
      reporter: "github-pr-check",
      level: "warning",
      reviewdog_flags: "--diff",
    };
    logger = { info: vi.fn(), error: vi.fn() };
    fileSystem = {
      readFileString: vi.fn().mockResolvedValue(""),
      writeFileString: vi.fn().mockResolvedValue(undefined),
    };
    xmlConverter = {
      convertLintToCheckstyle: vi
        .fn()
        .mockResolvedValue({ issues, checkstyleXml: "<checkstyle/>" }),
    };
    reviewDog = vi.mocked({
      ensureInstalled: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
    });
    git = { hasFullHistory: vi.fn().mockResolvedValue(false) };
    annotations = { report: vi.fn() };
    summary = {
      isAvailable: vi.fn().mockReturnValue(false),
      write: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs beginning of execution", async () => {
    await run();
    expect(logger.info).toHaveBeenCalledWith("Running android-lint-action");
  });

  it("fails when reviewdog is not installed", async () => {
    reviewDog.ensureInstalled.mockRejectedValue(
      new Error("Reviewdog is not installed"),
    );
    await expect(run()).rejects.toThrow("Reviewdog is not installed");
  });

  it("runs reviewdog when it is installed", async () => {
    const checkstyleXml = "<checkstyle>test</checkstyle>";
    xmlConverter.convertLintToCheckstyle.mockResolvedValue({
      issues,
      checkstyleXml,
    });

    await run();

    expect(reviewDog.run).toHaveBeenCalledWith(
      checkstyleXml,
      "fake-token",
      "Android Lint",
      "github-pr-check",
      "warning",
      "--diff",
      {},
    );
  });

  describe("skipping reviewdog's redundant git fetch", () => {
    it("skips the fetch when the checkout has full history", async () => {
      git.hasFullHistory.mockResolvedValue(true);

      await run();

      expect(reviewDog.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { REVIEWDOG_SKIP_GIT_FETCH: "true" },
      );
    });

    it("leaves the fetch alone on a shallow checkout", async () => {
      git.hasFullHistory.mockResolvedValue(false);

      await run();

      expect(reviewDog.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {},
      );
    });

    it("does not override an explicit REVIEWDOG_SKIP_GIT_FETCH", async () => {
      vi.stubEnv("REVIEWDOG_SKIP_GIT_FETCH", "false");
      git.hasFullHistory.mockResolvedValue(true);

      await run();

      expect(reviewDog.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {},
      );
      vi.unstubAllEnvs();
    });
  });

  describe("when reviewdog cannot deliver the report", () => {
    beforeEach(() => {
      reviewDog.run.mockRejectedValue(
        new ReviewDogDeliveryError(1, "fail to get diff: 406 too_large"),
      );
    });

    it("falls back to annotations instead of failing the job", async () => {
      await expect(run()).resolves.toBeUndefined();
      expect(annotations.report).toHaveBeenCalledWith(issues);
    });

    it("writes a step summary when one is available", async () => {
      summary.isAvailable.mockReturnValue(true);

      await run();

      expect(summary.write).toHaveBeenCalledWith(
        issues,
        expect.stringContaining("workflow annotations"),
      );
    });

    it("skips the step summary outside GitHub Actions", async () => {
      summary.isAvailable.mockReturnValue(false);

      await run();

      expect(summary.write).not.toHaveBeenCalled();
    });
  });

  it("still fails on errors that are not delivery failures", async () => {
    reviewDog.run.mockRejectedValue(new Error("reviewdog blew up"));

    await expect(run()).rejects.toThrow("reviewdog blew up");
    expect(annotations.report).not.toHaveBeenCalled();
  });
});
