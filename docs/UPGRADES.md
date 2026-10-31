# Upgrade policies and verification

Version differences are heuristics, not proof that an upgrade is compatible. Major changes, epoch changes (Python), and minor changes while the major is zero require explicit review. Smaller changes have not passed project tests unless you run validation.

## Select a target

Settings use the `pyDepsHint` prefix:

| Setting | Default | Meaning |
| --- | --- | --- |
| `strategy` | `latest` | `latest`, `compatible` (same major; 0.x stays in its minor), or `patch` (same major.minor). Existing upper bounds and exclusions still apply. |
| `targetPythonVersion` | empty | Concrete target runtime version. If absent, attempt `.python-version`. No concrete runtime means compatibility is unknown. |
| `minimumReleaseAgeDays` | `0` | Release cooldown; when positive, versions with missing timestamps are excluded. This reduces exposure to new releases but is not a security guarantee. |
| `ignoredVersions` | `{}` | Map package names to exact versions to suppress. |
| `deferredPackages` | `{}` | Map package names to an ISO 8601 date/time until which suggestions are deferred. |
| `validationCommands` | `[]` | Checks represented as `{ "executable": "...", "args": [...] }`; no shell expressions. Empty means project tests are not run. For example: `[{"executable":"uv","args":["run","--no-sync","pytest"]}]`. |

Requires-Python is checked against that concrete interpreter version. Wheel/platform availability and the full supported Python range still require the native resolver.

The runtime setting filters package metadata. Validation commands use the runtime selected by the project and native tools; they do not automatically switch Node or Python versions.

Cooldown, ignore and defer rules also apply when an update could fix a vulnerability. There is no silent security exception; adjust the policy explicitly for an urgent repair.

Before single, batch or preview updates, exact destination versions are checked with OSV when `checkVulnerabilities` is enabled. Known-vulnerable destinations are omitted. Network or malformed-response errors stop the update instead of implying a clean result. Disabling the setting explicitly skips this check. OSV covers known advisories, not every supply-chain threat.

## Show Dependency Report

Open a supported manifest, then run **Show Dependency Report**. Supports `uv.lock` and `poetry.lock`. The report includes resolved versions, direct/transitive relationships, shortest known dependency paths and links to advisories.

Resolved does not mean installed. Conditional branches, optional packages and development groups may not be active in the current environment. Private/non-registry sources remain visible but are not submitted by the lockfile report to public OSV. A failed or disabled check is labelled explicitly.

## Preview and Validate Dependency Updates

1. Open the manifest and run **Preview and Validate Dependency Updates**.
2. Review the proposed declaration changes in VS Code's diff editor.
3. Review the project root, package-manager commands and project checks; choose **Validate proposal** to run them in a temporary copy.
4. After successful resolution/checks, choose **Apply changes**. Manifest and lockfile changes are applied together as editor edits, ready for review and saving.

Isolated validation supports a root `pyproject.toml` with `uv.lock` or `poetry.lock`. It runs uv lock/sync or Poetry lock/install. requirements files and nested Python workspace manifests retain inline updates, but are not currently supported by this validation command.

Validation executes project code in a temporary copy, using the native package manager's registry and authentication configuration. It does not install packages into the original project's environment. Existing `node_modules`, `.venv`, `.git` and symlinks are omitted from the copy. It requires workspace trust. Tests that depend on those omitted files may need project-specific commands.

Failure, timeout and cancellation discard the copy. The original source, dirty manifest and lockfiles must still match their reviewed snapshots before results can be applied. New edits require a new validation run. Existing changes are never reset or stashed. Undo reverts the applied editor edit; review and save all changed files together.

Checks may be absent: a resolution-only result explicitly says that project tests did not run. Passing checks cover only the configured checks. Each subprocess has a ten-minute timeout. Commands use argument arrays without a shell; Windows `.cmd` package-manager shims may need executable wrappers in project-specific workflows.

## Shared implementation

`src/shared/` contains the policy, graph model, target checks, process runner and validation/report workflow. The canonical copy is authored in the Python extension and vendored into the npm extension; both still build and package independently. With both checkouts available, `npm run check:shared` checks parity. After editing the canonical source, use `node scripts/sync-shared.mjs --write` and review both diffs. A nonstandard sibling location can be supplied with `--peer <path>`.
