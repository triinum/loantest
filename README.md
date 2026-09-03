# loantest

Playwright + TypeScript end-to-end coverage for the Bigbank loan calculator and origination flow.

## What is included

- Playwright test runner with TypeScript
- Page object model for the loan flow
- Data-driven happy-path and non-happy-path scenarios
- HTML reporting
- GitHub Actions pipeline for default and UAT execution

## Project structure

```text
.
├── .github/workflows/playwright.yml
├── package.json
├── playwright.config.ts
└── tests
    ├── data
    │   └── calculatorData.ts
    ├── pages
    │   └── LoanPage.ts
    └── loanOrigination.spec.ts
```

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer

## Installation

Install project dependencies:

```bash
npm ci
```

Install the Playwright browser used by the suite:

```bash
npx playwright install --with-deps chromium
```

## Running tests locally

Run the full suite:

```bash
npm test
```

Run the suite against a custom environment:

```bash
BASE_URL="https://taotlus.bigbank.ee/?amount=5000&period=60&productName=SMALL_LOAN&loanPurpose=DAILY_SETTLEMENTS" npm test
```

List discovered tests without executing them:

```bash
npm test -- --list
```

Run a single spec file:

```bash
npm test -- tests/loanOrigination.spec.ts
```

## Viewing the HTML report

After a run completes, open the Playwright HTML report:

```bash
npm run report
```

Artifacts such as screenshots, video, and trace data are retained only for failed tests.

## CI/CD pipeline

The GitHub Actions workflow is defined in `.github/workflows/playwright.yml`.

It runs in these cases:

- on `push`
- on `pull_request`
- on manual `workflow_dispatch`
- when GitHub Projects v2 events are available and a project item is edited so its `Status` changes to `Testing` or `In Testing`

Pipeline stages:

1. `test-stage` runs the default suite against the default `BASE_URL`
2. `uat-stage` runs only after `test-stage` passes and uses `UAT_BASE_URL` from GitHub Actions variables when available

If a workflow run fails, the Playwright HTML report is uploaded as an artifact.

## Default target application

Unless overridden with `BASE_URL`, the tests target:

```text
https://taotlus.bigbank.ee/?amount=5000&period=60&productName=SMALL_LOAN&loanPurpose=DAILY_SETTLEMENTS
```