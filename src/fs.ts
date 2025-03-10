import * as fs from "fs/promises";

export interface FileSystem {
  readFileString(path: string): Promise<string>;

  writeFileString(path: string, content: string): Promise<void>;
}

export class NodeFileSystem implements FileSystem {
  async readFileString(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async writeFileString(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf8");
  }
}
