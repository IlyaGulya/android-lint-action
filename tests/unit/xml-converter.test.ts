import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockedObject,
  vi,
} from "vitest";

import { FileSystem } from "@/src/fs";
import {
  buildCheckstyleXml,
  getDefaultConfig,
  parseXmlToIssues,
  XmlConverterImpl,
} from "@/src/xml-converter";

describe("XML Converter", () => {
  let fileSystem: MockedObject<FileSystem>;

  beforeEach(() => {
    vi.stubEnv("RUNNER_WORKSPACE", "/workspace");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
    fileSystem = vi.mocked({
      readFileString: vi.fn(),
      writeFileString: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parseXmlToIssues returns empty array for no issues", () => {
    const result = parseXmlToIssues(
      '<?xml version="1.0" encoding="utf-8"?><issues></issues>',
    );
    expect(result).toEqual([]);
  });

  it("parseXmlToIssues parses single issue", () => {
    const xml = `
    <?xml version="1.0" encoding="utf-8"?>
    <issues>
      <issue id="Test" message="Test message" severity="warning">
        <location file="/file.kt" line="10" column="5"/>
      </issue>
    </issues>
  `;
    const result = parseXmlToIssues(xml);
    expect(result).toEqual([
      {
        id: "Test",
        message: "Test message",
        severity: "warning",
        location: { file: "/file.kt", line: 10, column: 5 },
      },
    ]);
  });

  it("buildCheckstyleXml creates empty XML for no issues", () => {
    const result = buildCheckstyleXml([], {
      workspacePath: "/workspace",
      repoName: "repo",
    });
    expect(result).toContain('<checkstyle version="8.0"/>');
  });

  it("convertLintToCheckstyle converts XML", async () => {
    fileSystem.readFileString.mockResolvedValue(
      '<issues><issue id="Test" message="Test" severity="warning"><location file="/workspace/repo/file.kt"/></issue></issues>',
    );
    const converter = new XmlConverterImpl(fileSystem);
    const result = await converter.convertLintToCheckstyle("/input.xml");
    expect(result.checkstyleXml).toContain('<file name="file.kt">');
  });

  it("convertLintToCheckstyle also returns the parsed issues", async () => {
    fileSystem.readFileString.mockResolvedValue(
      '<issues><issue id="Test" message="Boom" severity="warning"><location file="/workspace/repo/file.kt" line="7"/></issue></issues>',
    );
    const converter = new XmlConverterImpl(fileSystem);
    const result = await converter.convertLintToCheckstyle("/input.xml");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      id: "Test",
      message: "Boom",
      severity: "warning",
    });
  });

  it("makes issue paths repo-relative for every reporter", async () => {
    fileSystem.readFileString.mockResolvedValue(
      '<issues><issue id="Test" message="Boom" severity="warning"><location file="/workspace/repo/app/src/File.kt" line="7"/></issue></issues>',
    );
    const converter = new XmlConverterImpl(fileSystem);
    const result = await converter.convertLintToCheckstyle("/input.xml");

    // GitHub only renders annotations for repo-relative paths.
    expect(result.issues[0]?.location?.file).toBe("app/src/File.kt");
    expect(result.checkstyleXml).toContain('name="app/src/File.kt"');
  });

  it("getDefaultConfig uses env vars", () => {
    const config = getDefaultConfig();
    expect(config).toEqual({ workspacePath: "/workspace", repoName: "repo" });
  });
});
