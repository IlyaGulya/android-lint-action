import * as fs from "node:fs";

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

export class XmlConverter {
  private workspacePath: string;
  private repoName: string;

  constructor() {
    this.workspacePath = process.env.RUNNER_WORKSPACE ?? "";
    this.repoName = (process.env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "";
  }

  convertLintToCheckstyle(
    inputFilePath: string,
    outputFilePath: string,
  ): Promise<void> {
    // Read the input file
    const xmlData = fs.promises.readFile(inputFilePath, "utf8");

    // Create checkstyle XML
    const checkstyle = create({ version: "1.0", encoding: "utf8" }).ele(
      "checkstyle",
      { version: "8.0" },
    );

    // If the XML is empty or contains no issues, write empty file and return
    return xmlData.then(data => {
      if (data.includes("<issues></issues>")) {
        return fs.promises.writeFile(
          outputFilePath,
          checkstyle.end({ prettyPrint: true }),
        );
      }

      // Parse the XML
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseAttributeValue: true,
        textNodeName: "_text",
        isArray: name => name === "issue",
      });

      const parsedXml = parser.parse(data) as ParsedXml;

      // If no issues array exists or it's empty, write empty file and return
      if (!parsedXml.issues.issue) {
        return fs.promises.writeFile(
          outputFilePath,
          checkstyle.end({ prettyPrint: true }),
        );
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

      // If no issues after processing, write empty file and return
      if (issues.length === 0) {
        return fs.promises.writeFile(
          outputFilePath,
          checkstyle.end({ prettyPrint: true }),
        );
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
          .replace(`${this.workspacePath}/${this.repoName}/`, "")
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

      // Write to output file
      return fs.promises.writeFile(
        outputFilePath,
        checkstyle.end({ prettyPrint: true }),
      );
    });
  }
}
