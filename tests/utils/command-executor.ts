import { CommandExecutor } from "@effect/platform";
import {
  ExitCode,
  Process,
  ProcessId,
  Signal,
} from "@effect/platform/CommandExecutor";
import { PlatformError } from "@effect/platform/Error";
import { Effect, Inspectable, Sink, Stream } from "effect";
import { MockedObject } from "vitest";

/**
 * Interface to allow configuration of our dummy Process.
 */
export interface ProcessMockOptions {
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
export const createMockProcess = (options?: ProcessMockOptions): Process => {
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
    stdout: options?.stdout ?? Stream.fromIterable<Uint8Array>([]),
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
export const createCommandExecutorMock = (
  processOptions?: ProcessMockOptions,
): MockedObject<CommandExecutor.CommandExecutor> => {
  const dummyProcess = createMockProcess(processOptions);
  return {
    exitCode: vi.fn(() => {
      return processOptions?.exitCode ?? Effect.succeed(ExitCode(0));
    }),
    start: vi.fn(() => {
      // Return a lazy effect wrapping the dummy process.
      return Effect.sync(() => dummyProcess);
    }),
  } as unknown as MockedObject<CommandExecutor.CommandExecutor>;
};
