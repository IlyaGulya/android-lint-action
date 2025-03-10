import { FileSystem } from "@/src/fs";
import { Inputs } from "@/src/inputs/inputs";
import { ReviewDog } from "@/src/reviewdog";
import { XmlConverter } from "@/src/xml-converter";

import { Logger } from "./logger";

export async function runAction(
  inputs: Inputs,
  fileSystem: FileSystem,
  xmlConverter: XmlConverter,
  reviewDog: ReviewDog,
  logger: Logger,
): Promise<void> {
  logger.info("Running android-lint-action");

  logger.info(`Converting ${inputs.lint_xml_file} to Checkstyle format...`);
  const checkstyleXml = await xmlConverter.convertLintToCheckstyle(
    inputs.lint_xml_file,
  );
  logger.info("Conversion completed");

  await reviewDog.ensureInstalled();

  await reviewDog.run(
    checkstyleXml,
    inputs.github_token,
    "Android Lint",
    inputs.reporter,
    inputs.level,
    inputs.reviewdog_flags,
  );

  logger.info("Finished android-lint-action");
}
