# AI usage policy

This document describes how AI tools may be used when contributing to **notion-electron**.
It applies to everyone opening issues or pull requests, whether you used an AI assistant,
an autonomous agent, or a code generator. Read it alongside
[`CONTRIBUTING.md`](../CONTRIBUTING.md) before contributing.

AI tools are welcome here. They can help you explore the codebase, draft a fix, or write up
a bug report. But they **augment** your work — they don't replace the judgment, review, and
accountability behind a contribution. The rules below exist to keep AI-assisted work at the
same quality bar as everything else in the project.

## Disclose AI use

If AI meaningfully helped produce an issue or a pull request, say so in the description. A
short note is enough — for example, "drafted with an AI assistant and reviewed by me" or
"the patch below was AI-generated; I verified it locally". Disclosure isn't a mark against
your contribution; it just tells maintainers what to expect when they review.

Undisclosed AI-generated submissions that read as low-effort, inaccurate, or hallucinated
may be closed without detailed review.

## You are accountable for what you submit

The human who submits a contribution owns its correctness and quality — not the tool that
helped write it. Before you submit AI-assisted work, you must **read, understand, and
verify it yourself**:

- Don't open a pull request containing code you can't explain.
- For code changes, **manually verify on Linux** as described in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md): run `npm start` and exercise the area you touched
  (tabs, options, tray, notifications, the updater). There is no automated test suite, so
  hands-on verification is the only safety net.
- Make sure the change follows the architectural rules in
  [`architecture.md`](architecture.md) and passes the pre-commit lint hook.

"The AI wrote it" is not an explanation for a bug, and it is not a substitute for testing.

## Responding to review

When a maintainer leaves feedback, respond and revise **as a human**. Don't paste reviewer
comments straight back into an AI and post the raw output. A review thread is a real
technical conversation: read the feedback, understand it, make the change, and reply in your
own words. Round-tripping comments through a tool wastes reviewers' time and erodes trust.

## AI-assisted issues

Before filing an issue, make sure it is genuine and reproducible. Confirm the behaviour on a
real build first — do not file speculative or hallucinated bug reports. Keep reports
concrete: steps to reproduce, your environment (distribution, package format, version), and
expected versus actual behaviour. An AI can help you write this up clearly, but the facts in
it must be ones you have verified.

## AI-assisted pull requests

AI-assisted pull requests are held to exactly the same standard as any other pull request
(see [`CONTRIBUTING.md`](../CONTRIBUTING.md)): keep the PR focused on a single concern,
follow the architectural rules, let the pre-commit hook lint and format your commits, and
manually verify the app still works. Describe what you changed, why, and how you tested it.

No special pre-approval is required to open an AI-assisted PR — disclosure and the
human-review expectations above are what we rely on.

## Enforcement

Submissions that ignore this policy — undisclosed, unreviewed, or clearly low-effort AI
output — may be closed without detailed review. Repeated disregard for the policy may lead
to being blocked from the repository.
