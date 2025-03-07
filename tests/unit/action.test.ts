import * as os from "node:os";

import { FileSystem } from "@effect/platform";
import { NodeCommandExecutor } from "@effect/platform-node";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "@effect/vitest";
import { Effect, Either, Layer, Logger } from "effect";

import { ActionOutputs, runAction } from "@/src/action";
import { IOService } from "@/src/effects/actions";
import { Inputs } from "@/src/inputs/inputs";
import { ReviewDog } from "@/src/reviewdog";
import { XmlConverter } from "@/src/xml-converter";
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

  // Create layers for the tests
  const createTestLayers = (reviewDogInstalled: boolean) => {
    const outputs = {
      none: "none",
    };
    const reviewDog = ReviewDog.makeNoop({
      ensureInstalled: () =>
        reviewDogInstalled
          ? Effect.succeedNone
          : Effect.fail(
              new Error(
                "Reviewdog is not installed. Please install it before running this action.",
              ),
            ),
      run: vi.fn(() => Effect.succeedNone),
    });
    const xmlConverterLayer = XmlConverter.layerNoop({
      convertLintToCheckstyle: () => Effect.succeedNone,
    });

    // Create individual layers
    const outputsLayer = Layer.succeed(ActionOutputs, outputs);
    const fsLayer = FileSystem.layerNoop({
      makeTempDirectoryScoped: () => Effect.succeed(tmpDir),
    });
    const commandExecutor = Layer.provide(NodeCommandExecutor.layer, fsLayer);

    const allLayers = Layer.mergeAll(
      loggerLayer,
      outputsLayer,
      Layer.succeed(ReviewDog.ReviewDog, reviewDog),
      xmlConverterLayer,
      commandExecutor,
      fsLayer,
      IOService.layer,
    );

    return { allLayers, reviewDog };
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
    it.scoped("logs beginning of execution", () =>
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

    it.scoped("fails when reviewdog is not installed", () =>
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

    it.scoped("runs reviewdog when it is installed", () =>
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
