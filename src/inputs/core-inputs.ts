import { getInput } from "@actions/core";

import { Inputs } from "./inputs";

export class CoreInputs implements Inputs {
  get github_token(): string {
    return getInput("github_token", { required: true });
  }

  get lint_xml_file(): string {
    return getInput("lint_xml_file", { required: true });
  }

  get reporter(): string {
    return getInput("reporter") || "github-pr-check";
  }

  get level(): string {
    return getInput("level") || "warning";
  }

  get reviewdog_flags(): string | undefined {
    return getInput("reviewdog_flags") || undefined;
  }
}
