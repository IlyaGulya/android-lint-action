import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { Context, Effect, Fiber, Layer, Scope, Stream } from "effect";

import { IOService } from "../effects/actions";

/**
 * Interface for the ReviewDog functionality
 */
export interface ReviewDog {
  ensureInstalled(): Effect.Effect<void, Error, IOService.IOService>;

  run(
    checkstyleFile: string,
    github_token: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
  ): Effect.Effect<
    void,
    Error | PlatformError,
    CommandExecutor.CommandExecutor | FileSystem.FileSystem | Scope.Scope
  >;
}

/**
 * Checks if reviewdog is installed
 */
const ensureInstalled = () =>
  Effect.gen(function* () {
    const ioService = yield* IOService.IOService;

    try {
      const path = yield* ioService.which("reviewdog", false);

      if (!path) {
        return yield* Effect.fail(
          new Error(
            `Reviewdog is not installed. Please install it before running this action.\n` +
              `We recommend using 'reviewdog/action-setup' GitHub Action.\n` +
              `See README.md for installation instructions.`,
          ),
        );
      }

      yield* Effect.logInfo("Reviewdog is installed");
    } catch (error) {
      return yield* Effect.fail(new Error(error?.toString()));
    }
  });

/**
 * Runs reviewdog on a specific file
 */
const run = (
  checkstyleFile: string,
  github_token: string,
  name: string,
  reporter: string,
  level: string,
  reviewdogFlags?: string,
) =>
  Effect.gen(function* () {
    // Create arguments for reviewdog
    const args = [
      "-f=checkstyle",
      `-name=${name}`,
      `-reporter=${reporter}`,
      `-level=${level}`,
    ];

    // Add optional flags if provided
    if (reviewdogFlags) {
      reviewdogFlags
        .split(" ")
        .filter(flag => flag.trim() !== "")
        .forEach(flag => {
          args.push(flag);
        });
    }

    yield* Effect.logInfo(
      `Running reviewdog with args: ${String(args.join(" "))}`,
    );
    const fs = yield* FileSystem.FileSystem;
    const executor = yield* CommandExecutor.CommandExecutor;

    // Create the command with reviewdog
    const command = Command.make("reviewdog", ...args).pipe(
      Command.stdin("pipe"),
      Command.stdout("inherit"),
      // Command.stderr("inherit"),
      Command.env({
        REVIEWDOG_GITHUB_API_TOKEN: github_token,
      }),
    );

    const process = yield* executor.start(command);

    const stdout = yield* Stream.decodeText(process.stdout).pipe(
      Stream.map(line => `reviewdog: stdout: ${line}`),
      Stream.catchAll(err =>
        Stream.make(`reviewdog: unable to capture stdout ${err.message}`),
      ),
      Stream.tap(Effect.logInfo),
      Stream.runCollect,
      Effect.fork,
    );

    const stderr = yield* Stream.decodeText(process.stderr).pipe(
      Stream.map(line => `reviewdog: stderr: ${line}`),
      Stream.catchAll(err =>
        Stream.make(`reviewdog: unable to capture stderr ${err.message}`),
      ),
      Stream.tap(Effect.logError),
      Stream.runCollect,
      Effect.fork,
    );

    const fileStream = fs.stream(checkstyleFile);
    yield* Stream.run(fileStream, process.stdin);

    yield* Fiber.awaitAll([stdout, stderr]);

    const exitCode = yield* process.exitCode;
    if (exitCode != 0) {
      yield* Effect.fail(
        new Error(
          `reviewdog exited with non-zero code: ${exitCode}. Please inspect reviewdog logs above`,
        ),
      );
    }
  });

export const ReviewDog = Context.GenericTag<ReviewDog>("ActionReviewDog");

/**
 * Direct implementation of the ActionReviewDog interface with ActionsIOService provided
 */
const impl: ReviewDog = {
  ensureInstalled: ensureInstalled,
  run: run,
};

export const layer: Layer.Layer<ReviewDog> = Layer.succeed(ReviewDog, impl);

export function makeNoop(impl: Partial<ReviewDog> = {}): ReviewDog {
  return {
    ensureInstalled: () => Effect.fail(new Error("not implemented")),
    run: () => Effect.fail(new Error("not implemented")),
    ...impl,
  };
}

export function makeMock(mock: Partial<ReviewDog> = {}): ReviewDog {
  return {
    ...impl,
    ...mock,
  };
}

export function layerNoop(
  impl: Partial<ReviewDog> = {},
): Layer.Layer<ReviewDog> {
  return Layer.succeed(ReviewDog, makeNoop(impl));
}

export function layerMock(
  mock: Partial<ReviewDog> = {},
): Layer.Layer<ReviewDog> {
  return Layer.succeed(ReviewDog, makeMock(mock));
}
