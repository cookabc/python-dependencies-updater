/** Execute argument arrays without a shell, with bounded logs and cancellation. */
import { spawn } from "node:child_process";
import * as path from "node:path";
export interface Command {
	executable: string;
	args: string[];
}
export interface CommandResult {
	code: number | null;
	output: string;
}
export function runCommand(
	command: Command,
	cwd: string,
	signal?: AbortSignal,
	onOutput?: (text: string) => void,
	timeoutMs = 600000,
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		if (
			!command.executable ||
			!Array.isArray(command.args) ||
			command.args.some((arg) => typeof arg !== "string")
		) {
			reject(
				new Error(
					"Validation commands need an executable and string arguments.",
				),
			);
			return;
		}
		if (signal?.aborted) {
			reject(new Error("Validation cancelled"));
			return;
		}
		const detached = process.platform !== "win32";
		const child = spawn(command.executable, command.args, {
			cwd,
			shell: false,
			detached,
			windowsHide: true,
			env: validationEnvironment(cwd),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let stopped: string | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const kill = (signal: NodeJS.Signals) => {
			try {
				if (detached && child.pid) process.kill(-child.pid, signal);
				else child.kill(signal);
			} catch {
				/* Process already exited. */
			}
		};
		const stop = (message: string) => {
			if (stopped) return;
			stopped = message;
			kill("SIGTERM");
			killTimer = setTimeout(() => kill("SIGKILL"), 1000);
		};
		const abort = () => stop("Validation cancelled");
		signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => stop("Validation timed out"), timeoutMs);
		const collect = (chunk: Buffer) => {
			const text = chunk.toString();
			output = (output + text).slice(-65536);
			onOutput?.(text);
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		const cleanup = () => {
			clearTimeout(timer);
			if (killTimer) clearTimeout(killTimer);
			signal?.removeEventListener("abort", abort);
		};
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("close", (code) => {
			cleanup();
			if (stopped) reject(new Error(stopped));
			else resolve({ code, output });
		});
	});
}

/** Activated environments and global install settings must not redirect the temporary run. */
export function validationEnvironment(
	cwd: string,
	inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const env = { ...inherited };
	const activeRoots = [
		inherited.VIRTUAL_ENV,
		inherited.CONDA_PREFIX,
		inherited.UV_PROJECT_ENVIRONMENT,
	].filter((value): value is string => !!value && path.isAbsolute(value));
	const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
	if (pathKey)
		env[pathKey] = (env[pathKey] ?? "")
			.split(path.delimiter)
			.filter(
				(entry) =>
					!entry.replace(/\\/g, "/").endsWith("/node_modules/.bin") &&
					!activeRoots.some((root) =>
						path.resolve(entry).startsWith(path.resolve(root) + path.sep),
					),
			)
			.join(path.delimiter);
	for (const name of [
		"VIRTUAL_ENV",
		"CONDA_PREFIX",
		"PYTHONHOME",
		"PYTHONPATH",
		"NODE_PATH",
		"PIP_TARGET",
		"PIP_PREFIX",
		"PIP_USER",
		"UV_ACTIVE",
	])
		delete env[name];
	return {
		...env,
		CI: "true",
		GIT_TERMINAL_PROMPT: "0",
		UV_PROJECT_ENVIRONMENT: path.join(cwd, ".venv"),
		UV_LINK_MODE: "copy",
		POETRY_VIRTUALENVS_IN_PROJECT: "true",
		POETRY_VIRTUALENVS_CREATE: "true",
		npm_config_global: "false",
		NPM_CONFIG_GLOBAL: "false",
		npm_config_prefix: cwd,
		NPM_CONFIG_PREFIX: cwd,
	};
}
