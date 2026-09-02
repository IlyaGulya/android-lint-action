import { describe, expect, it, vi } from "vitest";

import { AnnotationReporter } from "@/src/annotations";
import { Logger } from "@/src/logger";
import { LintIssue } from "@/src/xml-converter";

describe("AnnotationReporter", () => {
  const reportWith = (issues: LintIssue[]): string[] => {
    const lines: string[] = [];
    const logger: Logger = {
      info: (message: string) => lines.push(message),
      error: vi.fn(),
    };
    new AnnotationReporter(logger).report(issues);
    return lines;
  };

  it("emits a warning command for warning severity", () => {
    const [line] = reportWith([
      {
        id: "UnusedResources",
        message: "Unused resource",
        severity: "warning",
        location: { file: "app/res/values/strings.xml", line: 4, column: 2 },
      },
    ]);

    expect(line).toBe(
      "::warning file=app/res/values/strings.xml,line=4,col=2,title=UnusedResources::Unused resource",
    );
  });

  it("maps error and fatal severities onto the error command", () => {
    const lines = reportWith([
      { id: "A", message: "m", severity: "error", location: { file: "f.kt" } },
      { id: "B", message: "m", severity: "fatal", location: { file: "f.kt" } },
    ]);

    expect(lines.every(line => line.startsWith("::error "))).toBe(true);
  });

  it("escapes characters that would break the command syntax", () => {
    const [line] = reportWith([
      {
        id: "X",
        message: "first\nsecond, 50% done",
        severity: "warning",
        location: { file: "a:b.kt", line: 1 },
      },
    ]);

    expect(line).toContain("file=a%3Ab.kt");
    expect(line).toContain("::first%0Asecond, 50%25 done");
  });

  it("omits location properties that lint did not provide", () => {
    const [line] = reportWith([
      { id: "X", message: "m", severity: "warning", location: {} },
    ]);

    expect(line).toBe("::warning title=X::m");
  });

  it("reports nothing for an empty report", () => {
    expect(reportWith([])).toEqual([]);
  });
});
