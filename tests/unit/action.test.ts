import * as os from "node:os";

import { FileSystem } from "@effect/platform";
import { it } from "@effect/vitest";
import { Effect, Either, Layer, Logger } from "effect";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import {
  ActionOutputs,
  ActionXmlConverter,
  runAction,
  XmlConverterTag,
} from "@/src/action";
import { Inputs } from "@/src/inputs/inputs";
import { ActionReviewDog, ReviewDogTag } from "@/src/utils/reviewdog";

describe("Action", () => {
  let mockInputs: Inputs;
  let tmpDir: string;

  // Create mock logger functions for tracking calls
  const mockLogInfo = vi.fn();
  const mockLogError = vi.fn();

  const testLogger = Logger.make(({ logLevel, message }) => {
    const actualMessage = Array.isArray(message) ? message.join(" ") : message;
    if (logLevel.label === "INFO") {
      // If message is an array, join it or take the first element
      mockLogInfo(actualMessage);
    }
    if (logLevel.label === "ERROR") {
      mockLogError(actualMessage);
    }
  });

  // Create a layer that replaces the default logger
  const loggerLayer = Logger.replace(Logger.defaultLogger, testLogger);

  // Create test implementations
  const createTestReviewDog = (installed: boolean): ActionReviewDog => ({
    ensureInstalled: () =>
      installed
        ? Effect.succeedNone
        : Effect.fail(
            new Error(
              "Reviewdog is not installed. Please install it before running this action.",
            ),
          ),
    run: vi.fn().mockImplementation(() => Effect.succeedNone),
  });

  const createTestXmlConverter = (): ActionXmlConverter => ({
    convertLintToCheckstyle: vi
      .fn()
      .mockImplementation(() => Effect.succeedNone),
  });

  const createTestFileSystem = (): FileSystem.FileSystem =>
    ({
      makeTempDirectoryScoped: () => Effect.succeed(tmpDir),
    }) as unknown as FileSystem.FileSystem;

  // Create layers for the tests
  const createTestLayers = (reviewDogInstalled: boolean) => {
    const outputs = {};
    const reviewDog = createTestReviewDog(reviewDogInstalled);
    const xmlConverter = createTestXmlConverter();
    const fileSystem = createTestFileSystem();

    // Create individual layers
    const outputsLayer = Layer.succeed(ActionOutputs, outputs);
    const reviewDogLayer = Layer.succeed(ReviewDogTag, reviewDog);
    const xmlConverterLayer = Layer.succeed(XmlConverterTag, xmlConverter);
    const fsLayer = Layer.succeed(FileSystem.FileSystem, fileSystem);

    // Combine all layers, including the logger layer
    const allLayers = Layer.merge(
      loggerLayer,
      Layer.merge(
        outputsLayer,
        Layer.merge(reviewDogLayer, Layer.merge(xmlConverterLayer, fsLayer)),
      ),
    );

    return { allLayers, outputs, reviewDog, xmlConverter, fileSystem };
  };

  beforeEach(() => {
    vi.resetAllMocks();

    tmpDir = os.tmpdir();
    mockInputs = {
      github_token: "fake-token",
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
    it.effect("logs beginning of execution", () =>
      Effect.gen(function* () {
        // Setup test environment with reviewdog installed
        const { allLayers } = createTestLayers(true);

        // Run the action with all dependencies
        yield* Effect.provide(runAction(mockInputs), allLayers);

        // Verify the first log message
        expect(mockLogInfo).toHaveBeenCalledWith(
          expect.stringContaining("Running android-lint-action"),
        );
      }),
    );

    it.effect("fails when reviewdog is not installed", () =>
      Effect.gen(function* () {
        // Setup test environment with reviewdog NOT installed
        const { allLayers } = createTestLayers(false);

        // Run the action and capture the result
        const result = yield* Effect.either(
          Effect.provide(runAction(mockInputs), allLayers),
        );

        // Verify we got an error
        expect(Either.isLeft(result)).toBe(true);

        // Extract the error and check its message
        if (Either.isLeft(result)) {
          const error = result.left;
          expect(error).toBeDefined();
          expect(error.message).toContain("Reviewdog is not installed");
        }
      }),
    );

    it.effect("runs reviewdog when it is installed", () =>
      Effect.gen(function* () {
        // Setup test environment with reviewdog installed
        const { allLayers, reviewDog } = createTestLayers(true);

        // Run the action
        yield* Effect.provide(runAction(mockInputs), allLayers);

        // Verify reviewdog was executed with expected params
        expect(reviewDog.run).toHaveBeenCalledWith(
          expect.stringContaining("output_checkstyle.xml"),
          "Android Lint",
          "github-pr-check",
          "warning",
          "--diff",
        );
      }),
    );
  });
});
