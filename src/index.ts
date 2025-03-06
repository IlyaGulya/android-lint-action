import * as core from "@actions/core";
import { NodeRuntime } from "@effect/platform-node";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";

import { androidLint } from "@/src/action";
import { CoreOutputs } from "@/src/outputs/core-outputs";

import { CoreInputs } from "./inputs/core-inputs";

const outputs = new CoreOutputs();
const inputs = new CoreInputs();
const dependencies = { outputs };

NodeRuntime.runMain(androidLint(inputs, dependencies), {
  teardown: function teardown(exit, onExit) {
    if (Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)) {
      core.setFailed(exit.cause.toString());
      onExit(1);
    } else {
      onExit(0);
    }
  },
});
