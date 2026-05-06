# AGENTS.md

## Purpose

This file defines repository working standards for human contributors and coding agents.
Follow these rules unless a maintainer explicitly overrides them in a task.

## Git Branch Standards

Use short, descriptive branch names in this format:

`<type>/<short-kebab-description>`

Examples:

- feat/wallaby-card-expand
- fix/csp-script-loading
- docs/update-readme
- chore/eslint-ignore-wrangler

Allowed branch types:

- feat
- fix
- docs
- chore
- refactor
- test
- perf
- ci
- build
- hotfix
- revert

Rules:

- Use lowercase only.
- Use kebab-case for the description.
- Keep branch names under 50 characters when possible.
- One branch should represent one primary change.

## Commit Message Standards

Prefix every commit with a bracketed type:

type: Imperative summary

Examples:

- feat: Add expandable wallaby cards
- fix: Serve wallabies script via passthrough copy
- docs: Clarify local dev workflow

Allowed commit types:

- feat
- fix
- docs
- chore
- refactor
- test
- perf
- ci
- build
- hotfix
- revert

Rules:

- Use imperative mood ("Add", "Fix", "Update").
- Keep subject line concise (target: <= 72 chars).
- Add a body for non-trivial changes explaining why.

## Pull Request Standards

- Keep PRs focused and reasonably small.
- Use the repository PR template at `.github/pull_request_template.md`.
- Include a short summary and why the change was needed.
- Confirm linting passes and run a quick manual smoke test.
- Do not mix unrelated refactors with feature/fix work.
- Create a merge commit when merging a PR, don't rebase or squash.

## Quality Gates Before Merge

- Run lint and fix all errors.
- Run project build and confirm output is correct.
- Run `npm test` and confirm all tests pass.
- Validate accessibility basics for UI changes (keyboard, focus, semantics).
- Confirm CSP/security headers are not weakened unintentionally.

## Worker Tests

Unit tests for every `worker/` module live in `worker/tests/`. When modifying any file
in `worker/`, update the corresponding test file in `worker/tests/` to reflect the
change. When adding a new `worker/` module, add a matching test file.

Run tests with:

```bash
npm test
```

## Working Agreement for Agents

- Do not commit secrets, tokens, or environment credentials.
- Do not use destructive git commands unless explicitly requested.
- Do not rewrite history on shared branches.
- If uncertain, document assumptions in the PR description.
- Don't generate text content leave that to the humands. Just use lorem ipsum or whatever.
- Before making security-related changes, read `docs/security.md` and follow its identifier and hardening guidance.

## Coding Choice and Style

When animating or scripting web page stuff, try your best to use CSS and html
before involving javascript.
Prefer concise and elegant solutions.

## Writing Style

- Use direct present-tense wording when describing behaviour.
- Avoid temporal framing like "now includes", "new feature", or "recently added".
- Apply the same tone in README text, PR descriptions, comments, and user-facing copy.
- Use British English spelling and grammar in all written content.
- Use 24-hour time format (for example, 17:30, not 5:30 PM).
- Never use month-first date formats.

## Optional Nice-to-Haves

Teams often also define:

- Review SLA (for example: first review within 1 business day)
- Label conventions (type, priority, area)
- Merge strategy (squash vs merge commit)
- Release/versioning rules
- Backport policy for production fixes
