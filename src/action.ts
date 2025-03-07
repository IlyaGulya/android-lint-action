import path from "node:path";

import { FileSystem } from "@effect/platform/FileSystem";
import { Context, Effect } from "effect";

import { XmlConverter } from "@/src/xml-converter";

import { Inputs } from "./inputs/inputs";
import { Outputs } from "./outputs/outputs";
import { ReviewDog } from "./reviewdog";

export type ActionOutputs = Outputs;
export const ActionOutputs = Context.GenericTag<ActionOutputs>("ActionOutputs");

export function runAction(inputs: Inputs) {
  return Effect.gen(function* () {
    const reviewDog = yield* ReviewDog.ReviewDog;
    const xmlConverter = yield* XmlConverter.XmlConverter;
    const fs = yield* FileSystem;

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
