import { afterEach, describe, expect, it, vi } from "vitest";

import { StepSummary } from "@/src/summary";
import { LintIssue } from "@/src/xml-converter";

describe("StepSummary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const issue = (n: number): LintIssue => ({
    id: `Issue${n}`,
    message: `message ${n}`,
    severity: "warning",
    location: { file: `File${n}.kt`, line: n },
  });

  it("is unavailable outside GitHub Actions", () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "");
    expect(new StepSummary(vi.fn()).isAvailable()).toBe(false);
  });

  it("is available when Actions provides a summary file", () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/summary.md");
    expect(new StepSummary(vi.fn()).isAvailable()).toBe(true);
  });

  it("writes a table of issues to the summary file", async () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/summary.md");
    const appendFile = vi.fn().mockResolvedValue(undefined);

    await new StepSummary(appendFile).write([issue(1)], "why this happened");

    const [path, body] = appendFile.mock.calls[0] as [string, string];
    expect(path).toBe("/tmp/summary.md");
    expect(body).toContain("why this happened");
    expect(body).toContain("| warning | Issue1 | File1.kt:1 | message 1 |");
  });

  it("caps the table and notes how many rows were dropped", async () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/summary.md");
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const issues = Array.from({ length: 55 }, (_, i) => issue(i));

    await new StepSummary(appendFile).write(issues, "reason");

    const body = (appendFile.mock.calls[0] as [string, string])[1];
    expect(body).toContain("55 issue(s)");
    expect(body).toContain("and 5 more");
  });

  it("escapes pipes so they cannot break the table", async () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/summary.md");
    const appendFile = vi.fn().mockResolvedValue(undefined);

    await new StepSummary(appendFile).write(
      [{ ...issue(1), message: "a | b" }],
      "reason",
    );

    const body = (appendFile.mock.calls[0] as [string, string])[1];
    expect(body).toContain("a \\| b");
  });

  it("says so when there are no issues", async () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/summary.md");
    const appendFile = vi.fn().mockResolvedValue(undefined);

    await new StepSummary(appendFile).write([], "reason");

    const body = (appendFile.mock.calls[0] as [string, string])[1];
    expect(body).toContain("No issues reported.");
  });

  it("does not write when Actions provided no summary file", async () => {
    vi.stubEnv("GITHUB_STEP_SUMMARY", "");
    const appendFile = vi.fn().mockResolvedValue(undefined);

    await new StepSummary(appendFile).write([issue(1)], "reason");

    expect(appendFile).not.toHaveBeenCalled();
  });
});
