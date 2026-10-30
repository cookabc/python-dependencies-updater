export interface DependencyOffsets {
	start: number;
	end: number;
}

export type DependencySection =
	| "dependencies"
	| "devDependencies"
	| "peerDependencies"
	| "optionalDependencies";

export interface ParsedDependency {
	name: string;
	/** Which package.json object this dependency was read from. */
	section: DependencySection;
	/**
	 * Package to query on the registry. Equals `name` except for `npm:` aliases,
	 * where it is the aliased package (`npm:lodash@^4.17.0` → `lodash`).
	 */
	registryName: string;
	currentVersion: string;
	isDev: boolean;
	// peerDependencies express host compatibility windows; "Update All"
	// deliberately skips them
	isPeer?: boolean;
	// Offsets for the key (name) - useful for CodeLens location
	nameRange: DependencyOffsets;
	// Offsets for the value (version) - useful for replacement
	versionRange: DependencyOffsets;
}

export interface PackageVersionInfo {
	name: string;
	latestVersion: string;
	summary?: string;
	homepage?: string;
}

/**
 * Enrichment from the version manifest. The abbreviated packument carries
 * neither description nor homepage, and the full packument is much larger.
 */
export interface PackageDetails {
	description?: string;
	homepage?: string;
}

export interface NpmClientResult {
	package: PackageVersionInfo;
	exists: boolean;
	error?: string;
}

export enum UpdateRisk {
	Low = "low", // Patch
	Medium = "medium", // Minor
	High = "high", // Major
}
