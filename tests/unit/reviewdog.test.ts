import { describe, expect, it, vi } from "vitest";

import { Logger } from "@/src/logger";
import {
  isDeliveryFailure,
  ReviewDogDeliveryError,
  ReviewDogImpl,
} from "@/src/reviewdog";

// Use a type-safe mock implementation
type CloseCallback = (code: number) => void;

// Mock the child_process module. stderr is piped by the implementation so it
// can classify failures, so the fake child has to provide it.
vi.mock("child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    stdin: { write: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
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

describe("isDeliveryFailure", () => {
  it("recognises the git-fetch failure seen on PRs with >300 files", () => {
    // Verbatim from a failing inDriverAndroid `lint` job.
    expect(
      isDeliveryFailure(
        "reviewdog: fail to get diff: failed to run git fetch: " +
          "fatal: could not read Username for 'https://github.com': " +
          "No such device or address\n",
      ),
    ).toBe(true);
  });

  it("recognises the 406 diff-too-large response", () => {
    expect(
      isDeliveryFailure(
        "fail to get diff: GET https://api.github.com/repos/o/r/pulls/1: 406 " +
          "Sorry, the diff exceeded the maximum number of files (300).",
      ),
    ).toBe(true);
  });

  it("does not treat ordinary lint findings as a delivery failure", () => {
    expect(
      isDeliveryFailure(
        "reviewdog: found at least one issue with severity greater than or " +
          "equal to the given level: error\n",
      ),
    ).toBe(false);
  });

  it("does not treat an empty stderr as a delivery failure", () => {
    expect(isDeliveryFailure("")).toBe(false);
  });
});

describe("ReviewDogImpl failure classification", () => {
  const logger: Logger = { info: vi.fn(), error: vi.fn() };

  /** Builds a fake child process that emits `stderr` and exits with `code`. */
  const fakeChild = (code: number, stderrOutput: string) => ({
    stdin: { write: vi.fn() },
    stderr: {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, cb: (chunk: string) => void) => {
        if (event === "data" && stderrOutput) {
          cb(stderrOutput);
        }
      }),
    },
    on: vi.fn((event: string, cb: (c: number) => void) => {
      if (event === "close") {
        cb(code);
      }
    }),
  });

  const runWith = (code: number, stderrOutput: string) => {
    vi.mocked(child_process.spawn).mockReturnValueOnce(
      fakeChild(code, stderrOutput) as unknown as ReturnType<
        typeof child_process.spawn
      >,
    );
    return new ReviewDogImpl({ which: vi.fn() }, logger).run(
      "<checkstyle/>",
      "token",
      "Android Lint",
      "github-pr-check",
      "warning",
    );
  };

  it("raises a delivery error when the diff could not be fetched", async () => {
    await expect(
      runWith(
        1,
        "reviewdog: fail to get diff: failed to run git fetch: fatal: " +
          "could not read Username for 'https://github.com'\n",
      ),
    ).rejects.toBeInstanceOf(ReviewDogDeliveryError);
  });

  it("raises a plain error for a genuine lint failure", async () => {
    const promise = runWith(
      1,
      "reviewdog: found at least one issue with severity greater than or " +
        "equal to the given level: error\n",
    );
    await expect(promise).rejects.toThrow(/non-zero code/);
    await expect(promise).rejects.not.toBeInstanceOf(ReviewDogDeliveryError);
  });

  it("succeeds on a clean run", async () => {
    await expect(runWith(0, "")).resolves.toBeUndefined();
  });
});
