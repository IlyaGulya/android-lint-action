import { appendFile } from "fs/promises";

import * as core from "@actions/core";

import { runAction } from "@/src/action";
import { AnnotationReporter } from "@/src/annotations";
import { NodeFileSystem } from "@/src/fs";
import { GitCli } from "@/src/git";
import { CoreInputs } from "@/src/inputs/core-inputs";
import { ActionsIOService } from "@/src/io";
import { ConsoleLogger } from "@/src/logger";
import { ReviewDogImpl } from "@/src/reviewdog";
import { StepSummary } from "@/src/summary";
import { XmlConverterImpl } from "@/src/xml-converter";

async function main(): Promise<void> {
  try {
    const inputs = new CoreInputs();
    const fileSystem = new NodeFileSystem();
    const ioService = new ActionsIOService();
    const logger = new ConsoleLogger();
    const xmlConverter = new XmlConverterImpl(fileSystem);
    const reviewDog = new ReviewDogImpl(ioService, logger);
    const git = new GitCli();
    const annotations = new AnnotationReporter(logger);
    const summary = new StepSummary((path, body) =>
      appendFile(path, body, "utf8"),
    );

    await runAction(
      inputs,
      fileSystem,
      xmlConverter,
      reviewDog,
      logger,
      git,
      annotations,
      summary,
    );
  } catch (error: unknown) {
    core.setFailed(error as Error);
  }
}

await main();
