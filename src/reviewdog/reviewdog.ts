import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { Context, Effect, Layer, Stream } from "effect";

import { IOService } from "../effects/actions";

/**
 * Interface for the ReviewDog functionality
 */
export interface ReviewDog {
  ensureInstalled(): Effect.Effect<void, Error, IOService.IOService>;

  run(
    checkstyleFile: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
  ): Effect.Effect<
    void,
    Error | PlatformError,
    CommandExecutor.CommandExecutor | FileSystem.FileSystem
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

      yield* Effect.logDebug("Reviewdog is installed");
    } catch (error) {
      return yield* Effect.fail(new Error(error?.toString()));
    }
  });

/**
 * Runs reviewdog on a specific file
 */
const run = (
  checkstyleFile: string,
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

    yield* Effect.logDebug(
      `Running reviewdog with args: ${String(args.join(" "))}`,
    );
    const fs = yield* FileSystem.FileSystem;
    const executor = yield* CommandExecutor.CommandExecutor;

    // Create the command with reviewdog
    const command = Command.make("reviewdog", ...args).pipe(
      Command.stdin("pipe"),
      Command.stdout("inherit"),
      Command.stderr("inherit"),
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const process = yield* executor.start(command);
        const fileStream = fs.stream(checkstyleFile);
        yield* Stream.run(fileStream, process.stdin);
        yield* Effect.mapError(process.exitCode, err => new Error(err.message));
      }),
    );
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
