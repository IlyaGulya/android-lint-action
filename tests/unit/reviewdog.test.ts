import { describe, expect, it, vi } from "vitest";

import { Logger } from "@/src/logger";
import { ReviewDogImpl } from "@/src/reviewdog";

// Use a type-safe mock implementation
type CloseCallback = (code: number) => void;

// Mock the child_process module
vi.mock("child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    stdin: { write: vi.fn() },
    on: vi.fn().mockImplementation((event: string, callback: CloseCallback) => {
      if (event === "close") {
        callback(0); // Now safely typed
      }
      return { stdin: { write: vi.fn() }, on: vi.fn() };
    }),
  }),
}));

import * as child_process from "child_process";
import { Readable } from "stream";

// Mock Readable.from
vi.spyOn(Readable, "from").mockImplementation(() => {
  return {
    pipe: vi.fn(),
  } as unknown as Readable;
});

describe("ReviewDogImplementation", () => {
  const ioService = { which: vi.fn() };
  const logger: Logger = { info: vi.fn(), error: vi.fn() };
  const reviewDog = new ReviewDogImpl(ioService, logger);

  it("ensureInstalled succeeds if reviewdog is found", async () => {
    ioService.which.mockResolvedValue("/usr/bin/reviewdog");
    await reviewDog.ensureInstalled();
    expect(ioService.which).toHaveBeenCalledWith("reviewdog", false);
    expect(logger.info).toHaveBeenCalledWith("Reviewdog is installed");
  });

  it("ensureInstalled fails if reviewdog is not found", async () => {
    ioService.which.mockResolvedValue("");
    await expect(reviewDog.ensureInstalled()).rejects.toThrow(
      "Reviewdog is not installed",
    );
  });

  it("run constructs correct arguments", async () => {
    // Run the reviewDog method
    await reviewDog.run(
      "file.xml",
      "token",
      "test",
      "local",
      "warning",
      "-filter-mode nofilter",
    );

    expect(logger.info).toHaveBeenCalledWith(
      "Running reviewdog with args: -f=checkstyle -name=test -reporter=local -level=warning -filter-mode nofilter",
    );

    // Check spawn was called with correct args
    const spawnMock = vi.mocked(child_process.spawn);

    // Check the first parameter
    expect(spawnMock.mock.calls[0]?.[0]).toBe("reviewdog");

    // Check the array of arguments
    const args = spawnMock.mock.calls[0]?.[1];
    expect(args).toContain("-f=checkstyle");
    expect(args).toContain("-name=test");
    expect(args).toContain("-reporter=local");
    expect(args).toContain("-level=warning");
    expect(args).toContain("-filter-mode");
    expect(args).toContain("nofilter");

    // Check the options object
    const options = spawnMock.mock.calls[0]?.[2];
    expect(options.env).toHaveProperty("REVIEWDOG_GITHUB_API_TOKEN", "token");
  });
});
