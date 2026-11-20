import { execFile, spawn } from "child_process";
import { Readable } from "stream";

import { IOService } from "@/src/io";

import { Logger } from "./logger";

/**
 * Raised when reviewdog could not deliver the report at all -- a diff fetch,
 * network or API failure -- as opposed to exiting non-zero because lint found
 * something. Callers may fall back to another reporter instead of failing.
 */
export class ReviewDogDeliveryError extends Error {
  constructor(
    readonly exitCode: number,
    readonly detail: string,
    /** True when the same call may succeed if it is simply made again. */
    readonly transient = false,
  ) {
    super(
      `reviewdog could not deliver the report (exit ${exitCode}): ${detail}`,
    );
    this.name = "ReviewDogDeliveryError";
  }
}

/**
 * reviewdog exits 1 both for "found issues" and for "could not run", so the
 * exit code alone cannot tell them apart. These are the failures that mean the
 * report never reached GitHub, and for which retrying via annotations helps.
 */
const DELIVERY_FAILURE_PATTERNS: readonly RegExp[] = [
  /fail to get diff/i,
  /failed to run git (fetch|diff)/i,
  /could not read Username/i,
  /the diff exceeded the maximum number of files/i,
  /fail to parse diff/i,
];

/**
 * GitHub API failures that go away on their own. go-github formats an API
 * error as `METHOD URL: STATUS TEXT`.
 *
 * The 404 is the one seen in practice: GitHub creates a check run and, under
 * replication lag, answers 404 when reviewdog updates it a moment later.
 * reviewdog retries that itself since v0.21.3, but older binaries do not.
 */
const TRANSIENT_DELIVERY_FAILURE_PATTERNS: readonly RegExp[] = [
  /\b(?:GET|POST|PATCH|PUT) https:\/\/\S+: (?:404|429|5\d\d) /,
  /secondary rate limit/i,
  /connection reset by peer|i\/o timeout|TLS handshake timeout|unexpected EOF/i,
];

export function isTransientDeliveryFailure(output: string): boolean {
  return TRANSIENT_DELIVERY_FAILURE_PATTERNS.some(pattern =>
    pattern.test(output),
  );
}

export function isDeliveryFailure(output: string): boolean {
  return (
    isTransientDeliveryFailure(output) ||
    DELIVERY_FAILURE_PATTERNS.some(pattern => pattern.test(output))
  );
}

export interface ReviewDog {
  ensureInstalled(): Promise<void>;

  run(
    checkstyleXml: string,
    github_token: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
    extraEnv?: Record<string, string>,
  ): Promise<void>;
}

export class ReviewDogImpl implements ReviewDog {
  constructor(
    private ioService: IOService,
    private logger: Logger,
  ) {}

  async ensureInstalled(): Promise<void> {
    const path = await this.ioService.which("reviewdog", false);
    if (!path) {
      throw new Error(
        "Reviewdog is not installed. Please install it before running this action.\n" +
          'We recommend using "reviewdog/action-setup" GitHub Action.\n' +
          "See README.md for installation instructions.",
      );
    }
    this.logger.info("Reviewdog is installed");
    // Whether a transport failure is retried inside reviewdog depends on its
    // version, so record it next to the failure.
    const version = await this.readVersion(path);
    if (version) {
      this.logger.info(`reviewdog version: ${version}`);
    }
  }

  private readVersion(path: string): Promise<string | undefined> {
    return new Promise(resolve => {
      execFile(path, ["-version"], { timeout: 10_000 }, (error, stdout) => {
        resolve(error ? undefined : stdout.trim() || undefined);
      });
    });
  }

  async run(
    checkstyleXml: string,
    github_token: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
    extraEnv?: Record<string, string>,
  ): Promise<void> {
    const args = [
      "-f=checkstyle",
      `-name=${name}`,
      `-reporter=${reporter}`,
      `-level=${level}`,
    ];

    if (reviewdogFlags) {
      args.push(
        ...reviewdogFlags.split(" ").filter(flag => flag.trim() !== ""),
      );
    }

    this.logger.info(`Running reviewdog with args: ${args.join(" ")}`);

    const env = {
      ...process.env,
      ...extraEnv,
      REVIEWDOG_GITHUB_API_TOKEN: github_token,
    };

    // stderr is piped rather than inherited so we can classify the failure,
    // and echoed straight back out so it still shows up in the job log.
    const child = spawn("reviewdog", args, {
      env,
      stdio: ["pipe", "inherit", "pipe"],
    });
    const fileStream = Readable.from(checkstyleXml);
    fileStream.pipe(child.stdin);

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("close", code => {
        resolve(code ?? 1);
      });
      child.on("error", err => {
        reject(err);
      });
    });

    if (exitCode !== 0) {
      if (isDeliveryFailure(stderr)) {
        throw new ReviewDogDeliveryError(
          exitCode,
          stderr.trim(),
          isTransientDeliveryFailure(stderr),
        );
      }
      throw new Error(
        `reviewdog exited with non-zero code: ${exitCode}. Please inspect reviewdog logs above`,
      );
    }
  }
}
