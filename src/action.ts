import { Annotations } from "@/src/annotations";
import { FileSystem } from "@/src/fs";
import { Git } from "@/src/git";
import { Inputs } from "@/src/inputs/inputs";
import { ReviewDog, ReviewDogDeliveryError } from "@/src/reviewdog";
import { Summary } from "@/src/summary";
import { LintIssue, XmlConverter } from "@/src/xml-converter";

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

export interface RetryPolicy {
  /** Pause before each extra attempt; its length is the number of retries. */
  readonly delaysMs: readonly number[];
  sleep(ms: number): Promise<void>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  delaysMs: [5_000, 15_000],
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

/**
 * Runs reviewdog, running it again while it fails on a GitHub API error that
 * goes away on its own. Every attempt creates its own check run, and GitHub
 * shows the newest one for a given name.
 */
async function runReviewDogWithRetry(
  run: () => Promise<void>,
  retry: RetryPolicy,
  logger: Logger,
): Promise<void> {
  const attempts = retry.delaysMs.length + 1;
  for (let attempt = 1; ; attempt++) {
    try {
      await run();
      return;
    } catch (error: unknown) {
      if (
        !(error instanceof ReviewDogDeliveryError) ||
        !error.transient ||
        attempt === attempts
      ) {
        throw error;
      }
      const delay = retry.delaysMs[attempt - 1];
      logger.info(
        `reviewdog hit a transient GitHub API error (attempt ${attempt}/${attempts}); ` +
          `retrying in ${delay / 1000}s.`,
      );
      await retry.sleep(delay);
    }
  }
}

/** Value of a Go-style flag: `-name=v`, `--name=v`, `-name v` or `--name v`. */
function flagValue(tokens: string[], name: string): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    for (const prefix of [`-${name}`, `--${name}`]) {
      if (token.startsWith(`${prefix}=`)) {
        return token.slice(prefix.length + 1);
      }
      if (token === prefix) {
        return tokens[i + 1];
      }
    }
  }
  return undefined;
}

/** Severity order used by reviewdog's -fail-level. */
function severityRank(severity: string | undefined): number {
  switch ((severity ?? "").toLowerCase()) {
    case "fatal":
    case "error":
      return 3;
    case "warning":
      return 2;
    default:
      return 1;
  }
}

const FAIL_LEVEL_RANK: Partial<Record<string, number>> = {
  any: 0,
  info: 1,
  warning: 2,
  error: 3,
};

/**
 * reviewdog fails the job when an issue reaches -fail-level. The annotation
 * fallback must keep that, or a transport error would turn a real lint error
 * into a green check.
 *
 * Under a diff-based -filter-mode reviewdog only counts issues inside the
 * diff, which the fallback cannot see, so there it reports and does not fail.
 */
function enforceFailLevel(
  issues: LintIssue[],
  reviewdogFlags: string | undefined,
  logger: Logger,
): void {
  const tokens = (reviewdogFlags ?? "").split(/\s+/).filter(Boolean);
  const failLevel =
    flagValue(tokens, "fail-level") ??
    (tokens.some(t => /^--?fail-on-error(=true)?$/.test(t)) ? "any" : "none");
  const threshold = FAIL_LEVEL_RANK[failLevel.toLowerCase()];
  if (threshold === undefined) {
    return;
  }

  const blocking = issues.filter(i => severityRank(i.severity) >= threshold);
  if (blocking.length === 0) {
    return;
  }

  const filterMode = flagValue(tokens, "filter-mode") ?? "added";
  if (filterMode !== "nofilter") {
    logger.error(
      `${blocking.length} issue(s) reach -fail-level=${failLevel}, but ` +
        `-filter-mode=${filterMode} needs the diff to decide which of them ` +
        "count, so the job is not failed.",
    );
    return;
  }

  throw new Error(
    `Android Lint found ${blocking.length} issue(s) at -fail-level=${failLevel} ` +
      "or above. See the workflow annotations.",
  );
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
  retry: RetryPolicy = DEFAULT_RETRY_POLICY,
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
    await runReviewDogWithRetry(
      () =>
        reviewDog.run(
          report.checkstyleXml,
          inputs.github_token,
          "Android Lint",
          inputs.reporter,
          inputs.level,
          inputs.reviewdog_flags,
          extraEnv,
        ),
      retry,
      logger,
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
    enforceFailLevel(report.issues, inputs.reviewdog_flags, logger);
  }

  logger.info("Finished android-lint-action");
}
