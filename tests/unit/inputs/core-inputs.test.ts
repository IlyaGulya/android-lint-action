import { beforeEach, describe, expect, it, vi } from "vitest";

import { CoreInputs } from "@/src/inputs/core-inputs";

// Mock @actions/core module
vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
}));

// Import after mocking
import * as core from "@actions/core";

describe("CoreInputs", () => {
  const mockGetInput = core.getInput as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("github_token", () => {
    it("should return the value of 'github_token' input", () => {
      // Setup mock
      mockGetInput.mockReturnValueOnce("gh-token");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.github_token).toBe("gh-token");
      expect(mockGetInput).toHaveBeenCalledWith("github_token", {
        required: true,
      });
    });
  });

  describe("lint_xml_file", () => {
    it("should return the value of 'lint_xml_file' input", () => {
      // Setup mock
      mockGetInput.mockReturnValueOnce("path/to/lint.xml");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.lint_xml_file).toBe("path/to/lint.xml");
      expect(mockGetInput).toHaveBeenCalledWith("lint_xml_file", {
        required: true,
      });
    });
  });

  describe("reporter", () => {
    it("should return the value of 'reporter' input", () => {
      // Setup mock
      mockGetInput.mockReturnValueOnce("github-pr-check");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.reporter).toBe("github-pr-check");
      expect(mockGetInput).toHaveBeenCalledWith("reporter");
    });

    it("should return default value if 'reporter' input is not set", () => {
      // Setup mock to return empty string
      mockGetInput.mockReturnValueOnce("");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.reporter).toBe("github-pr-check");
      expect(mockGetInput).toHaveBeenCalledWith("reporter");
    });
  });

  describe("level", () => {
    it("should return the value of 'level' input", () => {
      // Setup mock
      mockGetInput.mockReturnValueOnce("error");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.level).toBe("error");
      expect(mockGetInput).toHaveBeenCalledWith("level");
    });

    it("should return default value if 'level' input is not set", () => {
      // Setup mock to return empty string
      mockGetInput.mockReturnValueOnce("");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.level).toBe("warning");
      expect(mockGetInput).toHaveBeenCalledWith("level");
    });
  });

  describe("reviewdog_flags", () => {
    it("should return the value of 'reviewdog_flags' input", () => {
      // Setup mock
      mockGetInput.mockReturnValueOnce("--diff");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.reviewdog_flags).toBe("--diff");
      expect(mockGetInput).toHaveBeenCalledWith("reviewdog_flags");
    });

    it("should return undefined if 'reviewdog_flags' input is not set", () => {
      // Setup mock to return empty string
      mockGetInput.mockReturnValueOnce("");

      // Create inputs and test
      const inputs = new CoreInputs();
      expect(inputs.reviewdog_flags).toBeUndefined();
      expect(mockGetInput).toHaveBeenCalledWith("reviewdog_flags");
    });
  });
});
