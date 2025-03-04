export interface Inputs {
  readonly github_token: string;
  readonly lint_xml_file: string;
  readonly reporter: string;
  readonly level: string;
  readonly reviewdog_flags?: string;
}
