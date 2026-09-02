import { spawn } from "child_process";
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

export function isDeliveryFailure(output: string): boolean {
  return DELIVERY_FAILURE_PATTERNS.some(pattern => pattern.test(output));
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
        throw new ReviewDogDeliveryError(exitCode, stderr.trim());
      }
      throw new Error(
        `reviewdog exited with non-zero code: ${exitCode}. Please inspect reviewdog logs above`,
      );
    }
  }
}
