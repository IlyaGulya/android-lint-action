import * as actionsIo from "@actions/io";
import { Context, Effect, Layer } from "effect";

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
const impl: IOService = {
  which(tool: string, check?: boolean): Effect.Effect<string, Error> {
    return Effect.tryPromise(() => actionsIo.which(tool, check));
  },
};

export const IOService = Context.GenericTag<IOService>("IOService");

export const layer: Layer.Layer<IOService> = Layer.succeed(IOService, impl);

export function makeNoop(impl: Partial<IOService>): IOService {
  return {
    which: () => Effect.fail(new Error("not implemented")),
    ...impl,
  };
}

export function layerNoop(
  impl: Partial<IOService> = {},
): Layer.Layer<IOService> {
  return Layer.succeed(IOService, makeNoop(impl));
}
