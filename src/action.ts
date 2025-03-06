import path from "node:path";

import { FileSystem } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { Context, Effect, pipe } from "effect";

import { Inputs } from "./inputs/inputs";
import { Outputs } from "./outputs/outputs";
import * as reviewdog from "./utils/reviewdog";
import { ActionReviewDog, ReviewDogTag } from "./utils/reviewdog";
import {
  convertLintToCheckstyle,
  getDefaultConfig,
} from "./utils/xml-converter";

export type ActionOutputs = Outputs;
export const ActionOutputs = Context.GenericTag<ActionOutputs>("ActionOutputs");

export interface ActionXmlConverter {
  convertLintToCheckstyle: (
    inputFilePath: string,
    outputFilePath: string,
  ) => Effect.Effect<void, Error | PlatformError, FileSystem.FileSystem>;
}

export const XmlConverterTag =
  Context.GenericTag<ActionXmlConverter>("ActionXmlConverter");

export function runAction(
  inputs: Inputs,
): Effect.Effect<
  void,
  Error | PlatformError,
  ActionOutputs | ActionReviewDog | ActionXmlConverter | FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const reviewDog = yield* ReviewDogTag;
    const xmlConverter = yield* XmlConverterTag;
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.logInfo("Running android-lint-action");

    // Set environment variable for reviewdog
    yield* Effect.sync(() => {
      process.env.REVIEWDOG_GITHUB_API_TOKEN = inputs.github_token;
    });

    // Set paths
    const workspacePath = process.env.RUNNER_WORKSPACE ?? "";
    const inputLintFile = path.join(workspacePath, inputs.lint_xml_file);

    // Get temporary directory
    const tempDir = yield* fs.makeTempDirectoryScoped();

    const outputCheckstyleFile = path.join(tempDir, "output_checkstyle.xml");

    // Convert Android Lint XML to Checkstyle format
    yield* Effect.logInfo(
      `Converting ${inputLintFile} to Checkstyle format...`,
    );

    yield* xmlConverter.convertLintToCheckstyle(
      inputLintFile,
      outputCheckstyleFile,
    );

    yield* Effect.logInfo("Conversion completed");

    // Check if reviewdog is installed
    yield* reviewDog.ensureInstalled();

    // Run reviewdog
    yield* reviewDog.run(
      outputCheckstyleFile,
      "Android Lint",
      inputs.reporter,
      inputs.level,
      inputs.reviewdog_flags,
    );

    yield* Effect.logInfo("Finished android-lint-action");
  });
}

// Run the Android Lint Action with the given inputs and dependencies
export function androidLint(
  inputs: Inputs,
  dependencies: {
    outputs: Outputs;
  },
) {
  const { outputs } = dependencies;

  // Directly provide services to the effect
  return pipe(
    runAction(inputs),
    Effect.provideService(ActionOutputs, outputs),
    Effect.provideService(ReviewDogTag, reviewdog.ReviewDogImplementation),
    Effect.provideService(XmlConverterTag, {
      convertLintToCheckstyle: (
        inputFilePath: string,
        outputFilePath: string,
      ) =>
        convertLintToCheckstyle(
          inputFilePath,
          outputFilePath,
          getDefaultConfig(),
        ),
    }),
  );
}
