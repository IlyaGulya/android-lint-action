import fs from "node:fs";
import * as process from "node:process";

import * as core from "@actions/core";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, pipe } from "effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";

import { ActionOutputs, runAction } from "@/src/action";
import { CoreOutputs } from "@/src/outputs/core-outputs";

import { IOService } from "./effects/actions";
import { CoreInputs } from "./inputs/core-inputs";
import { ReviewDog } from "./reviewdog";
import { XmlConverter } from "./xml-converter";

const outputs = new CoreOutputs();
const inputs = new CoreInputs();

console.log(`CWD:${process.cwd()}`);
console.log(`Files: ${fs.readdirSync(".").join("\n")}`);

const program = pipe(
  runAction(inputs),
  Effect.provide(
    Layer.mergeAll(
      Layer.succeed(ActionOutputs, outputs),
      IOService.layer,
      NodeContext.layer,
      ReviewDog.layer,
      XmlConverter.layer,
    ),
  ),
  Effect.scoped,
);

NodeRuntime.runMain(program, {
  teardown: function teardown(exit, onExit) {
    if (Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)) {
      core.setFailed(exit.cause.toString());
      onExit(1);
    } else {
      onExit(0);
    }
  },
});
