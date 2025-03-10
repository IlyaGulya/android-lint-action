import { spawn } from "child_process";
import { Readable } from "stream";

import { IOService } from "@/src/io";

import { Logger } from "./logger";

export interface ReviewDog {
  ensureInstalled(): Promise<void>;

  run(
    checkstyleXml: string,
    github_token: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
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
      REVIEWDOG_GITHUB_API_TOKEN: github_token,
    };

    const child = spawn("reviewdog", args, {
      env,
      stdio: ["pipe", "inherit", "inherit"],
    });
    const fileStream = Readable.from(checkstyleXml);
    fileStream.pipe(child.stdin);

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("close", code => {
        resolve(code ?? 1);
      });
      child.on("error", err => {
        reject(err);
      });
    });

    if (exitCode !== 0) {
      throw new Error(
        `reviewdog exited with non-zero code: ${exitCode}. Please inspect reviewdog logs above`,
      );
    }
  }
}
