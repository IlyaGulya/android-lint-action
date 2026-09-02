import { LintIssue } from "@/src/xml-converter";

import { Logger } from "./logger";

/**
 * Maps Android Lint severities onto the two workflow-command levels GitHub
 * renders. Lint's "fatal" and "error" are errors; everything else is a warning.
 */
function commandFor(severity: string | undefined): "error" | "warning" {
  const normalized = (severity ?? "").toLowerCase();
  return normalized === "error" || normalized === "fatal" ? "error" : "warning";
}

/** Escapes a workflow command property value. See GitHub's workflow-command docs. */
function escapeProperty(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

/** Escapes a workflow command message body. */
function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export interface Annotations {
  report(issues: LintIssue[]): void;
}

/**
 * Reports issues as GitHub Actions workflow commands.
 *
 * These surface in the job log and, for files touched by the PR, inline in the
 * diff. Unlike the reviewdog reporters this needs no API call and no diff, so
 * it still works when reporting through the API is impossible.
 */
export class AnnotationReporter implements Annotations {
  constructor(private logger: Logger) {}

  report(issues: LintIssue[]): void {
    for (const issue of issues) {
      const command = commandFor(issue.severity);
      const props: string[] = [];

      const file = issue.location?.file;
      if (file) {
        props.push(`file=${escapeProperty(file)}`);
      }
      if (issue.location?.line !== undefined) {
        props.push(`line=${issue.location.line}`);
      }
      if (issue.location?.column !== undefined) {
        props.push(`col=${issue.location.column}`);
      }
      if (issue.id) {
        props.push(`title=${escapeProperty(issue.id)}`);
      }

      const suffix = props.length > 0 ? ` ${props.join(",")}` : "";
      this.logger.info(
        `::${command}${suffix}::${escapeData(issue.message ?? "")}`,
      );
    }
  }
}
