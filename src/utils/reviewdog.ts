import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { Context, Effect, Stream } from "effect";

import { IOService } from "../effects/actions";

/**
 * Interface for the ReviewDog functionality
 */
export interface ActionReviewDog {
  ensureInstalled(): Effect.Effect<void, Error, IOService>;

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

export const IOServiceContext = Context.GenericTag<IOService>("IOService");

/**
 * Checks if reviewdog is installed
 */
const ensureInstalled = () =>
  Effect.gen(function* () {
    const ioService = yield* IOServiceContext;

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

export const ReviewDogTag =
  Context.GenericTag<ActionReviewDog>("ActionReviewDog");

/**
 * Direct implementation of the ActionReviewDog interface with ActionsIOService provided
 */
export const ReviewDogImplementation: ActionReviewDog = {
  ensureInstalled: ensureInstalled,
  run: run,
};
