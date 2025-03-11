<h1 align="center">⭐ Android Lint Action ⭐</h1>

<p align="center">
  GitHub Action to run Android Lint and report issues using reviewdog
</p>

<p align="center">
  <a href="https://github.com/ilyagulya/android-lint-action/actions/workflows/node.yml?branch=main"><img src="https://github.com/ilyagulya/android-lint-action/actions/workflows/node.yml/badge.svg?branch=main" alt="nodejs"/></a>
  <a href="https://nodejs.org/docs/latest-v20.x/api/index.html"><img src="https://img.shields.io/badge/node-20.x-green.svg" alt="node"/></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-9.x-red.svg" alt="pnpm"/></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/supported_node-20.x-forestgreen.svg" alt="supported node"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-5.x-blue.svg" alt="typescript"/></a>
</p>

## 👀 Overview

This action runs [Android Lint](https://developer.android.com/studio/write/lint) and reports the results using [reviewdog](https://github.com/reviewdog/reviewdog). It takes an Android Lint XML result file, converts it to checkstyle format, and then passes it to reviewdog for reporting.

## 🚀 Usage

⚠️ **Important**: This action requires reviewdog to be installed separately. See the [Installing Reviewdog](#📥-installing-reviewdog) section below.

```yaml
name: Android Lint with Reviewdog
on: [pull_request]

jobs:
  android-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Install reviewdog
      - name: Install reviewdog
        uses: reviewdog/action-setup@v1

      # Run your Android Lint command to generate the XML report
      - name: Run Android Lint
        run: ./gradlew lint

      # Run the Android Lint Action to report issues
      - name: Report Android Lint Results
        uses: ilyagulya/android-lint-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          lint_xml_file: app/build/reports/lint-results.xml
          reporter: github-pr-review
          level: warning
```

## 📥 Installing Reviewdog

You must install reviewdog before using this action. We recommend using the official [reviewdog/action-setup](https://github.com/reviewdog/action-setup) GitHub Action:

```yaml
- name: Install reviewdog
  uses: reviewdog/action-setup@v1
  with:
    reviewdog_version: latest # or specify a version like 'v0.14.1'
```

Alternatively, you can install reviewdog manually:

```yaml
- name: Install reviewdog
  run: |
    curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/master/install.sh | sh -s -- -b $HOME/bin
    echo "$HOME/bin" >> $GITHUB_PATH
```

## ⚙️ Inputs

| Name              | Description                                                             | Required | Default         |
| ----------------- | ----------------------------------------------------------------------- | -------- | --------------- |
| `github_token`    | GITHUB_TOKEN to use for reviewdog                                       | Yes      | GITHUB_TOKEN    |
| `lint_xml_file`   | Path to the Android Lint XML result file                                | Yes      | -               |
| `reporter`        | Reporter of reviewdog [github-pr-check, github-pr-review, github-check] | No       | github-pr-check |
| `level`           | Report level for reviewdog [info, warning, error]                       | No       | warning         |
| `reviewdog_flags` | Additional reviewdog flags                                              | No       | -               |

## 🔍 How it works

1. Takes the Android Lint XML report as input
2. Converts the Android Lint XML format to Checkstyle XML format
3. Verifies that reviewdog is installed
4. Uses reviewdog to report the issues on GitHub pull requests or checks
