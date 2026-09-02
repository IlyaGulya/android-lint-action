import { LintIssue } from "@/src/xml-converter";

export interface Summary {
  /** True when a summary can actually be written (i.e. running under Actions). */
  isAvailable(): boolean;

  write(issues: LintIssue[], reason: string): Promise<void>;
}

const MAX_ROWS = 50;

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export class StepSummary implements Summary {
  constructor(
    private appendFile: (path: string, body: string) => Promise<void>,
  ) {}

  isAvailable(): boolean {
    return Boolean(process.env.GITHUB_STEP_SUMMARY);
  }

  async write(issues: LintIssue[], reason: string): Promise<void> {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) {
      return;
    }

    const lines = ["### Android Lint", "", reason, ""];

    if (issues.length === 0) {
      lines.push("No issues reported.");
    } else {
      lines.push(
        `${issues.length} issue(s):`,
        "",
        "| Severity | Issue | Location | Message |",
        "| --- | --- | --- | --- |",
      );
      for (const issue of issues.slice(0, MAX_ROWS)) {
        const file = issue.location?.file ?? "";
        const line = issue.location?.line;
        const location = file ? `${file}${line ? `:${line}` : ""}` : "";
        lines.push(
          `| ${cell(issue.severity ?? "")} | ${cell(issue.id ?? "")} | ${cell(location)} | ${cell(issue.message ?? "")} |`,
        );
      }
      if (issues.length > MAX_ROWS) {
        lines.push("", `_… and ${issues.length - MAX_ROWS} more._`);
      }
    }

    await this.appendFile(path, `${lines.join("\n")}\n`);
  }
}
