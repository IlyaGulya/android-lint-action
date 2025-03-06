import * as actionsIo from "@actions/io";
import { Effect } from "effect";

/**
 * Interface for IO operations
 */
export interface IOService {
  /**
   * Checks whether a path exists and resolves to the path of a tool if found.
   * If tool is not found, it rejects with an error.
   * @param tool - The name of the tool to find
   * @param check - Whether to check that tool exists
   * @returns The path to the tool if found
   */
  which(tool: string, check?: boolean): Effect.Effect<string, Error>;
}

/**
 * Implementation of IOService using @actions/io
 */
export const ActionsIOService: IOService = {
  which(tool: string, check?: boolean): Effect.Effect<string, Error> {
    return Effect.tryPromise(() => actionsIo.which(tool, check));
  },
};
