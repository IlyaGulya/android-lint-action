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
import { FileSystem } from "@/src/fs";
import { Inputs } from "@/src/inputs/inputs";
import { Logger } from "@/src/logger";
import { ReviewDog } from "@/src/reviewdog";
import { XmlConverter } from "@/src/xml-converter";

describe("Action", () => {
  let mockInputs: Inputs;
  let logger: Logger;
  let fileSystem: MockedObject<FileSystem>;
  let xmlConverter: MockedObject<XmlConverter>;
  let reviewDog: MockedObject<ReviewDog>;

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
      convertLintToCheckstyle: vi.fn().mockResolvedValue(undefined),
    };
    reviewDog = vi.mocked({
      ensureInstalled: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs beginning of execution", async () => {
    await runAction(mockInputs, fileSystem, xmlConverter, reviewDog, logger);
    expect(logger.info).toHaveBeenCalledWith("Running android-lint-action");
  });

  it("fails when reviewdog is not installed", async () => {
    reviewDog.ensureInstalled.mockRejectedValue(
      new Error("Reviewdog is not installed"),
    );
    await expect(
      runAction(mockInputs, fileSystem, xmlConverter, reviewDog, logger),
    ).rejects.toThrow("Reviewdog is not installed");
  });

  it("runs reviewdog when it is installed", async () => {
    const checkstyleXml = "<checkstyle>test</checkstyle>";
    xmlConverter.convertLintToCheckstyle.mockResolvedValue(checkstyleXml);

    await runAction(mockInputs, fileSystem, xmlConverter, reviewDog, logger);

    expect(reviewDog.run).toHaveBeenCalledWith(
      checkstyleXml,
      "fake-token",
      "Android Lint",
      "github-pr-check",
      "warning",
      "--diff",
    );
  });
});
