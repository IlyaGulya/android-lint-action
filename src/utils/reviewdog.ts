import { exec as nodeExec } from "node:child_process";
import { promisify } from "node:util";

import * as core from "@actions/core";
import * as io from "@actions/io";

const execAsync = promisify(nodeExec);

export class ReviewDog {
  private reviewdogPath: string | undefined = undefined;

  async checkInstalled(): Promise<boolean> {
    try {
      // Try to find reviewdog in PATH
      this.reviewdogPath = await io.which("reviewdog", false);
      return this.reviewdogPath !== "";
    } catch (error) {
      core.debug(
        `Failed to find reviewdog: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async run(
    checkstyleFile: string,
    name: string,
    reporter: string,
    level: string,
    reviewdogFlags?: string,
  ): Promise<void> {
    const command = `reviewdog -f=checkstyle -name=${name} -reporter=${reporter} -level=${level}${reviewdogFlags ? ` ${reviewdogFlags}` : ""} < ${checkstyleFile}`;
    await execAsync(command);
  }
}
