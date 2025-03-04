import * as fs from "node:fs";

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewDog } from "@/src/utils/reviewdog";

// Mock the @actions/io and @actions/core modules
vi.mock("@actions/io");
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("fs");

describe("ReviewDog", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default mock for which
    vi.mocked(io.which).mockResolvedValue("");
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(""));
    vi.mocked(exec.exec).mockResolvedValue(0);

    // Mock core.info
    vi.spyOn(core, "info").mockImplementation((message: string) => {
      // Log message for debugging purposes
      process.stdout.write(message + "\n");
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkInstalled", () => {
    it("returns true when reviewdog is installed", async () => {
      // Mock the which method to return a path
      vi.mocked(io.which).mockResolvedValue("/usr/local/bin/reviewdog");

      const reviewdog = new ReviewDog();
      const result = await reviewdog.checkInstalled();

      expect(result).toBe(true);
      expect(io.which).toHaveBeenCalledWith("reviewdog", false);
    });

    it("returns false when reviewdog is not installed", async () => {
      // Mock the which method to return an empty string
      vi.mocked(io.which).mockResolvedValue("");

      const reviewdog = new ReviewDog();
      const result = await reviewdog.checkInstalled();

      expect(result).toBe(false);
      expect(io.which).toHaveBeenCalledWith("reviewdog", false);
    });

    it("returns false when an error occurs checking for reviewdog", async () => {
      // Mock the which method to throw an error
      vi.mocked(io.which).mockRejectedValue(new Error("Command not found"));
      vi.mocked(core.debug).mockImplementation(() => {});

      const reviewdog = new ReviewDog();
      const result = await reviewdog.checkInstalled();

      expect(result).toBe(false);
      expect(io.which).toHaveBeenCalledWith("reviewdog", false);
      expect(core.debug).toHaveBeenCalledWith(
        expect.stringContaining("Failed to find reviewdog"),
      );
    });
  });

  describe("run", () => {
    it("throws an error when reviewdog is not installed", async () => {
      const reviewdog = new ReviewDog();

      await expect(
        reviewdog.run("file.xml", "tool", "reporter", "level"),
      ).rejects.toThrow("Reviewdog is not installed");
    });

    it("runs reviewdog when it is installed", async () => {
      // Set up a mock path for reviewdog
      const reviewdog = new ReviewDog();
      vi.mocked(io.which).mockResolvedValue("/usr/local/bin/reviewdog");

      // First, call checkInstalled to set the path
      await reviewdog.checkInstalled();

      // Then run reviewdog
      await reviewdog.run("file.xml", "tool", "reporter", "level");

      // Verify reviewdog was executed with correct arguments
      expect(exec.exec).toHaveBeenCalledWith(
        "/usr/local/bin/reviewdog",
        expect.arrayContaining([
          "-f=checkstyle",
          "-name=tool",
          "-reporter=reporter",
          "-level=level",
        ]),
        expect.anything(),
      );
    });
  });
});
