import { CommandExecutor, FileSystem } from "@effect/platform";
import { StandardCommand } from "@effect/platform/Command";
import { ExitCode } from "@effect/platform/CommandExecutor";
import { PlatformError } from "@effect/platform/Error";
import { it } from "@effect/vitest";
import { Effect, Layer, pipe, Stream } from "effect";
import { describe, expect, vi } from "vitest";

import { createCommandExecutorMock } from "@/tests/utils/command-executor";

import { IOService } from "@/src/effects/actions";
import { ReviewDog } from "@/src/reviewdog";

// Helper: create a stream of Uint8Array from string data
function createUint8ArrayStream(
  data: string,
): Stream.Stream<Uint8Array, PlatformError> {
  const encodedData = new TextEncoder().encode(data);
  return Stream.fromIterable([encodedData]);
}

describe("ReviewDogImplementation", () => {
  describe("ensureInstalled()", () => {
    it.effect("should succeed if reviewdog is found", () => {
      const which = vi.fn(() => Effect.succeed("/usr/bin/reviewdog"));
      const mockIOLayer = IOService.layerNoop({
        which: which,
      });
      return pipe(
        Effect.gen(function* () {
          const reviewDog = yield* ReviewDog.ReviewDog;
          yield* reviewDog.ensureInstalled();
          expect(which).toHaveBeenCalledWith("reviewdog", false);
        }),
        Effect.provide(Layer.mergeAll(mockIOLayer, ReviewDog.layer)),
      );
    });

    it.effect("should fail if reviewdog is not found", () => {
      const mockIOLayer = IOService.layerNoop({
        which: () => Effect.succeed(""),
      });
      return pipe(
        Effect.gen(function* () {
          const reviewDog = yield* ReviewDog.ReviewDog;
          yield* reviewDog.ensureInstalled();
          throw new Error("Expected failure, but succeeded.");
        }),
        Effect.provide(Layer.mergeAll(mockIOLayer, ReviewDog.layer)),
        Effect.catchAll(err =>
          Effect.sync(() => {
            expect(err.message).toMatch(/Reviewdog is not installed/);
          }),
        ),
      );
    });
  });

  describe("run()", () => {
    it.scoped(
      "should call reviewdog with the correct arguments and stream Uint8Array data",
      () => {
        const stream = vi.fn(() =>
          createUint8ArrayStream("fake checkstyle content"),
        );
        const fileSystemMock = FileSystem.layerNoop({
          stream: stream,
        });
        // Use the configurable CommandExecutor mock to simulate a successful process.
        const executorMock = createCommandExecutorMock({
          exitCode: Effect.succeed(ExitCode(0)),
          stdin: { close: vi.fn() },
        });
        const commandExecutorLayer = Layer.succeed(
          CommandExecutor.CommandExecutor,
          executorMock,
        );

        return pipe(
          Effect.gen(function* () {
            const reviewDog = yield* ReviewDog.ReviewDog;
            yield* reviewDog.run(
              "fake-checkstyle.xml",
              "myCheck",
              "github-pr-review",
              "error",
              "-filter-mode=nofilter",
            );
            expect(executorMock.start).toHaveBeenCalledTimes(1);
            const commandCall = executorMock.start.mock
              .calls[0][0] as StandardCommand;
            expect(commandCall.command).toEqual("reviewdog");
            expect(commandCall.args).toEqual([
              "-f=checkstyle",
              "-name=myCheck",
              "-reporter=github-pr-review",
              "-level=error",
              "-filter-mode=nofilter",
            ]);
            expect(stream).toHaveBeenCalledWith("fake-checkstyle.xml");
          }),
          Effect.provide(
            Layer.mergeAll(
              fileSystemMock,
              commandExecutorLayer,
              IOService.layerNoop({}),
              ReviewDog.layer,
            ),
          ),
        );
      },
    );

    it.scoped(
      "should handle exit code errors from the reviewdog command",
      () => {
        const stream = vi.fn(() => createUint8ArrayStream("data"));
        const fileSystemMock = FileSystem.layerNoop({
          stream: stream,
        });
        // Use the configurable CommandExecutor mock to simulate a failing process.
        const executorMock = createCommandExecutorMock({
          exitCode: Effect.succeed(ExitCode(1)),
          stdin: { close: vi.fn() },
        });
        const commandExecutorLayer = Layer.succeed(
          CommandExecutor.CommandExecutor,
          executorMock,
        );

        return pipe(
          Effect.gen(function* () {
            const reviewDog = yield* ReviewDog.ReviewDog;
            yield* reviewDog.run("someFile", "testName", "local", "warning");
            throw new Error("Expected failure, but succeeded.");
          }),
          Effect.provide(
            Layer.mergeAll(
              fileSystemMock,
              commandExecutorLayer,
              IOService.layerNoop({}),
              ReviewDog.layer,
            ),
          ),
          Effect.catchAll(err =>
            Effect.sync(() => {
              expect(err.message).toContain(
                "reviewdog exited with non-zero code: 1",
              );
            }),
          ),
        );
      },
    );
  });
});
