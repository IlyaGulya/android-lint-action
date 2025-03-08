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

    // Get temporary directory
    const tempDir = yield* fs.makeTempDirectoryScoped();

    const outputCheckstyleFile = path.join(tempDir, "output_checkstyle.xml");

    // Convert Android Lint XML to Checkstyle format
    yield* Effect.logInfo(
      `Converting ${inputs.lint_xml_file} to Checkstyle format...`,
    );

    yield* xmlConverter.convertLintToCheckstyle(
      inputs.lint_xml_file,
      outputCheckstyleFile,
    );

    yield* Effect.logInfo("Conversion completed");

    // Check if reviewdog is installed
    yield* reviewDog.ensureInstalled();

    // Run reviewdog
    yield* reviewDog.run(
      outputCheckstyleFile,
      inputs.github_token,
      "Android Lint",
      inputs.reporter,
      inputs.level,
      inputs.reviewdog_flags,
    );

    yield* Effect.logInfo("Finished android-lint-action");
  });
}
