import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isPlatformError } from "@effect/platform/Error";
import { NodeContext } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Either, Layer, Logger, Option, pipe } from "effect";
import { afterEach, assert, beforeEach, describe, expect, vi } from "vitest";

import { ActionOutputs, runAction } from "@/src/action";
import { IOService } from "@/src/effects/actions";
import { Inputs } from "@/src/inputs/inputs";
import { Outputs } from "@/src/outputs/outputs";
import { ReviewDog } from "@/src/reviewdog";
import { XmlConverter } from "@/src/xml-converter";

describe("Action Integration", () => {
  let mockInputs: Inputs;
  let tempDir: string;
  let fixtureFile: string;

  // Create mock logger functions for tracking calls
  const mockLogInfo = vi.fn();
  const mockLogError = vi.fn();

  const testLogger = Logger.make(({ logLevel, message }) => {
    const actualMessage = Array.isArray(message) ? message.join(" ") : message;
    if (logLevel.label === "INFO") {
      mockLogInfo(actualMessage);
    }
    if (logLevel.label === "ERROR") {
      mockLogError(actualMessage);
    }
  });

  // Create a layer that replaces the default logger
  const loggerLayer = Logger.replace(Logger.defaultLogger, testLogger);
  const outputs: Outputs = {
    none: "",
  };

  // Combine all layers
  const testLayer = Layer.mergeAll(
    loggerLayer,
    Layer.succeed(ActionOutputs, outputs),
    IOService.layer,
    NodeContext.layer,
    XmlConverter.layer,
    ReviewDog.layerMock({
      run: xmlFile => {
        if (fs.existsSync(xmlFile)) {
          return Effect.succeedNone;
        }
        return Effect.fail(new Error(`File not found: ${xmlFile}`));
      },
    }),
  );

  beforeEach(() => {
    vi.resetAllMocks();

    // Create a temp directory for test output
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "android-lint-action-"));

    // Set fixture file path
    fixtureFile = path.resolve("./tests/fixtures/issues.xml");

    // Mock process.env
    vi.stubEnv("RUNNER_WORKSPACE", path.resolve("."));
    vi.stubEnv("GITHUB_WORKFLOW", "test-workflow");
    vi.stubEnv("GITHUB_ACTION", "test-action");
    vi.stubEnv("GITHUB_ACTOR", "test-actor");
    vi.stubEnv("GITHUB_REPOSITORY", "test/repository");
    vi.stubEnv("GITHUB_EVENT_NAME", "pull_request");
    vi.stubEnv(
      "GITHUB_EVENT_PATH",
      path.resolve("./tests/fixtures/github-event.json"),
    );
    vi.stubEnv("GITHUB_WORKSPACE", path.resolve("."));
    vi.stubEnv("GITHUB_SHA", "0000000000000000000000000000000000000000");

    // Prepare test inputs
    mockInputs = {
      github_token: "fake-token",
      lint_xml_file: "tests/fixtures/issues.xml",
      reporter: "github-pr-check",
      level: "warning",
      reviewdog_flags: "",
    };
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore env variables
    vi.unstubAllEnvs();

    vi.restoreAllMocks();
  });

  describe("When running the action with real file conversion", () => {
    it.scoped(
      "should convert Android Lint XML to Checkstyle format and run reviewdog",
      () =>
        Effect.gen(function* () {
          // Create outputs service
          // Make sure the fixture file exists
          expect(fs.existsSync(fixtureFile)).toBe(true);

          yield* pipe(runAction(mockInputs), Effect.provide(testLayer));

          // Verify logs
          expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining("Running android-lint-action"),
          );
          expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining("Converting"),
          );
          expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining("Conversion completed"),
          );
          expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining("Finished android-lint-action"),
          );

          // Verify no errors were logged
          expect(mockLogError).not.toHaveBeenCalled();
        }),
    );

    it.scoped("should handle invalid XML files", () =>
      Effect.gen(function* () {
        // Create outputs service
        // Use non-existent file
        const badInputs = {
          ...mockInputs,
          lint_xml_file: "non-existent-file.xml",
        };

        // Run the action and expect error
        const result = yield* Effect.either(
          pipe(runAction(badInputs), Effect.provide(testLayer)),
        );

        // Verify we got an error about the file not existing
        expect(Either.isLeft(result)).toBeTruthy();

        const error = Option.getOrThrow(Either.getLeft(result));
        assert(isPlatformError(error));
        assert(error._tag == "SystemError");
        expect(error.module).toBe("FileSystem");
        expect(error.reason).toBe("NotFound");
      }),
    );
  });
});
