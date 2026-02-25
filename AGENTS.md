# AGENTS.md

## Prime directive
You are authorized to execute the repo’s standard workflow without requesting approval between tasks.

Before doing any work:
- Read (if present), in this order:
  1) ./NEXTSTEPS.md or ./nextsteps.md (prefer NEXTSTEPS.md if both exist)
  2) ./README.md
- Do NOT automatically open or scan any PLANS.md file (including ./PLANS.md or ./.agent/PLANS.md). Only read PLANS.md when the user explicitly triggers it (see “User-triggered workflows”).

## User-triggered workflows

### 1) “Check for any updates” (aliases: “UpdateCheck”, “Run NextSteps”)
Goal: Implement NEXTSTEPS tasks, verify, run security checks, version bump, report, update README, then git add/commit/push.

Workflow:
1) Repo status snapshot:
   - `git status`
   - `git log -n 20 --oneline`
2) Determine scope from NEXTSTEPS:
   - Default: implement tasks under **Now (highest priority)**.
   - Do NOT touch “Soon” or “Later” unless the user explicitly requests it.
3) Execute tasks sequentially (no approval gates):
   - Implement task 1 → verify → proceed to task 2 → repeat until all scoped tasks are attempted.
4) After all scoped tasks are attempted:
   - Run full test/lint/build verification (see “Verification”).
   - Run standard security review + vulnerability scanning (see “Security review & scans”).
5) Version bump rules (see “Versioning”).
6) Create a version update report file (see “Update report file”).
7) Update README with relevant information from the update report (see “README updates”).
8) Git finalize:
   - `git add -A`
   - `git commit -m "<project>: vX.Y updates"` (use the new version)
   - `git push` to the configured remote for the current branch

If git push fails due to missing remote/auth, do not invent credentials. Report the exact command output and stop.

### 2) “Use PLANS” / “Run PLANS” / “Execute plans”
Only when the user explicitly asks:
- Locate and read PLANS.md (root or ./.agent/PLANS.md if present).
- Follow the plan steps exactly.
- Apply the same verification, security review, versioning, reporting, README updates, and git finalize workflow as above.

## Multi-task authorization (no-approval batching)
When implementing NEXTSTEPS tasks:
- If there are multiple tasks, you are explicitly authorized to complete one and immediately move to the next without requesting user approval.
- Provide a final summary at the end of the full run, not after each individual task.

## Failure handling: “Disable-but-save” (so one failure doesn’t block the run)
If you encounter a task you cannot implement (blocked, incompatible, too risky, missing credentials, unclear requirements, etc.):
1) Preserve the work you did.
2) Ensure the project still builds/tests cleanly by disabling the partial implementation so it does not affect the full build.

Preferred ways to disable (choose the safest for the stack):
- Put incomplete code behind a feature flag that defaults OFF.
- Remove wiring/entrypoints/imports so the code is unreachable and not executed.
- Move WIP into `./.wip/<task-slug>/` (or similar) and ensure it’s not referenced by build scripts.
- As a last resort: comment out the relevant blocks (only if it won’t break formatting/lint rules).

Rules:
- Do NOT leave the repo in a failing state just to “keep the work visible.”
- Do NOT delete the partial work. Preserve it, but disable it.

Then:
- Record the failure in the version update report under **“Failed to implement”**, including:
  - What you achieved
  - What went wrong (root cause if known)
  - Where the preserved/disabled work lives (file paths)
  - What would be needed to finish it

After documenting the failure:
- Continue to the next task.

## Verification (tests/lint/build)
Use existing project scripts/configs where possible.

Order of operations:
- If a package manager/build tool is present, prefer its standard scripts:
  - Node: `npm test` / `npm run lint` / `npm run build` (or `pnpm`, `yarn` equivalents)
  - Python: `pytest`, `ruff`, `black`, `mypy` (only if configured)
  - PHP: `composer test`, `phpunit`, `phpstan` (only if configured)
- If scripts are not defined, run the most standard lightweight checks for the stack without adding dependencies.

Minimum requirement before version bump + report:
- Lint (if available) passes
- Tests (if available) pass
- Build (if applicable) succeeds

## Security review & scans (run after scoped tasks are attempted)
After all NEXTSTEPS updates are implemented (or attempted) and verification passes:
- Perform a standard security review and vulnerability scan appropriate to the stack.

Examples (run what’s applicable/available without inventing tooling):
- Node:
  - `npm audit` (or `pnpm audit`, `yarn npm audit`)
  - Check for exposed secrets in config/logging
- Python:
  - If present, run configured security tooling (e.g., `bandit`, `pip-audit`) via existing scripts
- PHP:
  - `composer audit` (if composer is used)
- General:
  - Look for obvious secret leakage (keys/tokens committed)
  - Check auth/session/cookie/security headers if web app
  - Validate dependency ranges are not absurdly permissive

If vulnerabilities are found:
- Attempt safe, minimal remediation (dependency bumps, config hardening) that doesn’t require a major redesign.
- If remediation is non-trivial, document findings in the update report (include severity and affected packages/components) and add a NEXTSTEPS item if appropriate.

## Versioning
Version format: `vMAJOR.MINOR` (e.g., `v1.2`).

Where to read/write version:
- Prefer the repo’s existing canonical version source (e.g., package.json, pyproject.toml, composer.json).
- If none exists, create/use `./VERSION` containing exactly `vMAJOR.MINOR`.

Bump rules (per user request):
- NEXTSTEPS updates: increment MINOR by +1 (the number after the decimal point).
- PLANS.md “big work” updates: also increment MINOR by +1 (the number after the decimal point).
- Do not change MAJOR unless the user explicitly instructs it.

## Update report file
After verification + security review is complete:
- Create a markdown file in the project root named:
  `<project-slug>-v<NEW_VERSION>-updates.md`

Example:
- `project-v1.2-updates.md`

How to determine `<project-slug>`:
- Prefer a name field from project metadata (package.json name, composer.json name, etc.).
- Else use the repo root folder name.
- Slug rules: lowercase, spaces to hyphens.

Required sections in the report:
- Title: `<Project Name> vX.Y Update Report`
- Date
- Summary (what changed at a glance)
- Completed
  - List each NEXTSTEPS task completed
  - Key implementation notes
- Failed to implement
  - For each failed task:
    - What was attempted
    - What was achieved
    - What went wrong
    - Where the disabled/preserved work is located
    - What’s needed to complete it
- Verification
  - Lint: pass/fail + command(s)
  - Tests: pass/fail + command(s)
  - Build: pass/fail + command(s)
- Security review & vulnerability scan
  - Tools/commands used
  - Findings (and fixes applied)
  - Remaining risks (if any)
- Files changed (high-level grouping)
- Notes / follow-ups (optional)

## README updates
After creating the update report file:
- Update `./README.md` with relevant information from the update report, including:
  - The new version number
  - A short “What’s New” summary (bullet list)
  - A reference/link to the update report file (relative path)
- Keep README changes concise and user-facing (not internal debugging logs).

## Git finalize (add/commit/push)
At the end of the workflow, once:
- verification passes, and
- security review has been run (and fixes applied where safe),

Then:
- `git add -A`
- `git commit -m "<project-slug>: vX.Y updates"`
- `git push`

Do not rewrite history or force-push unless the user explicitly requests it.
