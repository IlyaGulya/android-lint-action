import { FileSystem } from "@effect/platform";
import { PlatformError } from "@effect/platform/Error";
import { Effect, pipe } from "effect";
import { XMLParser } from "fast-xml-parser";
import { create } from "xmlbuilder2";

export interface LintIssue {
  id: string;
  message: string;
  severity: string;
  location: {
    file: string;
    line?: string;
    column?: string;
  };
}

interface ParsedXmlIssue {
  "@_id"?: string;
  "@_message"?: string;
  "@_severity"?: string;
  location?: {
    "@_file"?: string;
    "@_line"?: string;
    "@_column"?: string;
  };
}

interface ParsedXml {
  issues: {
    issue?: ParsedXmlIssue | ParsedXmlIssue[];
  };
}

// Environment configuration
export interface XmlConverterConfig {
  workspacePath: string;
  repoName: string;
}

// Default environment configuration
export const getDefaultConfig = (): XmlConverterConfig => ({
  workspacePath: process.env.RUNNER_WORKSPACE ?? "",
  repoName: (process.env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "",
});

// Parse XML to issues
export const parseXmlToIssues = (
  xmlData: string,
): Effect.Effect<LintIssue[], Error> =>
  Effect.try({
    try: () => {
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

      // If no issues array exists or it's empty, return empty array
      if (!parsedXml.issues.issue) {
        return [];
      }

      // Process each issue
      const issues: LintIssue[] = [];

      // Handle both single issue and array of issues
      if (Array.isArray(parsedXml.issues.issue)) {
        parsedXml.issues.issue.forEach((issue: ParsedXmlIssue) => {
          const location = issue.location;

          issues.push({
            id: issue["@_id"] ?? "",
            message: issue["@_message"] ?? "",
            severity: issue["@_severity"] ?? "info",
            location: {
              file: location?.["@_file"] ?? "",
              line: location?.["@_line"],
              column: location?.["@_column"],
            },
          });
        });
      } else {
        // Handle single issue case
        const issue = parsedXml.issues.issue;
        issues.push({
          id: issue["@_id"] ?? "",
          message: issue["@_message"] ?? "",
          severity: issue["@_severity"] ?? "info",
          location: {
            file: issue.location?.["@_file"] ?? "",
            line: issue.location?.["@_line"],
            column: issue.location?.["@_column"],
          },
        });
      }

      return issues;
    },
    catch: error => (error instanceof Error ? error : new Error(String(error))),
  });

// Build checkstyle XML from issues
export const buildCheckstyleXml = (
  issues: LintIssue[],
  config: XmlConverterConfig,
): Effect.Effect<string> => {
  return Effect.sync(() => {
    // Create checkstyle XML
    const checkstyle = create({ version: "1.0", encoding: "utf8" }).ele(
      "checkstyle",
      { version: "8.0" },
    );

    // If no issues, return empty checkstyle
    if (issues.length === 0) {
      return checkstyle.end({ prettyPrint: true });
    }

    // Build checkstyle XML
    const processedFiles = new Map<string, unknown>();

    // Process each issue and build the checkstyle XML
    for (const issue of issues) {
      // Skip issues without a file path or from .gradle/caches
      if (
        !issue.location.file ||
        issue.location.file.includes(".gradle/caches")
      ) {
        continue;
      }

      // Normalize the file path by removing workspace and repo prefix
      const filePath = issue.location.file
        .replace(`${config.workspacePath}/${config.repoName}/`, "")
        .trim();

      // Skip if the file path is empty after normalization
      if (!filePath) {
        continue;
      }

      let fileElement = processedFiles.get(filePath);
      if (!fileElement) {
        fileElement = checkstyle.ele("file", { name: filePath });
        processedFiles.set(filePath, fileElement);
      }

      const typedFileElement = fileElement as {
        ele: (name: string, attrs: Record<string, string>) => void;
      };

      typedFileElement.ele("error", {
        line: issue.location.line ?? "0",
        column: issue.location.column ?? "0",
        severity: issue.severity,
        message: `${issue.id}: ${issue.message}`,
      });
    }

    return checkstyle.end({ prettyPrint: true });
  });
};

export const convertLintToCheckstyle = (
  inputFilePath: string,
  outputFilePath: string,
  config: XmlConverterConfig,
): Effect.Effect<void, Error | PlatformError, FileSystem.FileSystem> => {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* pipe(
      fs.readFileString(inputFilePath),
      Effect.flatMap(xmlData => parseXmlToIssues(xmlData)),
      Effect.flatMap(issues => buildCheckstyleXml(issues, config)),
      Effect.flatMap(checkstyleXml =>
        fs.writeFileString(outputFilePath, checkstyleXml),
      ),
    );
  });
};
