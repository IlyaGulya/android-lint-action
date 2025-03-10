import * as actionsIo from "@actions/io";

export interface IOService {
  which(tool: string, check?: boolean): Promise<string>;
}

export class ActionsIOService implements IOService {
  async which(tool: string, check?: boolean): Promise<string> {
    return actionsIo.which(tool, check);
  }
}
