import * as fs from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { XmlConverter } from "@/src/utils/xml-converter";

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

describe("XmlConverter", () => {
  let xmlConverter: XmlConverter;

  beforeEach(() => {
    vi.clearAllMocks();
    xmlConverter = new XmlConverter();

    // Mock environment variables
    vi.stubEnv("RUNNER_WORKSPACE", "/workspace");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("convertLintToCheckstyle", () => {
    it("should create empty checkstyle file when no issues exist", async () => {
      // Mock reading empty lint XML
      const emptyXml = `<?xml version="1.0" encoding="utf-8"?><issues></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(emptyXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('<?xml version="1.0" encoding="utf8"?>'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('<checkstyle version="8.0"/>'),
      );
    });

    it("should convert lint issues to checkstyle format", async () => {
      // Mock reading lint XML with issues
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="UnusedResources" severity="warning" message="The resource R.string.app_name appears to be unused" category="Performance"><location file="/workspace/repo/app/src/main/res/values/strings.xml" line="2" column="4"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining("app/src/main/res/values/strings.xml"),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('line="2"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('column="4"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('severity="warning"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "UnusedResources: The resource R.string.app_name appears to be unused",
        ),
      );
    });

    it("should skip issues from .gradle/caches directory", async () => {
      // Mock reading lint XML with gradle cache issue
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="GradleDependency" severity="warning" message="A newer version of com.android.tools.build:gradle is available"><location file="/workspace/repo/.gradle/caches/build.gradle" line="1" column="1"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output doesn't contain the gradle cache issue
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.not.stringContaining(".gradle/caches"),
      );
    });

    it("should handle missing location attributes", async () => {
      // Mock reading lint XML with missing location attributes
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="MissingLocation" severity="warning" message="Test message"><location file="/workspace/repo/app/src/main/java/Test.java"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify default values are used
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('line="0"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('column="0"'),
      );
    });

    it("should handle missing optional fields", async () => {
      // Mock reading lint XML with missing optional fields
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue><location file="/workspace/repo/app/src/main/java/Test.java" line="1" column="1"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify default values are used
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('severity="info"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(": "),
      );
    });
  });
});
