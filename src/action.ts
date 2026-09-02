import { Annotations } from "@/src/annotations";
import { FileSystem } from "@/src/fs";
import { Git } from "@/src/git";
import { Inputs } from "@/src/inputs/inputs";
import { ReviewDog, ReviewDogDeliveryError } from "@/src/reviewdog";
import { Summary } from "@/src/summary";
import { XmlConverter } from "@/src/xml-converter";

import { Logger } from "./logger";

/**
 * reviewdog fetches the pull request diff before it looks at -filter-mode, so
 * under `nofilter` the diff is downloaded only to be discarded. Past 300
 * changed files GitHub's diff API answers 406 and reviewdog falls back to
 * `git fetch`, which fails outright on a checkout made with
 * `persist-credentials: false`.
 *
 * When the checkout already has full history there is nothing to fetch, so we
 * ask reviewdog to skip it. See reviewdog/reviewdog#2150 and #2187.
 */
async function skipGitFetchEnv(
  git: Git,
  logger: Logger,
): Promise<Record<string, string>> {
  if (process.env.REVIEWDOG_SKIP_GIT_FETCH) {
    return {};
  }
  if (!(await git.hasFullHistory())) {
    return {};
  }
  logger.info(
    "Checkout has full history; setting REVIEWDOG_SKIP_GIT_FETCH=true " +
      "so reviewdog resolves the diff locally.",
  );
  return { REVIEWDOG_SKIP_GIT_FETCH: "true" };
}

export async function runAction(
  inputs: Inputs,
  fileSystem: FileSystem,
  xmlConverter: XmlConverter,
  reviewDog: ReviewDog,
  logger: Logger,
  git: Git,
  annotations: Annotations,
  summary: Summary,
): Promise<void> {
  logger.info("Running android-lint-action");

  logger.info(`Converting ${inputs.lint_xml_file} to Checkstyle format...`);
  const report = await xmlConverter.convertLintToCheckstyle(
    inputs.lint_xml_file,
  );
  logger.info("Conversion completed");

  await reviewDog.ensureInstalled();

  const extraEnv = await skipGitFetchEnv(git, logger);

  try {
    await reviewDog.run(
      report.checkstyleXml,
      inputs.github_token,
      "Android Lint",
      inputs.reporter,
      inputs.level,
      inputs.reviewdog_flags,
      extraEnv,
    );
  } catch (error: unknown) {
    if (!(error instanceof ReviewDogDeliveryError)) {
      throw error;
    }

    // The findings themselves are intact -- only delivery through the API
    // failed. Report them as workflow annotations instead of failing the job
    // over a transport problem.
    logger.error(
      `Could not report through reviewdog: ${error.message}\n` +
        "Falling back to workflow annotations.",
    );
    annotations.report(report.issues);
    if (summary.isAvailable()) {
      await summary.write(
        report.issues,
        "reviewdog could not post its report, so the issues below are " +
          "reported as workflow annotations instead.",
      );
    }
  }

  logger.info("Finished android-lint-action");
}
