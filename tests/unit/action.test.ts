import * as fs from "node:fs";
import * as os from "node:os";

import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Action } from "@/src/action";
import { Inputs } from "@/src/inputs/inputs";
import { ReviewDog } from "@/src/utils/reviewdog";
import { XmlConverter } from "@/src/utils/xml-converter";

import { LoggerMock } from "./logger/logger-mock";
import { OutputsMock } from "./outputs/outputs-mock";

// Mock dependencies
vi.mock("@actions/core");
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

describe("Action", () => {
  let logger: LoggerMock;
  let outputs: OutputsMock;
  let action: Action;
  let mockInputs: Inputs;
  let mockReviewDog: ReviewDog;
  let mockXmlConverter: XmlConverter;
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset core mocks
    vi.mocked(core.setFailed).mockReset();

    // Get the actual temp directory
    tmpDir = os.tmpdir();

    // Mock fs operations
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("<lint></lint>"));

    // Create mock objects
    mockReviewDog = {
      checkInstalled: vi.fn(),
      run: vi.fn(),
    } as unknown as ReviewDog;

    mockXmlConverter = {
      convertLintToCheckstyle: vi.fn().mockResolvedValue(Promise.resolve()),
    } as unknown as XmlConverter;

    logger = new LoggerMock();
    outputs = new OutputsMock();

    // Create action with mocked dependencies
    action = new Action({
      logger,
      outputs,
      reviewDogFactory: () => mockReviewDog,
      xmlConverterFactory: () => mockXmlConverter,
    });

    vi.stubEnv("GITHUB_WORKSPACE", "/workspace");

    mockInputs = {
      github_token: "gh-token",
      lint_xml_file: "path/to/lint.xml",
      reporter: "github-pr-check",
      level: "warning",
      reviewdog_flags: "--diff",
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("When running the action", () => {
    it("logs beginning of execution", async () => {
      // Mock reviewdog as installed
      mockReviewDog.checkInstalled = vi.fn().mockResolvedValueOnce(true);

      // Execute action
      await action.run(mockInputs);

      // Verify the first log message using the public method
      logger.assertInfoToHaveBeenCalledWith("Running android-lint-action");
    });

    it("fails when reviewdog is not installed", async () => {
      // Mock reviewdog as not installed
      mockReviewDog.checkInstalled = vi.fn().mockResolvedValueOnce(false);

      // Execute action
      await action.run(mockInputs);

      // Verify that error message was logged and the action failed
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Reviewdog is not installed"),
      );
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Reviewdog is not installed"),
      );

      // Verify that reviewdog.run was not called
      expect(mockReviewDog.run).not.toHaveBeenCalled();
    });

    it("runs reviewdog when it is installed", async () => {
      // Mock reviewdog as installed
      mockReviewDog.checkInstalled = vi.fn().mockResolvedValueOnce(true);

      // Execute action
      await action.run(mockInputs);

      // Verify that reviewdog was run
      expect(mockReviewDog.run).toHaveBeenCalledWith(
        `${tmpDir}/output_checkstyle.xml`,
        "Android Lint",
        mockInputs.reporter,
        mockInputs.level,
        mockInputs.reviewdog_flags,
      );
    });
  });
});
