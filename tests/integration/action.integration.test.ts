import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAction } from "@/src/action";
import { FileSystem, NodeFileSystem } from "@/src/fs";
import { Inputs } from "@/src/inputs/inputs";
import { Logger } from "@/src/logger";
import { ReviewDog } from "@/src/reviewdog";
import { XmlConverter, XmlConverterImpl } from "@/src/xml-converter";

describe("Action Integration", () => {
  let tempDir: string;
  let logger: Logger;
  let fileSystem: FileSystem;
  let xmlConverter: XmlConverter;
  let reviewDog: ReviewDog;
  let baseInputs: Inputs;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-lint-action-"));
    logger = { info: vi.fn(), error: vi.fn() };
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
    await runAction(baseInputs, fileSystem, xmlConverter, reviewDog, logger);
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

    await expect(
      runAction(inputs, fileSystem, xmlConverter, reviewDog, logger),
    ).rejects.toThrow();
  });
});
