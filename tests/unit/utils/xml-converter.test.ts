import type { XmlConverterConfig } from "@/src/utils/xml-converter";

import * as fs from "node:fs";
import path from "node:path";

import { FileSystem } from "@effect/platform";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import {
  buildCheckstyleXml,
  convertLintToCheckstyle,
  getDefaultConfig,
  parseXmlToIssues,
} from "@/src/utils/xml-converter";

// Read the actual fixture file content
const fixtureFilePath = path.resolve(__dirname, "../../fixtures/issues.xml");
const fixtureContent = fs.readFileSync(fixtureFilePath, "utf8");

describe("XML Converter", () => {
  let mockConfig: XmlConverterConfig;

  beforeEach(() => {
    mockConfig = {
      workspacePath: "/workspace",
      repoName: "repo",
    };

    // Mock environment variables
    vi.stubEnv("RUNNER_WORKSPACE", "/workspace");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("parseXmlToIssues", () => {
    it.effect("should return empty array when no issues exist", () =>
      Effect.gen(function* () {
        // Test with empty lint XML
        const emptyXml = `<?xml version="1.0" encoding="utf-8"?><issues></issues>`;

        // Call the parser
        const result = yield* parseXmlToIssues(emptyXml);

        // Verify the output
        expect(result).toEqual([]);
      }),
    );

    it.effect("should parse single issue correctly", () =>
      Effect.gen(function* () {
        // Test with single issue
        const singleIssueXml = `
          <?xml version="1.0" encoding="utf-8"?>
          <issues>
            <issue id="SampleIssue" severity="warning" message="This is a warning message">
              <location file="/workspace/repo/src/main.kt" line="10" column="5" />
            </issue>
          </issues>
        `;

        // Call the parser
        const result = yield* parseXmlToIssues(singleIssueXml);

        // Verify the output has correct shape
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: "SampleIssue",
          severity: "warning",
          message: "This is a warning message",
          location: {
            file: "/workspace/repo/src/main.kt",
            line: 10,
            column: 5,
          },
        });
      }),
    );

    it.effect("should parse multiple issues correctly", () =>
      Effect.gen(function* () {
        // Test with multiple issues
        const multipleIssuesXml = `
          <?xml version="1.0" encoding="utf-8"?>
          <issues>
            <issue id="Issue1" severity="warning" message="Warning message">
              <location file="/workspace/repo/src/main.kt" line="10" column="5" />
            </issue>
            <issue id="Issue2" severity="error" message="Error message">
              <location file="/workspace/repo/src/test.kt" line="20" column="15" />
            </issue>
          </issues>
        `;

        // Call the parser
        const result = yield* parseXmlToIssues(multipleIssuesXml);

        // Verify the output
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("Issue1");
        expect(result[1].id).toBe("Issue2");
      }),
    );
  });

  describe("buildCheckstyleXml", () => {
    it.effect("should create empty checkstyle XML when no issues exist", () =>
      Effect.gen(function* () {
        // Call the builder with empty issues array
        const result = yield* buildCheckstyleXml([], mockConfig);

        // Verify the output
        expect(result).toContain('<?xml version="1.0" encoding="utf8"?>');
        expect(result).toContain('<checkstyle version="8.0"/>');
      }),
    );

    it.effect("should build proper checkstyle XML with issues", () =>
      Effect.gen(function* () {
        // Sample issues
        const issues = [
          {
            id: "Issue1",
            severity: "warning",
            message: "Warning message",
            location: {
              file: "/workspace/repo/src/main.kt",
              line: "10",
              column: "5",
            },
          },
          {
            id: "Issue2",
            severity: "error",
            message: "Error message",
            location: {
              file: "/workspace/repo/src/test.kt",
              line: "20",
              column: "15",
            },
          },
        ];

        // Call the builder
        const result = yield* buildCheckstyleXml(issues, mockConfig);

        // Verify the output contains both files
        expect(result).toContain('<file name="src/main.kt">');
        expect(result).toContain('<file name="src/test.kt">');

        // Check that errors are correctly formatted
        expect(result).toContain(
          '<error line="10" column="5" severity="warning" message="Issue1: Warning message"/>',
        );
        expect(result).toContain(
          '<error line="20" column="15" severity="error" message="Issue2: Error message"/>',
        );
      }),
    );

    it.effect("should skip gradle cache files", () =>
      Effect.gen(function* () {
        // Sample issues with gradle cache file
        const issues = [
          {
            id: "Issue1",
            severity: "warning",
            message: "Warning message",
            location: {
              file: "/workspace/repo/src/main.kt",
              line: "10",
              column: "5",
            },
          },
          {
            id: "Issue2",
            severity: "error",
            message: "Error message",
            location: {
              file: "/workspace/repo/.gradle/caches/test.kt",
              line: "20",
              column: "15",
            },
          },
        ];

        // Call the builder
        const result = yield* buildCheckstyleXml(issues, mockConfig);

        // Verify that gradle cache file is skipped
        expect(result).toContain('<file name="src/main.kt">');
        expect(result).not.toContain(".gradle/caches/test.kt");
      }),
    );
  });

  describe("convertLintToCheckstyle", () => {
    it.effect("should convert lint XML to checkstyle XML", () =>
      Effect.gen(function* () {
        // Setup input/output file paths
        const inputFile = "/input.xml";
        const outputFile = "/output.xml";

        let writtenContent = "";

        // Create a custom file system layer with mocked behavior
        const fileSystemMock = FileSystem.layerNoop({
          readFileString: () => Effect.succeed(fixtureContent),
          writeFileString: (path, content) => {
            writtenContent = content;
            return Effect.succeedNone;
          },
          makeTempDirectoryScoped: () => Effect.succeed("/tmp"),
        });

        // Call the converter with the mocked file system
        yield* Effect.provide(
          convertLintToCheckstyle(inputFile, outputFile, mockConfig),
          fileSystemMock,
        );

        // Verify the expected content was written
        expect(writtenContent).toContain(
          '<?xml version="1.0" encoding="utf8"?>',
        );
        expect(writtenContent).toContain('<checkstyle version="8.0">');
      }),
    );
  });

  describe("getDefaultConfig", () => {
    it("should use environment variables for config", () => {
      const config = getDefaultConfig();

      expect(config.workspacePath).toBe("/workspace");
      expect(config.repoName).toBe("repo");
    });
  });
});
