import * as os from "node:os";
import path from "node:path";

import * as core from "@actions/core";

import { Inputs } from "./inputs/inputs";
import { Logger } from "./logger/logger";
import { Outputs } from "./outputs/outputs";
import { ReviewDog } from "./utils/reviewdog";
import { XmlConverter } from "./utils/xml-converter";

export class Action {
  private readonly logger;
  private readonly outputs;
  private readonly reviewDogFactory: () => ReviewDog;
  private readonly xmlConverterFactory: () => XmlConverter;
  private readonly workspacePath: string;
  private readonly repoName: string;
  private readonly outputPath: string;

  constructor(dependencies: {
    logger: Logger;
    outputs: Outputs;
    reviewDogFactory?: () => ReviewDog;
    xmlConverterFactory?: () => XmlConverter;
  }) {
    this.logger = dependencies.logger;
    this.outputs = dependencies.outputs;
    this.reviewDogFactory =
      dependencies.reviewDogFactory ?? (() => new ReviewDog());
    this.xmlConverterFactory =
      dependencies.xmlConverterFactory ?? (() => new XmlConverter());
    this.workspacePath = process.env.RUNNER_WORKSPACE ?? "";
    this.repoName = process.env.GITHUB_REPOSITORY ?? "";
    this.outputPath = process.env.GITHUB_OUTPUT ?? "";
  }

  async run(inputs: Inputs) {
    try {
      this.logger.info("Running android-lint-action");

      // Set environment variable for reviewdog
      process.env.REVIEWDOG_GITHUB_API_TOKEN = inputs.github_token;

      // Set paths
      const inputLintFile = path.join(this.workspacePath, inputs.lint_xml_file);
      const outputCheckstyleFile = path.join(
        os.tmpdir(),
        "output_checkstyle.xml",
      );

      // Convert Android Lint XML to Checkstyle format
      this.logger.info(`Converting ${inputLintFile} to Checkstyle format...`);
      const xmlConverter = this.xmlConverterFactory();
      await xmlConverter.convertLintToCheckstyle(
        inputLintFile,
        outputCheckstyleFile,
      );
      this.logger.info("Conversion completed");

      // Check if reviewdog is installed
      const reviewdog = this.reviewDogFactory();
      const isReviewdogInstalled = await reviewdog.checkInstalled();

      if (!isReviewdogInstalled) {
        const errorMsg =
          `Reviewdog is not installed. Please install it before running this action.\n` +
          `We recommend using 'reviewdog/action-setup' GitHub Action.\n` +
          `See README.md for installation instructions.`;
        this.logger.error(errorMsg);
        core.setFailed(errorMsg);
        return;
      }

      // Run reviewdog
      await reviewdog.run(
        outputCheckstyleFile,
        "Android Lint",
        inputs.reporter,
        inputs.level,
        inputs.reviewdog_flags,
      );

      this.logger.info("Finished android-lint-action");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error: ${errorMessage}`);
      core.setFailed(errorMessage);
    }
  }
}
