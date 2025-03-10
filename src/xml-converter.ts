import { XMLParser } from "fast-xml-parser";
import { create } from "xmlbuilder2";

import { FileSystem } from "@/src/fs";

// Define interfaces for parsed XML structure
interface ParsedXml {
  issues?: {
    issue: XmlIssue | XmlIssue[];
  };
}

// Define interface for the business model
interface LintIssue {
  id?: string;
  message?: string;
  severity?: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

// Define interface for how the XML parser returns data
interface XmlIssue {
  "@_id"?: string;
  "@_message"?: string;
  "@_severity"?: string;
  location?: {
    "@_file"?: string;
    "@_line"?: string | number;
    "@_column"?: string | number;
  };
}

export interface XmlConverterConfig {
  workspacePath: string;
  repoName: string;
}

export interface XmlConverter {
  convertLintToCheckstyle(inputFilePath: string): Promise<string>;
}

export function getDefaultConfig(): XmlConverterConfig {
  return {
    workspacePath: process.env.RUNNER_WORKSPACE ?? "",
    repoName: (process.env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "",
  };
}

export function parseXmlToIssues(xmlData: string): LintIssue[] {
  if (xmlData.includes("<issues></issues>")) {
    return [];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: true,
    textNodeName: "_text",
    isArray: name => name === "issue",
  });

  const parsedXml = parser.parse(xmlData) as ParsedXml;
  const issues = parsedXml.issues?.issue;
  if (!issues) {
    return [];
  }

  const result: LintIssue[] = [];
  const issueArray = Array.isArray(issues) ? issues : [issues];
  for (const xmlIssue of issueArray) {
    const location = xmlIssue.location ?? {};
    result.push({
      id: xmlIssue["@_id"] ?? "",
      message: xmlIssue["@_message"] ?? "",
      severity: xmlIssue["@_severity"] ?? "info",
      location: {
        file: location["@_file"] ?? "",
        line: location["@_line"] ? Number(location["@_line"]) : undefined,
        column: location["@_column"] ? Number(location["@_column"]) : undefined,
      },
    });
  }
  return result;
}

export function buildCheckstyleXml(
  issues: LintIssue[],
  config: XmlConverterConfig,
): string {
  const checkstyle = create({ version: "1.0", encoding: "utf-8" }).ele(
    "checkstyle",
    { version: "8.0" },
  );

  if (issues.length === 0) {
    return checkstyle.end({ prettyPrint: true });
  }

  // Explicitly type the Map values as xmlbuilder2 objects
  const processedFiles = new Map<string, ReturnType<typeof checkstyle.ele>>();
  for (const issue of issues) {
    const file = issue.location?.file;
    if (!file) {
      continue;
    }

    const filePath = file
      .replace(`${config.workspacePath}/${config.repoName}/`, "")
      .trim();
    if (!filePath) {
      continue;
    }

    let fileElement = processedFiles.get(filePath);
    if (!fileElement) {
      fileElement = checkstyle.ele("file", { name: filePath });
      processedFiles.set(filePath, fileElement);
    }

    fileElement.ele("error", {
      line: issue.location?.line ?? 0,
      column: issue.location?.column ?? 0,
      severity: issue.severity ?? "info",
      message: `${issue.id ?? ""}: ${issue.message ?? ""}`,
    });
  }

  return checkstyle.end({ prettyPrint: true });
}

export class XmlConverterImpl implements XmlConverter {
  constructor(private fileSystem: FileSystem) {}

  async convertLintToCheckstyle(inputFilePath: string): Promise<string> {
    const xmlData = await this.fileSystem.readFileString(inputFilePath);
    const issues = parseXmlToIssues(xmlData);
    return buildCheckstyleXml(issues, getDefaultConfig());
  }
}
