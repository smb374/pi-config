import { type ChildProcess, spawn } from "node:child_process";
import { accessSync, createReadStream, constants as fsConstants, statSync } from "node:fs";
import { constants, homedir } from "node:os";
import { resolve } from "node:path";
import { pipeline, type Writable } from "node:stream";

import { EXPANDED_LINES } from "./display.ts";
import { createOutput } from "./output.ts";

export type ExecArgs = {
  prg: string;
  args?: string[];
  cwd?: string;
  env?: string[];
  stdin?: { text: string } | { path: string };
  timeout?: number;
};

export type Killed = "timeout" | "aborted";
export type ExecOutcome = {
  status?: number;
  killed?: Killed;
  isError?: true;
  msg?: string;
  text: string;
  /** The last output lines, for the display. */
  tail?: string[];
  /** The spill file, when the output was cut. */
  spill?: string;
};

/** "status N · T s", plus " · killed: <detail>" when exec killed the program. */
function statusLine(status: number, started: number, killedDetail?: string): string {
  return `status ${status} · ${elapsed(started)} s${killedDetail ? ` · killed: ${killedDetail}` : ""}`;
}

/** Invalid input is status 127: nothing ran. */
function invalid(msg: string, started: number): ExecOutcome {
  return { status: 127, isError: true, msg, text: `${statusLine(127, started)}\n${msg}` };
}

/** Returns "field: reason" for the first invalid field, else undefined. */
function validate(a: ExecArgs): string | undefined {
  const hasNul = (s: string) => s.includes("\0");
  if (a.prg === "") return "prg: must not be empty";
  if (hasNul(a.prg)) return "prg: must not contain a NUL byte";
  if (a.args?.some(hasNul)) return "args: must not contain a NUL byte";
  if (a.cwd !== undefined && hasNul(a.cwd)) return "cwd: must not contain a NUL byte";
  if (a.env?.some(hasNul)) return "env: must not contain a NUL byte";
  if (a.env?.some((e) => e.startsWith("=") || e === "")) return "env: key must not be empty";
  if (a.stdin && hasNul("text" in a.stdin ? a.stdin.text : a.stdin.path)) {
    return "stdin: must not contain a NUL byte";
  }
  if (a.timeout !== undefined && !(a.timeout > 0)) return "timeout: must be greater than 0";
  return undefined;
}

/** A leading ~ is HOME; a relative path resolves against defaultCwd. */
export function resolveCwd(cwd: string | undefined, defaultCwd: string): string {
  if (cwd === undefined) return defaultCwd;
  const home = process.env.HOME || homedir();
  const expanded = cwd === "~" || cwd.startsWith("~/") ? home + cwd.slice(1) : cwd;
  return resolve(defaultCwd, expanded);
}

type Lookup = { kind: "found" | "denied"; path: string } | { kind: "missing" };

function classify(path: string): Lookup {
  try {
    if (!statSync(path).isFile()) return { kind: "denied", path };
    accessSync(path, fsConstants.X_OK);
    return { kind: "found", path };
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "ENOTDIR"
      ? { kind: "missing" }
      : { kind: "denied", path };
  }
}

/** With a slash: resolve against cwd. Without: first executable match in Pi's PATH, like a shell. */
function lookup(prg: string, cwd: string): Lookup {
  if (prg.includes("/")) return classify(resolve(cwd, prg));
  let denied: Lookup = { kind: "missing" };
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const hit = classify(resolve(dir || ".", prg));
    if (hit.kind === "found") return hit;
    if (hit.kind === "denied" && denied.kind === "missing") denied = hit;
  }
  return denied;
}

const NON_INTERACTIVE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_EDITOR: "true",
  PAGER: "cat",
  GIT_PAGER: "cat",
  CI: "1",
  DEBIAN_FRONTEND: "noninteractive",
};

/** Pi's env, then the non-interactive overlay, then the caller's entries in order: "K=V" sets, "K" unsets. */
function buildEnv(entries: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...NON_INTERACTIVE_ENV };
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq < 0) delete env[entry];
    else env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return env;
}

const SPLIT_HINT = (prg: string) => `prg is "${prg}". Put the program in prg and each argument in args.`;

const SHELL_TOKENS = ["|", ">", "<", "&&", ";"];
const GLOB_CHARS = ["*", "?", "$"];

/** For a non-zero status: the first arg that is a whole shell token or a whitespace-free glob/variable word, which the model may think a shell parses. */
// ponytail: a `?` in a URL still fires; upgrade path: restrict (b) to glob-like words.
function shellHint(args: string[] = [], status: number): string | undefined {
  if (status === 0) return undefined;
  for (const arg of args) {
    const char = SHELL_TOKENS.includes(arg)
      ? arg
      : /\s/.test(arg)
        ? undefined
        : GLOB_CHARS.find((c) => arg.includes(c));
    if (char) return `no shell: "${char}" in args is a literal character`;
  }
  return undefined;
}

/** The program did not run (126/127): an error with a msg and the shell hint. */
function notRun(status: number, msg: string, args: ExecArgs, started: number): ExecOutcome {
  const full = [msg, shellHint(args.args, status)].filter(Boolean).join("\n");
  return { status, isError: true, msg: full, text: `${statusLine(status, started)}\n${full}` };
}

function elapsed(started: number): string {
  return ((Date.now() - started) / 1000).toFixed(1);
}
const DEFAULT_TIMEOUT_SECONDS = 120;
const KILL_GRACE_MS = 5000;
/** setTimeout fires after 1 ms when the delay is above 2^31-1 ms. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** Same as pi's BASH_UPDATE_THROTTLE_MS. */
const UPDATE_THROTTLE_MS = 100;

/** Process groups of running children. A group is a child's pid: it is a session leader. */
const liveGroups = new Set<number>();

function signalGroup(pgid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pgid, sig);
  } catch {
    // ESRCH: the group is already gone.
  }
}

const GROUP_POLL_MS = 500;

/** Keep a closed child's group live until it is empty: a daemon with closed pipes can outlive "close". The poll timer is unref'd. `onGone` runs once the group is empty. */
function releaseWhenEmpty(pgid: number, onGone: () => void): void {
  const gone = () => {
    try {
      process.kill(-pgid, 0);
      return false;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ESRCH";
    }
  };
  const release = () => {
    liveGroups.delete(pgid);
    onGone();
  };
  if (gone()) {
    release();
    return;
  }
  const poll = setInterval(() => {
    if (!gone()) return;
    clearInterval(poll);
    release();
  }, GROUP_POLL_MS);
  poll.unref();
}

/** SIGKILL every live group. Called on session shutdown so no group outlives Pi. */
export function killAllGroups(): void {
  for (const pgid of liveGroups) signalGroup(pgid, "SIGKILL");
}

/** Number of groups still tracked. For tests. */
export function liveGroupCount(): number {
  return liveGroups.size;
}

/** Spawn without a shell, stdin /dev/null unless given, stdout+stderr merged by line in arrival order, cut to the tail with a spill file. Timeout or abort starts the kill sequence. `onUpdate` gets the last output lines, throttled, while the program runs. */
export async function runExec(
  args: ExecArgs,
  defaultCwd: string,
  signal?: AbortSignal,
  onUpdate?: (tail: string[]) => void,
): Promise<ExecOutcome> {
  const started = Date.now();
  const problem = validate(args);
  if (problem) return invalid(problem, started);
  const cwd = resolveCwd(args.cwd, defaultCwd);
  try {
    if (!statSync(cwd).isDirectory()) return invalid(`cwd: not a directory: ${cwd}`, started);
  } catch {
    return invalid(`cwd: no such directory: ${cwd}`, started);
  }

  const stdinPath = args.stdin && "path" in args.stdin ? resolve(cwd, args.stdin.path) : undefined;
  if (stdinPath !== undefined) {
    try {
      if (statSync(stdinPath).isDirectory()) return invalid(`stdin: is a directory: ${stdinPath}`, started);
      accessSync(stdinPath, fsConstants.R_OK);
    } catch {
      return invalid(`stdin: cannot read file: ${stdinPath}`, started);
    }
  }

  const found = lookup(args.prg, cwd);
  if (found.kind !== "found") {
    const [status, msg] =
      found.kind === "denied"
        ? [126, `not executable: ${found.path}`]
        : [127, args.prg.includes(" ") ? SPLIT_HINT(args.prg) : `program not found in PATH: ${args.prg}`];
    return notRun(status, msg, args, started);
  }

  const timeoutSeconds = args.timeout ?? DEFAULT_TIMEOUT_SECONDS;
  return new Promise((resolvePromise) => {
    /** Bun throws spawn errors; Node emits "error". ENOENT (a missing shebang interpreter) is 127; any other error is 126: could not execute. */
    const spawnFailed = (e: NodeJS.ErrnoException): ExecOutcome =>
      notRun(e.code === "ENOENT" ? 127 : 126, `cannot start ${found.path}: ${e.message}`, args, started);
    let child: ChildProcess;
    try {
      child = spawn(found.path, args.args ?? [], {
        argv0: args.prg,
        cwd,
        env: buildEnv(args.env),
        stdio: args.stdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
        // setsid: new session and process group, no controlling terminal.
        detached: true,
      });
    } catch (e) {
      return resolvePromise(spawnFailed(e as NodeJS.ErrnoException));
    }
    const pgid = child.pid;
    if (pgid !== undefined) liveGroups.add(pgid);
    if (args.stdin) {
      // EPIPE is normal when the child exits before it reads all input.
      child.stdin?.on("error", () => {});
      if (stdinPath !== undefined) {
        // pipeline destroys the file stream when the child closes stdin early, so no fd leaks.
        pipeline(createReadStream(stdinPath), child.stdin as Writable, () => {});
      } else child.stdin?.end((args.stdin as { text: string }).text);
    }

    let killed: Killed | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    /** SIGTERM now, SIGKILL after the grace period. The grace timer outlives "close" while the group is not empty (see releaseWhenEmpty), so a grandchild that ignores SIGTERM still dies. */
    const kill = (why: Killed) => {
      if (killed || pgid === undefined) return;
      killed = why;
      signalGroup(pgid, "SIGTERM");
      graceTimer = setTimeout(() => signalGroup(pgid, "SIGKILL"), KILL_GRACE_MS);
    };
    const timeoutTimer = setTimeout(() => kill("timeout"), Math.min(timeoutSeconds * 1000, MAX_TIMER_MS));
    const onAbort = () => kill("aborted");
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });

    const output = createOutput();
    /** Leading edge, then at most one update per UPDATE_THROTTLE_MS. A timer pending at exit is flushed once, before the run resolves. */
    let lastUpdate = 0;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const emitUpdate = () => {
      updateTimer = undefined;
      lastUpdate = Date.now();
      onUpdate?.(output.preview(EXPANDED_LINES));
    };
    const scheduleUpdate = () => {
      if (!onUpdate || updateTimer) return;
      const wait = lastUpdate + UPDATE_THROTTLE_MS - Date.now();
      if (wait <= 0) emitUpdate();
      else updateTimer = setTimeout(emitUpdate, wait);
    };
    for (const [name, stream] of [
      ["out", child.stdout],
      ["err", child.stderr],
    ] as const) {
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk: string) => {
        output.push(name, chunk);
        scheduleUpdate();
      });
    }
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener("abort", onAbort);
      if (updateTimer) {
        clearTimeout(updateTimer);
        emitUpdate();
      }
    };
    child.on("error", (e) => {
      cleanup();
      clearTimeout(graceTimer);
      if (pgid !== undefined) liveGroups.delete(pgid);
      resolvePromise(spawnFailed(e));
    });
    // "close" fires after both streams end, so no output is lost.
    child.on("close", async (code, signalName) => {
      cleanup();
      if (pgid !== undefined) {
        // The grace timer must not hold Pi open; it still fires while the group lives.
        graceTimer?.unref();
        releaseWhenEmpty(pgid, () => clearTimeout(graceTimer));
      }
      const status = code ?? 128 + (signalName ? (constants.signals[signalName] ?? 0) : 0);
      const merged = await output.finish();
      const tail = output.preview(EXPANDED_LINES);
      const spill = output.spillPath();
      const body = merged ? `\n${merged}` : "";
      const hint = shellHint(args.args, status);
      if (!killed) {
        return resolvePromise({
          status,
          msg: hint,
          text: statusLine(status, started) + (hint ? `\n${hint}` : "") + body,
          tail,
          spill,
        });
      }
      const detail = killed === "timeout" ? `timeout after ${timeoutSeconds} s` : "aborted";
      const msg = [`killed by exec: ${detail}`, hint].filter(Boolean).join("\n");
      resolvePromise({
        status,
        killed,
        isError: true,
        msg,
        text: `${statusLine(status, started, detail)}\n${msg}${body}`,
        tail,
        spill,
      });
    });
  });
}
