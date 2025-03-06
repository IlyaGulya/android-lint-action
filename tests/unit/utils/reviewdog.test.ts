import { CommandExecutor, FileSystem } from "@effect/platform";
import { StandardCommand } from "@effect/platform/Command";
import {
  ExitCode,
  Process,
  ProcessId,
  Signal,
} from "@effect/platform/CommandExecutor";
import { PlatformError, SystemError } from "@effect/platform/Error";
import { it } from "@effect/vitest";
import { Effect, Layer, pipe, Sink, Stream } from "effect";
import * as Inspectable from "effect/Inspectable";
import { describe, expect, MockedObject, vi } from "vitest";

import { IOService } from "@/src/effects/actions";
import {
  IOServiceContext,
  ReviewDogImplementation,
  ReviewDogTag,
} from "@/src/utils/reviewdog";

// Helper: create a stream of Uint8Array from string data
function createUint8ArrayStream(
  data: string,
): Stream.Stream<Uint8Array, PlatformError> {
  const encodedData = new TextEncoder().encode(data);
  return Stream.fromIterable([encodedData]);
}

// Minimal FileSystem mock with all required methods stubbed out.
const createFileSystemMock = (
  streamImpl: () => Stream.Stream<Uint8Array, PlatformError>,
): FileSystem.FileSystem =>
  ({
    stream: vi.fn(streamImpl),
    access: vi.fn(),
    copy: vi.fn(),
    copyFile: vi.fn(),
    chmod: vi.fn(),
    chown: vi.fn(),
    close: vi.fn(),
    exists: vi.fn(),
    lstat: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  }) as unknown as FileSystem.FileSystem;

/**
 * Interface to allow configuration of our dummy Process.
 */
interface ProcessMockOptions {
  pid?: number;
  isRunning?: Effect.Effect<boolean, PlatformError>;
  kill?: (signal?: Signal) => Effect.Effect<void, PlatformError>;
  stdout?: Stream.Stream<Uint8Array, PlatformError>;
  stderr?: Stream.Stream<Uint8Array, PlatformError>;
  stdin?: { close: () => void };
  exitCode?: Effect.Effect<ExitCode, PlatformError>;
}

/**
 * Helper to create a dummy Process object that satisfies the full Process interface.
 */
const createMockProcess = (options?: ProcessMockOptions): Process => {
  return {
    [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
    ...Inspectable.BaseProto,
    toJSON(this: CommandExecutor.Process) {
      return {
        _id: "@effect/platform/CommandExecutor/Process",
        pid: this.pid,
      };
    },
    // Cast the number to ProcessId.
    pid: ProcessId(options?.pid ?? 1234),
    // Wrap the boolean in an Effect.
    isRunning: options?.isRunning ?? Effect.succeed(false),
    // Wrap the kill function so that it returns an Effect.
    kill: vi.fn((signal?: Signal) =>
      options?.kill ? options.kill(signal) : Effect.succeedNone,
    ),
    stdout:
      options?.stdout ??
      (Stream.fromIterable([]) as unknown as Stream.Stream<
        Uint8Array,
        PlatformError
      >),
    stderr:
      options?.stderr ??
      (Stream.fromIterable([]) as unknown as Stream.Stream<
        Uint8Array,
        PlatformError
      >),
    // Use a dummy Sink for stdin.
    stdin: Sink.fromEffect(Effect.succeedNone),
    // Map the provided exitCode effect (or default to 0) to return just the code,
    // and cast it to ExitCode.
    exitCode: options?.exitCode ?? Effect.succeed(ExitCode(0)),
  };
};

/**
 * Mock constructor for CommandExecutor that returns a fully configured Process.
 * Allows configuration of the Process via ProcessMockOptions.
 */
const createCommandExecutorMock = (
  processOptions?: ProcessMockOptions,
): MockedObject<CommandExecutor.CommandExecutor> => {
  const dummyProcess = createMockProcess(processOptions);
  return {
    start: vi.fn(() => {
      // Return a lazy effect wrapping the dummy process.
      return Effect.sync(() => dummyProcess);
    }),
  } as unknown as MockedObject<CommandExecutor.CommandExecutor>;
};

// Minimal IOService mock.
const createIOServiceMock = (
  whichImpl: (cmd: string, flag?: boolean) => Promise<string | undefined>,
): IOService =>
  ({
    // Convert the Promise-returning function to an Effect-returning function
    which: vi.fn((cmd: string, flag?: boolean) =>
      Effect.tryPromise(() => whichImpl(cmd, flag)),
    ),
  }) as unknown as IOService;

describe("ReviewDogImplementation", () => {
  describe("ensureInstalled()", () => {
    it.effect("should succeed if reviewdog is found", () => {
      const mockIOService = createIOServiceMock(() =>
        Promise.resolve("/usr/bin/reviewdog"),
      );
      return pipe(
        Effect.gen(function* () {
          const reviewDog = yield* ReviewDogTag;
          yield* reviewDog.ensureInstalled();
          expect(mockIOService.which).toHaveBeenCalledWith("reviewdog", false);
        }),
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IOServiceContext, mockIOService),
            Layer.succeed(ReviewDogTag, ReviewDogImplementation),
          ),
        ),
      );
    });

    it.effect("should fail if reviewdog is not found", () => {
      const mockIOService = createIOServiceMock(() =>
        Promise.resolve(undefined),
      );
      return pipe(
        Effect.gen(function* () {
          const reviewDog = yield* ReviewDogTag;
          yield* reviewDog.ensureInstalled();
          throw new Error("Expected failure, but succeeded.");
        }),
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IOServiceContext, mockIOService),
            Layer.succeed(ReviewDogTag, ReviewDogImplementation),
          ),
        ),
        Effect.catchAll(err =>
          Effect.sync(() => {
            expect(err.message).toMatch(/Reviewdog is not installed/);
          }),
        ),
      );
    });
  });

  describe("run()", () => {
    it.effect(
      "should call reviewdog with the correct arguments and stream Uint8Array data",
      () => {
        const fileSystemMock = createFileSystemMock(() =>
          createUint8ArrayStream("fake checkstyle content"),
        );
        // Use the configurable CommandExecutor mock to simulate a successful process.
        const executorMock = createCommandExecutorMock({
          exitCode: Effect.succeed(ExitCode(0)),
          stdin: { close: vi.fn() },
        });

        return pipe(
          Effect.gen(function* () {
            const reviewDog = yield* ReviewDogTag;
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
            expect(fileSystemMock.stream).toHaveBeenCalledWith(
              "fake-checkstyle.xml",
            );
          }),
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, fileSystemMock),
              Layer.succeed(CommandExecutor.CommandExecutor, executorMock),
              Layer.succeed(IOServiceContext, {} as IOService),
              Layer.succeed(ReviewDogTag, ReviewDogImplementation),
            ),
          ),
        );
      },
    );

    it.effect(
      "should handle exit code errors from the reviewdog command",
      () => {
        const fileSystemMock = createFileSystemMock(() =>
          createUint8ArrayStream("data"),
        );
        // Use the configurable CommandExecutor mock to simulate a failing process.
        const executorMock = createCommandExecutorMock({
          exitCode: Effect.fail(
            SystemError({
              module: "Command",
              method: "start",
              message: "reviewdog failed",
              reason: "Unknown",
              pathOrDescriptor: "",
            }),
          ),
          stdin: { close: vi.fn() },
        });

        return pipe(
          Effect.gen(function* () {
            const reviewDog = yield* ReviewDogTag;
            yield* reviewDog.run("someFile", "testName", "local", "warning");
            throw new Error("Expected failure, but succeeded.");
          }),
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, fileSystemMock),
              Layer.succeed(CommandExecutor.CommandExecutor, executorMock),
              Layer.succeed(IOServiceContext, {} as IOService),
              Layer.succeed(ReviewDogTag, ReviewDogImplementation),
            ),
          ),
          Effect.catchAll(err =>
            Effect.sync(() => {
              expect(err.message).toMatch(/reviewdog failed/);
            }),
          ),
        );
      },
    );
  });
});
