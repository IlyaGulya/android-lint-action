import * as core from "@actions/core";

import { runAction } from "@/src/action";
import { NodeFileSystem } from "@/src/fs";
import { CoreInputs } from "@/src/inputs/core-inputs";
import { ActionsIOService } from "@/src/io";
import { ConsoleLogger } from "@/src/logger";
import { ReviewDogImpl } from "@/src/reviewdog";
import { XmlConverterImpl } from "@/src/xml-converter";

async function main(): Promise<void> {
  try {
    const inputs = new CoreInputs();
    const fileSystem = new NodeFileSystem();
    const ioService = new ActionsIOService();
    const logger = new ConsoleLogger();
    const xmlConverter = new XmlConverterImpl(fileSystem);
    const reviewDog = new ReviewDogImpl(ioService, logger);

    await runAction(inputs, fileSystem, xmlConverter, reviewDog, logger);
  } catch (error: unknown) {
    core.setFailed(error as Error);
  }
}

await main();
