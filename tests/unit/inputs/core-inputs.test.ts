import * as core from "@actions/core";
import { Mock, vi } from "vitest";

import { CoreInputs } from "@/src/inputs/core-inputs";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
}));

describe("CoreInputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("github_token", () => {
    it('should return the value of "github_token" input', () => {
      const expectedToken = "gh-token";
      (core.getInput as Mock).mockReturnValueOnce(expectedToken);

      const inputs = new CoreInputs();
      const token = inputs.github_token;

      expect(token).toBe(expectedToken);
      expect(core.getInput).toHaveBeenCalledWith("github_token", {
        required: true,
      });
    });
  });

  describe("lint_xml_file", () => {
    it('should return the value of "lint_xml_file" input', () => {
      const expectedFile = "path/to/lint.xml";
      (core.getInput as Mock).mockReturnValueOnce(expectedFile);

      const inputs = new CoreInputs();
      const file = inputs.lint_xml_file;

      expect(file).toBe(expectedFile);
      expect(core.getInput).toHaveBeenCalledWith("lint_xml_file", {
        required: true,
      });
    });
  });

  describe("reporter", () => {
    it('should return the value of "reporter" input', () => {
      const expectedReporter = "github-pr-review";
      (core.getInput as Mock).mockReturnValueOnce(expectedReporter);

      const inputs = new CoreInputs();
      const reporter = inputs.reporter;

      expect(reporter).toBe(expectedReporter);
      expect(core.getInput).toHaveBeenCalledWith("reporter");
    });

    it('should return default value if "reporter" input is not set', () => {
      (core.getInput as Mock).mockReturnValueOnce("");

      const inputs = new CoreInputs();
      const reporter = inputs.reporter;

      expect(reporter).toBe("github-pr-check");
      expect(core.getInput).toHaveBeenCalledWith("reporter");
    });
  });

  describe("level", () => {
    it('should return the value of "level" input', () => {
      const expectedLevel = "error";
      (core.getInput as Mock).mockReturnValueOnce(expectedLevel);

      const inputs = new CoreInputs();
      const level = inputs.level;

      expect(level).toBe(expectedLevel);
      expect(core.getInput).toHaveBeenCalledWith("level");
    });

    it('should return default value if "level" input is not set', () => {
      (core.getInput as Mock).mockReturnValueOnce("");

      const inputs = new CoreInputs();
      const level = inputs.level;

      expect(level).toBe("warning");
      expect(core.getInput).toHaveBeenCalledWith("level");
    });
  });

  describe("reviewdog_flags", () => {
    it('should return the value of "reviewdog_flags" input', () => {
      const expectedFlags = "--diff";
      (core.getInput as Mock).mockReturnValueOnce(expectedFlags);

      const inputs = new CoreInputs();
      const flags = inputs.reviewdog_flags;

      expect(flags).toBe(expectedFlags);
      expect(core.getInput).toHaveBeenCalledWith("reviewdog_flags");
    });

    it('should return undefined if "reviewdog_flags" input is not set', () => {
      (core.getInput as Mock).mockReturnValueOnce("");

      const inputs = new CoreInputs();
      const flags = inputs.reviewdog_flags;

      expect(flags).toBeUndefined();
      expect(core.getInput).toHaveBeenCalledWith("reviewdog_flags");
    });
  });
});
