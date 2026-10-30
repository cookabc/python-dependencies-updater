import * as toml from "@iarna/toml";
import type { PyProjectDependency } from "../types";

const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

interface PyProject {
	project?: {
		dependencies?: string[];
		"optional-dependencies"?: Record<string, string[]>;
	};
	// PEP 735. Entries are requirement strings, or `{include-group = "..."}`
	// tables that pull in another group.
	"dependency-groups"?: Record<string, DependencyGroupEntry[]>;
	tool?: {
		poetry?: {
			dependencies?: Record<string, PoetryDependency>;
			"dev-dependencies"?: Record<string, PoetryDependency>;
			group?: Record<
				string,
				{ dependencies?: Record<string, PoetryDependency> }
			>;
		};
	};
}

type DependencyGroupEntry = string | { "include-group"?: string };

/**
 * Poetry dependencies are either a plain constraint string or an inline table
 * whose `version` key holds it. Git/path/url sources have no version to check.
 */
type PoetryDependency = string | { version?: string };

/**
 * Parse TOML, tolerating the mixed array PEP 735 allows inside
 * `[dependency-groups]`: `[{include-group = "dev"}, "pytest>=7"]`. @iarna/toml
 * enforces homogeneous arrays and rejects that, which would drop every hint in
 * the file. The include tables are swapped for a placeholder that fails the
 * package-name check, so the rest still parses and line numbers stay aligned
 * (the substitution is inline, so no line is added or removed).
 */
function parseToml(content: string): PyProject | null {
	try {
		return toml.parse(content) as PyProject;
	} catch {
		const sanitized = content.replace(
			/\{\s*include-group\s*=\s*"[^"]*"\s*\}/g,
			'"__include-group__"',
		);
		if (sanitized === content) {
			return null;
		}
		try {
			return toml.parse(sanitized) as PyProject;
		} catch {
			return null;
		}
	}
}

/**
 * Parse a pyproject.toml document and extract dependencies using @iarna/toml
 */
export function parsePyProjectDocument(content: string): PyProjectDependency[] {
	try {
		const parsed = parseToml(content);
		if (!parsed) {
			return [];
		}
		const dependencies: PyProjectDependency[] = [];
		const lines = content.split("\n");

		// 1. Parse [project.dependencies]
		if (parsed.project?.dependencies) {
			dependencies.push(
				...extractDependencies(
					parsed.project.dependencies,
					"project.dependencies",
					lines,
					content,
				),
			);
		}

		// 2. Parse [project.optional-dependencies]
		if (parsed.project?.["optional-dependencies"]) {
			for (const [extra, deps] of Object.entries(
				parsed.project["optional-dependencies"],
			)) {
				dependencies.push(
					...extractDependencies(
						deps,
						"project.optional-dependencies",
						lines,
						content,
						extra,
					),
				);
			}
		}

		// 3. Parse [dependency-groups] (PEP 735). Entries are requirement
		// strings; `{include-group = "..."}` tables only reference another
		// group and carry no version of their own, so they are skipped here.
		if (parsed["dependency-groups"]) {
			for (const [group, entries] of Object.entries(
				parsed["dependency-groups"],
			)) {
				const requirements = entries.filter(
					(entry): entry is string => typeof entry === "string",
				);
				dependencies.push(
					...extractDependencies(
						requirements,
						"dependency-groups",
						lines,
						content,
						group,
					),
				);
			}
		}

		// 4. Parse Poetry tables. `python` is the interpreter constraint, not a
		// package on PyPI, so it is dropped along with source-only entries.
		const poetry = parsed.tool?.poetry;
		if (poetry) {
			dependencies.push(
				...extractPoetryTable(
					poetry.dependencies,
					"tool.poetry.dependencies",
					lines,
				),
				...extractPoetryTable(
					poetry["dev-dependencies"],
					"tool.poetry.dev-dependencies",
					lines,
				),
			);
			for (const [group, table] of Object.entries(poetry.group ?? {})) {
				dependencies.push(
					...extractPoetryTable(
						table?.dependencies,
						"tool.poetry.group",
						lines,
						group,
					),
				);
			}
		}

		return dependencies;
	} catch (_e) {
		// Fallback or silent failure for invalid TOML
		return [];
	}
}

/**
 * Translate Poetry's caret and tilde constraints into PEP 440 ranges, so the
 * existing resolver can reason about them.
 *
 *   ^1.2.3  → >=1.2.3,<2.0.0     (first non-zero segment is the ceiling)
 *   ^0.2.3  → >=0.2.3,<0.3.0
 *   ~1.2.3  → >=1.2.3,<1.3.0
 *   ~1       → >=1,<2
 *
 * Everything else (`>=`, `==`, `*`, compound ranges) is passed through.
 */
export function poetryConstraintToPep440(constraint: string): string {
	const trimmed = constraint.trim();
	if (!trimmed) {
		return "";
	}

	const caret = trimmed.match(/^\^(\d+(?:\.\d+)*)(.*)$/);
	if (caret) {
		const release = caret[1].split(".").map((part) => Number(part));
		const ceiling = caretCeiling(release);
		return `>=${caret[1]}${caret[2]},<${ceiling}`;
	}

	const tilde = trimmed.match(/^~(\d+(?:\.\d+)*)(.*)$/);
	if (tilde) {
		const release = tilde[1].split(".").map((part) => Number(part));
		// `~1` allows the whole 1.x line; `~1.2` and `~1.2.3` pin the minor.
		const ceiling =
			release.length === 1
				? `${release[0] + 1}.0.0`
				: `${release[0]}.${release[1] + 1}.0`;
		return `>=${tilde[1]}${tilde[2]},<${ceiling}`;
	}

	return trimmed;
}

/** Upper bound of a caret range: bump the first non-zero segment. */
function caretCeiling(release: number[]): string {
	const next = release.slice();
	let index = next.findIndex((part) => part !== 0);
	if (index === -1) {
		index = next.length - 1;
	}
	next[index] += 1;
	for (let i = index + 1; i < next.length; i++) {
		next[i] = 0;
	}
	return next.join(".");
}

/**
 * One Poetry dependency table (`[tool.poetry.dependencies]` and friends).
 *
 * The value is either a constraint string or an inline table whose `version`
 * holds it. Entries with only a `git`/`path`/`url` source carry no registry
 * version, and `python` is the interpreter constraint rather than a package.
 */
function extractPoetryTable(
	table: Record<string, PoetryDependency> | undefined,
	section: string,
	lines: string[],
	extra?: string,
): PyProjectDependency[] {
	if (!table) {
		return [];
	}

	const result: PyProjectDependency[] = [];
	for (const [packageName, value] of Object.entries(table)) {
		if (packageName.toLowerCase() === "python") {
			continue;
		}
		const rawConstraint =
			typeof value === "string" ? value : (value?.version ?? "");
		if (!rawConstraint) {
			continue;
		}
		const versionSpecifier = poetryConstraintToPep440(rawConstraint);
		if (!versionSpecifier) {
			continue;
		}

		const lineIndex = findPoetryLine(lines, packageName, section, extra);
		if (lineIndex === -1) {
			continue;
		}
		const line = lines[lineIndex];
		const span = findDependencySpan(
			line,
			`${packageName} = "${rawConstraint}"`,
			packageName,
		);

		result.push({
			packageName,
			versionSpecifier,
			section: section as PyProjectDependency["section"],
			extra,
			path: ["tool", "poetry", section, packageName],
			line: lineIndex,
			startColumn: span?.startColumn ?? 0,
			endColumn: span?.endColumn ?? line.length,
		});
	}

	return result;
}

/**
 * Line of a Poetry dependency, limited to its own table so a name repeated in
 * another table resolves to its own entry.
 */
function findPoetryLine(
	lines: string[],
	packageName: string,
	section: string,
	extra?: string,
): number {
	const expectedTable =
		section === "tool.poetry.group"
			? `tool.poetry.group.${extra}.dependencies`
			: section;
	const keyPattern = new RegExp(
		`^\\s*${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`,
	);
	let currentTable = "";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith("[") && line.endsWith("]")) {
			currentTable = line.slice(1, -1);
			continue;
		}
		if (currentTable === expectedTable && keyPattern.test(lines[i])) {
			return i;
		}
	}
	return -1;
}

function extractDependencies(
	deps: string[],
	section:
		| "project.dependencies"
		| "project.optional-dependencies"
		| "dependency-groups",
	lines: string[],
	_content: string,
	extra?: string,
): PyProjectDependency[] {
	const result: PyProjectDependency[] = [];

	for (const depString of deps) {
		// Parse the dependency string (e.g., "flask==2.0.0")
		// Simple regex to split package name from specifier
		const match = depString.match(
			/^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?\s*(.*)$/,
		);
		if (!match) {
			continue;
		}

		const packageName = match[1];
		const versionSpecifier = match[2]?.trim() || "";

		if (!PACKAGE_NAME_REGEX.test(packageName)) {
			continue;
		}

		// Find the line number in the original content
		// This is a bit tricky with TOML since the parser doesn't give line numbers.
		// We search for the dependency string in the lines.
		// Note: This might be inaccurate if the same dependency string appears multiple times (e.g. comments).
		// A robust solution would track position, but for now we scan lines.
		const lineIndex = findDependencyLine(lines, depString, section, extra);

		if (lineIndex !== -1) {
			const line = lines[lineIndex];
			// indexOf(packageName) matches a longer name that shares the prefix
			// ("pytest" inside "pytest-cov") and the upgrade then edits the
			// wrong dependency. Locate this dependency's own quoted string.
			const span = findDependencySpan(line, depString, packageName);

			result.push({
				packageName,
				versionSpecifier,
				section,
				extra,
				path: dependencyPath(section, extra, packageName),
				line: lineIndex,
				startColumn: span?.startColumn ?? 0,
				endColumn: span?.endColumn ?? line.length,
			});
		}
	}

	return result;
}

/** TOML path of one dependency, for diagnostics and structured edits. */
function dependencyPath(
	section: string,
	extra: string | undefined,
	packageName: string,
): string[] {
	if (section === "dependency-groups") {
		return ["dependency-groups", extra ?? "", packageName];
	}
	if (section === "project.optional-dependencies") {
		return ["project", "optional-dependencies", extra ?? "", packageName];
	}
	return ["project", "dependencies", packageName];
}

function findDependencyLine(
	lines: string[],
	depString: string,
	section: string,
	extra?: string,
): number {
	// Heuristic to find the line number
	// We search for the string inside quotes
	// We also try to respect the section context if possible (simplified here)

	// Create a regex that matches the dependency string within quotes
	// Escape special regex characters in depString
	const escapedDep = depString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(`['"]${escapedDep}['"]`);

	// State machine to track section
	let currentSection = "";
	let currentExtra = "";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Update section
		if (line.startsWith("[") && line.endsWith("]")) {
			currentSection = line.slice(1, -1);
			if (
				!currentSection.includes("optional-dependencies") &&
				!currentSection.startsWith("dependency-groups")
			) {
				currentExtra = "";
			}
			continue;
		}

		// Update extra for optional-dependencies and dependency-groups
		if (
			currentSection.includes("optional-dependencies") ||
			currentSection.startsWith("dependency-groups")
		) {
			const match = line.match(/^([a-zA-Z0-9._-]+)\s*=/);
			if (match) {
				currentExtra = match[1];
			}
		}

		// Check match
		if (regex.test(line)) {
			// Verify context
			if (section === "project.dependencies") {
				if (
					currentSection === "project" ||
					currentSection === "project.dependencies"
				) {
					return i;
				}
			} else if (section === "project.optional-dependencies") {
				// Check if we are in [project.optional-dependencies]
				// If extra is provided, try to ensure we are in the right block
				// This is a best-effort heuristic
				if (currentSection.startsWith("project.optional-dependencies")) {
					// Either [project.optional-dependencies] table or [project.optional-dependencies.extra]
					if (currentSection === `project.optional-dependencies.${extra}`) {
						return i;
					}
					if (
						currentSection === "project.optional-dependencies" &&
						currentExtra === extra
					) {
						return i;
					}
				}
			} else if (section === "dependency-groups") {
				// Either [dependency-groups] with an inline group key, or
				// [dependency-groups.<group>]. Both must match the group name so
				// the same requirement in two groups lands on its own line.
				if (currentSection === `dependency-groups.${extra}`) {
					return i;
				}
				if (currentSection === "dependency-groups" && currentExtra === extra) {
					return i;
				}
			}
		}
	}

	// Fallback: just find the first occurrence if context matching failed (e.g. inline tables)
	for (let i = 0; i < lines.length; i++) {
		if (regex.test(lines[i])) {
			return i;
		}
	}

	return -1;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Column span of one dependency requirement inside a TOML line.
 * The package name is matched inside its own quoted requirement so a shorter
 * name cannot land on a longer neighbor (`pytest` vs `pytest-cov`).
 */
function findDependencySpan(
	line: string,
	depString: string,
	packageName: string,
): { startColumn: number; endColumn: number } | null {
	const quoted = new RegExp(`(['"])${escapeRegExp(depString)}\\1`, "g");
	for (const quotedMatch of line.matchAll(quoted)) {
		const contentStart = quotedMatch.index + 1;
		const closingQuote = quotedMatch.index + quotedMatch[0].length - 1;
		const relativeName = depString.indexOf(packageName);
		if (relativeName < 0) {
			continue;
		}
		const nameIndex = contentStart + relativeName;
		const afterName = line[nameIndex + packageName.length];
		if (afterName && /[A-Za-z0-9._-]/.test(afterName)) {
			continue;
		}
		return { startColumn: nameIndex, endColumn: closingQuote };
	}

	const boundary = new RegExp(
		`(?<![A-Za-z0-9._-])${escapeRegExp(packageName)}(?![A-Za-z0-9._-])`,
		"g",
	);
	const specTail = depString.slice(packageName.length);
	for (const boundaryMatch of line.matchAll(boundary)) {
		const after = line.slice(boundaryMatch.index + packageName.length);
		if (!specTail || after.startsWith(specTail)) {
			return {
				startColumn: boundaryMatch.index,
				endColumn: Math.min(
					line.length,
					boundaryMatch.index + depString.length,
				),
			};
		}
	}

	return null;
}

/**
 * Format a PyProjectDependency back to a dependency string
 */
export function formatPyProjectDependency(dep: PyProjectDependency): string {
	if (dep.versionSpecifier) {
		return `${dep.packageName}${dep.versionSpecifier}`;
	}
	return dep.packageName;
}

/**
 * Convert pyproject dependency to requirements.txt format for compatibility
 */
export function toRequirementsFormat(dep: PyProjectDependency): string {
	let result = dep.packageName;

	if (dep.versionSpecifier) {
		result += dep.versionSpecifier;
	}

	// Add extra for optional dependencies
	if (dep.extra) {
		result += `[${dep.extra}]`;
	}

	return result;
}

/**
 * Check if a file is a pyproject.toml file based on its content
 */
export function isPyProjectToml(content: string): boolean {
	try {
		const parsed = toml.parse(content) as any;
		return !!(
			(parsed.project &&
				(parsed.project.dependencies ||
					parsed.project["optional-dependencies"])) ||
			parsed["dependency-groups"]
		);
	} catch {
		return false;
	}
}
