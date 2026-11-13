import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCall, resultBody, shellQuote } from "./display.ts";
import register from "./index.ts";
import { createOutput } from "./output.ts";
import { killAllGroups, liveGroupCount, runExec } from "./run.ts";

test("exit 0 is status 0", async () => {
  const r = await runExec({ prg: "true" }, process.cwd());
  expect(r.status).toBe(0);
  expect(r.text).toMatch(/^status 0 · \d+\.\d s$/);
});

test("non-zero exit is data", async () => {
  const r = await runExec({ prg: "false" }, process.cwd());
  expect(r.status).toBe(1);
  expect(r.text).toStartWith("status 1 · ");
});

test("a fatal signal is status 128+N", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "kill -9 $$"] }, process.cwd());
  expect(r.status).toBe(137);
});

test("args are literal, not split or joined", async () => {
  const r = await runExec({ prg: "echo", args: ["a", "b"] }, process.cwd());
  expect(r.text).toEndWith("\na b\n");
  const spaced = await runExec({ prg: "echo", args: ["a  b"] }, process.cwd());
  expect(spaced.text).toEndWith("\na  b\n");
});

test("a literal * is not expanded", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  writeFileSync(join(dir, "file1"), "");
  const r = await runExec({ prg: "echo", args: ["*"] }, dir);
  expect(r.text).toEndWith("\n*\n");
});

test("cwd defaults to the given directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const r = await runExec({ prg: "pwd", args: ["-P"] }, dir);
  expect(r.text).toContain(`\n${realpathSync(dir)}\n`);
});

test("stdin is /dev/null", async () => {
  const r = await runExec({ prg: "cat" }, process.cwd());
  expect(r.status).toBe(0);
  expect(r.text).not.toContain("\n");
});

test("stdout and stderr are both in the text", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "echo out; echo err >&2"] }, process.cwd());
  expect(r.text).toContain("out\n");
  expect(r.text).toContain("err\n");
});

// Slice 2: validation + lookup

const here = process.cwd();

test.each([
  ["empty prg", { prg: "" }, "prg"],
  ["NUL in prg", { prg: "ec\0ho" }, "prg"],
  ["NUL in args", { prg: "echo", args: ["a\0b"] }, "args"],
  ["NUL in cwd", { prg: "echo", cwd: "/tm\0p" }, "cwd"],
  ["NUL in env", { prg: "echo", env: ["A=b\0"] }, "env"],
  ["NUL in stdin text", { prg: "cat", stdin: { text: "a\0" } }, "stdin"],
  ["NUL in stdin path", { prg: "cat", stdin: { path: "a\0" } }, "stdin"],
  ["timeout 0", { prg: "echo", timeout: 0 }, "timeout"],
  ["negative timeout", { prg: "echo", timeout: -1 }, "timeout"],
  ["env entry with an empty key", { prg: "echo", env: ["=x"] }, "env"],
  ["empty env entry", { prg: "echo", env: [""] }, "env"],
  ["missing stdin path", { prg: "cat", stdin: { path: "/no/such/file-xyz" } }, "stdin"],
  ["stdin path is a directory", { prg: "cat", stdin: { path: "/tmp" } }, "stdin"],
  ["missing cwd", { prg: "echo", cwd: "/no/such/dir-xyz" }, "cwd"],
  ["cwd is a file", { prg: "echo", cwd: "/etc/passwd" }, "cwd"],
])("invalid input: %s", async (_name, input, field) => {
  const r = await runExec(input, here);
  expect(r.isError).toBe(true);
  expect(r.msg).toStartWith(`${field}:`);
  expect(r.status).toBe(127);
  expect(r.text).toMatch(/^status 127 · \d+\.\d s\n/);
  expect(r.text).toEndWith(`\n${r.msg}`);
});

test("cwd: ~ expands to HOME", async () => {
  const home = mkdtempSync(join(tmpdir(), "exec-home-"));
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    const r = await runExec({ prg: "pwd", args: ["-P"], cwd: "~" }, here);
    expect(r.text).toContain(`\n${realpathSync(home)}\n`);
  } finally {
    process.env.HOME = saved;
  }
});

test("cwd: a relative path resolves against the default cwd", async () => {
  const base = mkdtempSync(join(tmpdir(), "exec-test-"));
  mkdirSync(join(base, "sub"));
  const r = await runExec({ prg: "pwd", args: ["-P"], cwd: "sub" }, base);
  expect(r.text).toContain(`\n${realpathSync(join(base, "sub"))}\n`);
});

test("unknown program is status 127 and an error", async () => {
  const r = await runExec({ prg: "no-such-prg-xyz" }, here);
  expect(r.status).toBe(127);
  expect(r.isError).toBe(true);
  expect(r.text).toStartWith("status 127 · ");
  expect(r.msg).toBe("program not found in PATH: no-such-prg-xyz");
  expect(r.text).toContain(`\n${r.msg}`);
});

test("a non-executable file is status 126 and an error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const file = join(dir, "plain");
  writeFileSync(file, "#!/bin/sh\necho hi\n");
  chmodSync(file, 0o644);
  const r = await runExec({ prg: file }, here);
  expect(r.status).toBe(126);
  expect(r.isError).toBe(true);
  expect(r.msg).toBe(`not executable: ${file}`);
});

test("a directory as prg is status 126", async () => {
  const r = await runExec({ prg: "/tmp" }, here);
  expect(r.status).toBe(126);
});

test("a missing path with a slash is status 127", async () => {
  const r = await runExec({ prg: "./nope" }, here);
  expect(r.status).toBe(127);
  expect(r.isError).toBe(true);
});

test("a prg with a slash resolves against cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const file = join(dir, "script");
  writeFileSync(file, "#!/bin/sh\necho from-script\n");
  chmodSync(file, 0o755);
  const r = await runExec({ prg: "./script", cwd: dir }, here);
  expect(r.status).toBe(0);
  expect(r.isError).toBeUndefined();
  expect(r.text).toContain("from-script");
});

test("a prg without a slash is found in process.env.PATH", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const file = join(dir, "my-tool-xyz");
  writeFileSync(file, "#!/bin/sh\necho found-it\n");
  chmodSync(file, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    const r = await runExec({ prg: "my-tool-xyz" }, here);
    expect(r.status).toBe(0);
    expect(r.text).toContain("found-it");
  } finally {
    process.env.PATH = saved;
  }
});

test("the lookup skips a non-executable file earlier in PATH", async () => {
  const bad = mkdtempSync(join(tmpdir(), "exec-test-"));
  const good = mkdtempSync(join(tmpdir(), "exec-test-"));
  writeFileSync(join(bad, "dup-tool"), "x");
  chmodSync(join(bad, "dup-tool"), 0o644);
  writeFileSync(join(good, "dup-tool"), "#!/bin/sh\necho good\n");
  chmodSync(join(good, "dup-tool"), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bad}:${good}`;
  try {
    const r = await runExec({ prg: "dup-tool" }, here);
    expect(r.status).toBe(0);
    expect(r.text).toContain("good");
  } finally {
    process.env.PATH = saved;
  }
});

test("a caller PATH in env does not change the lookup", async () => {
  const r = await runExec({ prg: "echo", args: ["ok"], env: ["PATH=/no/such/dir"] }, here);
  expect(r.status).toBe(0);
  expect(r.text).toEndWith("\nok\n");
});

test("argv[0] is prg as given, not the absolute path", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "tr '\\0' ' ' < /proc/$$/cmdline"] }, here);
  expect(r.text).toContain("\nsh -c ");
});
// Slice 3: env + stdin

/** Runs printenv for one variable; returns its value line or undefined when unset. */
async function envOf(name: string, env?: string[]): Promise<string | undefined> {
  const r = await runExec({ prg: "printenv", args: [name], env }, here);
  return r.status === 0 ? r.text.split("\n")[1] : undefined;
}

test("the non-interactive overlay reaches the child", async () => {
  const r = await runExec({ prg: "env" }, here);
  for (const line of [
    "GIT_TERMINAL_PROMPT=0",
    "GIT_EDITOR=true",
    "PAGER=cat",
    "GIT_PAGER=cat",
    "CI=1",
    "DEBIAN_FRONTEND=noninteractive",
  ]) {
    expect(r.text.split("\n")).toContain(line);
  }
});

test("Pi's env reaches the child", async () => {
  process.env.EXEC_TEST_PI_VAR = "from-pi";
  try {
    expect(await envOf("EXEC_TEST_PI_VAR")).toBe("from-pi");
  } finally {
    delete process.env.EXEC_TEST_PI_VAR;
  }
});

test("env K=V sets, and the value may contain =", async () => {
  expect(await envOf("EXEC_A", ["EXEC_A=b=c"])).toBe("b=c");
});

test("env K=V overrides the overlay and Pi's env", async () => {
  expect(await envOf("CI", ["CI=0"])).toBe("0");
  expect(await envOf("HOME", ["HOME=/nowhere"])).toBe("/nowhere");
});

test("env K unsets, including an overlay variable", async () => {
  expect(await envOf("CI", ["CI"])).toBeUndefined();
  expect(await envOf("HOME", ["HOME"])).toBeUndefined();
});

test("env: the last entry for a key wins", async () => {
  expect(await envOf("EXEC_A", ["EXEC_A=1", "EXEC_A=2"])).toBe("2");
  expect(await envOf("EXEC_A", ["EXEC_A=1", "EXEC_A"])).toBeUndefined();
  expect(await envOf("EXEC_A", ["EXEC_A", "EXEC_A=3"])).toBe("3");
});

test("an empty env value is set, not unset", async () => {
  expect((await runExec({ prg: "printenv", args: ["EXEC_A"], env: ["EXEC_A="] }, here)).status).toBe(0);
});

test("stdin text is written as UTF-8, then closes", async () => {
  const r = await runExec({ prg: "cat", stdin: { text: "héllo ✓\n" } }, here);
  expect(r.status).toBe(0);
  expect(r.text).toEndWith("\nhéllo ✓\n");
});

test("stdin path streams a file, relative to cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  writeFileSync(join(dir, "in.txt"), "from-file\n");
  const r = await runExec({ prg: "cat", cwd: dir, stdin: { path: "in.txt" } }, here);
  expect(r.status).toBe(0);
  expect(r.text).toEndWith("\nfrom-file\n");
});

test("stdin path is binary-safe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  writeFileSync(join(dir, "bin"), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  const r = await runExec({ prg: "wc", args: ["-c"], cwd: dir, stdin: { path: "bin" } }, here);
  expect(r.text).toEndWith("\n4\n");
});

test("10 MB of stdin text into a child that exits early does not deadlock or throw", async () => {
  const r = await runExec({ prg: "head", args: ["-c1"], stdin: { text: "x".repeat(10 * 1024 * 1024) } }, here);
  expect(r.status).toBe(0);
  expect(r.text).toEndWith("\nx");
});

test("10 MB of stdin path into a child that exits early does not deadlock or throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  try {
    writeFileSync(join(dir, "big"), "y".repeat(10 * 1024 * 1024));
    const r = await runExec({ prg: "head", args: ["-c1"], stdin: { path: join(dir, "big") } }, here);
    expect(r.status).toBe(0);
    expect(r.text).toEndWith("\ny");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Slice 4: process + kill

/** True when the process is gone or only a zombie that waits for its parent. */
function isGone(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z") ?? true;
  } catch {
    return true;
  }
}

async function waitGone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (isGone(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

test("a timeout kills the group with SIGTERM", async () => {
  const r = await runExec({ prg: "sleep", args: ["30"], timeout: 0.5 }, here);
  expect(r.killed).toBe("timeout");
  expect(r.status).toBe(143);
  expect(r.isError).toBe(true);
  expect(r.msg).toContain("timeout");
  expect(r.text).toMatch(/^status 143 · 0\.\d s · killed: timeout after 0\.5 s\n/);
  expect(r.text).toContain(`\n${r.msg}`);
});

test("a program that ignores SIGTERM gets SIGKILL after the grace period", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "trap '' TERM; sleep 30"], timeout: 1 }, here);
  expect(r.killed).toBe("timeout");
  expect(r.status).toBe(137);
  expect(Number(/ · (\d+\.\d) s/.exec(r.text)?.[1])).toBeGreaterThanOrEqual(5.9);
}, 15000);

test("the abort signal kills the group", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  const r = await runExec({ prg: "sleep", args: ["30"] }, here, ac.signal);
  expect(r.killed).toBe("aborted");
  expect(r.status).toBe(143);
  expect(r.isError).toBe(true);
  expect(r.text).toMatch(/^status 143 · \d+\.\d s · killed: aborted\n/);
});

test("an already aborted signal still kills the program", async () => {
  const r = await runExec({ prg: "sleep", args: ["30"] }, here, AbortSignal.abort());
  expect(r.killed).toBe("aborted");
});

test("a normal exit before the timeout is not killed", async () => {
  const r = await runExec({ prg: "true", timeout: 5 }, here, new AbortController().signal);
  expect(r.killed).toBeUndefined();
  expect(r.isError).toBeUndefined();
});

test("a kill reaches a grandchild in the group", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "sleep 60 & echo $!; wait"], timeout: 0.5 }, here);
  expect(r.killed).toBe("timeout");
  const pid = Number(r.text.split("\n").find((l) => /^\d+$/.test(l)));
  expect(pid).toBeGreaterThan(1);
  expect(await waitGone(pid)).toBe(true);
});

test("the child has no controlling terminal", async () => {
  const r = await runExec({ prg: "cat", args: ["/dev/tty"], timeout: 5 }, here);
  expect(r.killed).toBeUndefined();
  expect(r.status).not.toBe(0);
  expect(r.text).toContain("/dev/tty");
});

test("killAllGroups sends SIGKILL to every live group", async () => {
  const a = runExec({ prg: "sleep", args: ["30"] }, here);
  const b = runExec({ prg: "sleep", args: ["30"] }, here);
  killAllGroups();
  for (const r of await Promise.all([a, b])) {
    expect(r.status).toBe(137);
    expect(r.killed).toBeUndefined();
  }
});
// Review fixes: spawn failure, large timeout, stdin path kinds

test("a script whose shebang interpreter is missing is status 127, not a throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const file = join(dir, "bad-shebang");
  writeFileSync(file, "#!/no/such/interpreter-xyz\n");
  chmodSync(file, 0o755);
  const r = await runExec({ prg: file }, here);
  expect(r.status).toBe(127);
  expect(r.isError).toBe(true);
  expect(r.text).toStartWith("status 127 · ");
  expect(r.text).toContain(`\n${r.msg}`);
});

test("a script whose shebang interpreter is not executable is status 126, not a throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const interpreter = join(dir, "interp");
  writeFileSync(interpreter, "");
  chmodSync(interpreter, 0o644);
  const file = join(dir, "bad-shebang");
  writeFileSync(file, `#!${interpreter}\n`);
  chmodSync(file, 0o755);
  const r = await runExec({ prg: file }, here);
  expect(r.status).toBe(126);
  expect(r.isError).toBe(true);
  expect(r.text).toStartWith("status 126 · ");
});

test("a spawn error other than ENOENT or EACCES is status 126 with a status line", async () => {
  // One 200 KB argument is over the kernel's 128 KiB per-argument limit: E2BIG.
  const r = await runExec({ prg: "true", args: ["x".repeat(200_000)] }, here);
  expect(r.status).toBe(126);
  expect(r.isError).toBe(true);
  expect(r.text).toStartWith("status 126 · ");
  expect(r.text).toContain(`\n${r.msg}`);
});

test("a timeout above the 2^31-1 ms timer limit does not fire at once", async () => {
  const r = await runExec({ prg: "sleep", args: ["0.3"], timeout: 1e10 }, here);
  expect(r.killed).toBeUndefined();
  expect(r.status).toBe(0);
});

test("stdin path may be a character device", async () => {
  const r = await runExec({ prg: "head", args: ["-c3"], stdin: { path: "/dev/zero" } }, here);
  expect(r.isError).toBeUndefined();
  expect(r.status).toBe(0);
  expect(r.text).toEndWith("\n\0\0\0");
});

test("stdin path: an early-exit child does not leak the file descriptor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  try {
    writeFileSync(join(dir, "big"), "y".repeat(10 * 1024 * 1024));
    const before = readdirSync("/proc/self/fd").length;
    for (let i = 0; i < 5; i++) {
      await runExec({ prg: "head", args: ["-c1"], stdin: { path: join(dir, "big") } }, here);
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(readdirSync("/proc/self/fd").length).toBeLessThanOrEqual(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
// Slice 5: merge + budget + spill

const SPILL = /full output: (\/\S*\/pi-exec-[0-9a-f]{16}\.log)\]$/;
const spillFiles = () => readdirSync(tmpdir()).filter((n) => /^pi-exec-[0-9a-f]{16}\.log$/.test(n));

// Every test deletes the spill files it created: /tmp can be tmpfs (RAM).
let spillsBefore = new Set<string>();
beforeEach(() => {
  spillsBefore = new Set(spillFiles());
});
afterEach(() => {
  for (const name of spillFiles()) if (!spillsBefore.has(name)) rmSync(join(tmpdir(), name), { force: true });
});
const seqText = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}\n`).join("");

test("stderr lines get the 2> prefix, in arrival order", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "echo a; sleep 0.2; echo b >&2; sleep 0.2; echo c"] }, here);
  expect(r.text).toEndWith("\na\n2> b\nc\n");
});

test("with no stdout bytes, stderr lines have no prefix", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "echo err >&2"] }, here);
  expect(r.text).toEndWith("\nerr\n");
  expect(r.text).not.toContain("2> ");
});

test("a partial line flushes at exit, without a newline", async () => {
  const r = await runExec({ prg: "printf", args: ["no-newline"] }, here);
  expect(r.text).toEndWith("\nno-newline");
  const mixed = await runExec({ prg: "sh", args: ["-c", "echo x; sleep 0.2; printf partial >&2"] }, here);
  expect(mixed.text).toEndWith("\nx\n2> partial");
});

test("a line split across chunks is joined", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "printf ab; sleep 0.2; printf 'cd\\n'"] }, here);
  expect(r.text).toEndWith("\nabcd\n");
});

test("small output makes no spill file", async () => {
  const before = spillFiles();
  const r = await runExec({ prg: "seq", args: ["100"] }, here);
  expect(r.text).not.toContain("[output cut");
  expect(spillFiles()).toEqual(before);
});

test("5000 lines: the tail, a cut line, and a spill file with the full output", async () => {
  const r = await runExec({ prg: "seq", args: ["5000"] }, here);
  const lines = r.text.split("\n");
  expect(lines[1]).toBe("3001");
  expect(lines.at(-2)).toBe("5000");
  expect(lines.at(-1)).toMatch(/^\[output cut: last 2000 of 5000 lines; full output: /);
  const path = SPILL.exec(r.text)?.[1] ?? "";
  expect(path).not.toBe("");
  expect(readFileSync(path, "utf8")).toBe(seqText(5000));
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("a cut with a killed status keeps the status line and msg first", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "seq 3000; sleep 30"], timeout: 1 }, here);
  expect(r.killed).toBe("timeout");
  expect(r.text).toMatch(/^status 143 · .* · killed: timeout after 1 s\nkilled by exec: .*\n3000\n/s);
  expect(r.text).toMatch(/\n\[output cut: last 2000 of 3000 lines; /);
});

test("the byte budget cuts as well: 1000 lines of 100 bytes", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", `yes ${"x".repeat(100)} | head -n 1000`] }, here);
  const n = Number(/last (\d+) of 1000 lines/.exec(r.text)?.[1]);
  expect(n).toBeGreaterThan(0);
  expect(n * 101).toBeLessThanOrEqual(50 * 1024);
  expect(readFileSync(SPILL.exec(r.text)?.[1] ?? "", "utf8").length).toBe(101000);
});

test("the spill file has the 2> prefixes when stdout has output", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "echo out; sleep 0.2; seq 3000 >&2"] }, here);
  const path = SPILL.exec(r.text)?.[1] ?? "";
  expect(readFileSync(path, "utf8")).toBe(`out\n${seqText(3000).replace(/^/gm, "2> ").replace(/2> $/, "")}`);
  expect(r.text).toContain("\n2> 3000\n");
});

test("stdout empty: the spill file is rewritten without prefixes", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "seq 3000 >&2"] }, here);
  expect(r.text).not.toContain("2> ");
  const path = SPILL.exec(r.text)?.[1] ?? "";
  expect(readFileSync(path, "utf8")).toBe(seqText(3000));
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("stderr-only output that fits only without prefixes is not cut and leaves no file", async () => {
  const before = spillFiles();
  const r = await runExec({ prg: "sh", args: ["-c", `yes ${"1".repeat(25)} | head -n 1900 >&2`] }, here);
  expect(r.text).not.toContain("[output cut");
  expect(r.text).not.toContain("2> ");
  expect(r.text.split("\n").length).toBe(1902);
  expect(spillFiles()).toEqual(before);
});

test("stderr-only output under the budget opens no spill file before exit", async () => {
  const before = spillFiles();
  const out = createOutput();
  // 1900 lines of 25 bytes: 47.5 KB raw, over 50 KB only with "2> " prefixes.
  for (let i = 0; i < 1900; i++) out.push("err", `${"1".repeat(24)}\n`);
  expect(spillFiles()).toEqual(before);
  // Stdout then makes the prefixes real: the output is now over the budget.
  out.push("out", "x\n");
  expect(spillFiles().length).toBe(before.length + 1);
  await out.finish();
});

test("stripPrefixes failure leaves no .tmp file", async () => {
  const before = spillFiles();
  const out = createOutput();
  for (let i = 0; i < 3000; i++) out.push("err", "line\n"); // stderr only: finish rewrites the spill file
  const spill = join(tmpdir(), spillFiles().find((n) => !before.includes(n)) ?? "");
  const tmp = `${spill}.tmp`;
  // Make the rewrite fail: a directory in place of the spill file cannot be read.
  rmSync(spill);
  mkdirSync(spill);
  try {
    await out.finish();
    expect(readdirSync(tmpdir())).not.toContain(`${spill.split("/").at(-1)}.tmp`);
  } finally {
    rmSync(spill, { recursive: true, force: true });
    rmSync(tmp, { force: true });
  }
});

test("300000 lines keep only a tail but spill all of them", async () => {
  const r = await runExec({ prg: "seq", args: ["300000"] }, here);
  expect(r.text).toMatch(/\n\[output cut: last 2000 of 300000 lines; /);
  expect(r.text.split("\n")[1]).toBe("298001");
  const spill = readFileSync(SPILL.exec(r.text)?.[1] ?? "", "utf8");
  expect(spill.startsWith("1\n2\n")).toBe(true);
  expect(spill.endsWith("\n300000\n")).toBe(true);
});

test("the spill file stops at its size cap and the cut line says so", async () => {
  const out = createOutput(4096);
  for (let i = 0; i < 3000; i++) out.push("out", `line ${i}\n`); // about 28 KB
  const text = await out.finish();
  const path = out.spillPath() ?? "";
  expect(text).toMatch(
    /\n\[output cut: last 2000 of 3000 lines; spill file capped at 4096 bytes, partial output: \S+\]$/,
  );
  expect(path).not.toBe("");
  const size = statSync(path).size;
  expect(size).toBeGreaterThan(0);
  expect(size).toBeLessThanOrEqual(4096);
  expect(readFileSync(path, "utf8").startsWith("line 0\nline 1\n")).toBe(true);
});

// Review fixes 2: a group stays live until it is empty

/** A daemonised grandchild: closed pipes, so "close" fires while it still runs. */
const DAEMON = "sleep 60 >/dev/null 2>&1 </dev/null & echo $!";

test("killAllGroups kills a daemonised grandchild after the child closed", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", DAEMON] }, here);
  const pid = Number(r.text.split("\n").find((l) => /^\d+$/.test(l)));
  expect(pid).toBeGreaterThan(1);
  expect(isGone(pid)).toBe(false);
  killAllGroups();
  expect(await waitGone(pid)).toBe(true);
});

test("a group leaves the live set when it is empty", async () => {
  const before = liveGroupCount();
  const r = await runExec({ prg: "sh", args: ["-c", "sleep 0.3 >/dev/null 2>&1 </dev/null & echo $!"] }, here);
  expect(liveGroupCount()).toBe(before + 1);
  const pid = Number(r.text.split("\n").find((l) => /^\d+$/.test(l)));
  expect(await waitGone(pid)).toBe(true);
  for (let i = 0; i < 40 && liveGroupCount() > before; i++) await new Promise((r) => setTimeout(r, 50));
  expect(liveGroupCount()).toBe(before);
});

test("a grandchild that ignores SIGTERM and outlives close still gets SIGKILL after the grace period", async () => {
  let pid = 0;
  try {
    // The grandchild ignores TERM and has closed pipes, so "close" fires while it runs.
    const script = "(trap '' TERM; exec sleep 30) >/dev/null 2>&1 </dev/null & echo $!; sleep 30";
    const r = await runExec({ prg: "sh", args: ["-c", script], timeout: 0.3 }, here);
    expect(r.killed).toBe("timeout");
    pid = Number(r.text.split("\n").find((l) => /^\d+$/.test(l)));
    expect(pid).toBeGreaterThan(1);
    expect(isGone(pid)).toBe(false);
    let gone = false;
    for (let i = 0; i < 100 && !gone; i++) {
      await Bun.sleep(100);
      gone = isGone(pid);
    }
    expect(gone).toBe(true);
  } finally {
    if (pid > 1) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
}, 20000);

// Slice 6: hints

test("hint: a space in prg at status 127 says to split prg and args", async () => {
  const r = await runExec({ prg: "git status" }, here);
  expect(r.status).toBe(127);
  expect(r.isError).toBe(true);
  expect(r.msg).toBe('prg is "git status". Put the program in prg and each argument in args.');
  expect(r.text).toContain(`\n${r.msg}`);
});

test("hint: other 127 keeps the not-found message", async () => {
  const r = await runExec({ prg: "no-such-prg-xyz", args: ["a", "b"] }, here);
  expect(r.msg).toBe("program not found in PATH: no-such-prg-xyz");
});

test("hint: 126 names the absolute path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-test-"));
  const file = join(dir, "plain");
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o644);
  const r = await runExec({ prg: "./plain", cwd: dir }, here);
  expect(r.status).toBe(126);
  expect(r.msg).toBe(`not executable: ${file}`);
});

test.each(["*", "?", "|", ">", "<", "&&", ";", "$"])("hint: %s alone as an arg at non-zero status", async (char) => {
  const r = await runExec({ prg: "sh", args: ["-c", "exit 3", char] }, here);
  expect(r.status).toBe(3);
  expect(r.isError).toBeUndefined();
  expect(r.msg).toBe(`no shell: "${char}" in args is a literal character`);
  expect(r.text).toStartWith(`status 3 · `);
  expect(r.text).toContain(`\n${r.msg}`);
});

test.each([
  ["*.ts", "*"],
  ["$HOME", "$"],
  ["a?b", "?"],
])("hint: the word %s with no whitespace fires", async (arg, char) => {
  const r = await runExec({ prg: "sh", args: ["-c", "exit 3", arg] }, here);
  expect(r.msg).toBe(`no shell: "${char}" in args is a literal character`);
});

test.each(["a; b", "echo $HOME", "a && b", "*.ts *.js", "x\ty|z"])(
  "hint: the arg %j with whitespace gives no msg",
  async (arg) => {
    const r = await runExec({ prg: "sh", args: ["-c", "exit 3", "-m", arg] }, here);
    expect(r.status).toBe(3);
    expect(r.msg).toBeUndefined();
  },
);

test.each(["a>b", "a|b", "a;b", "a&&b", "a<b"])("hint: the arg %s is not a whole-arg token", async (arg) => {
  const r = await runExec({ prg: "sh", args: ["-c", "exit 3", arg] }, here);
  expect(r.msg).toBeUndefined();
});

test("hint: no shell character at status 0 gives no msg", async () => {
  const r = await runExec({ prg: "echo", args: ["*"] }, here);
  expect(r.status).toBe(0);
  expect(r.msg).toBeUndefined();
});

test("hint: non-zero status without a shell character gives no msg", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "exit 3", "plain"] }, here);
  expect(r.status).toBe(3);
  expect(r.msg).toBeUndefined();
});

test("hint: the msg comes before the output", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "echo out\nexit 3", "*"] }, here);
  expect(r.text.split("\n").slice(1)).toEqual(['no shell: "*" in args is a literal character', "out", ""]);
});

test("hint: the shell hint joins the killed msg", async () => {
  const r = await runExec({ prg: "sh", args: ["-c", "exec sleep 30", "|"], timeout: 0.3 }, here);
  expect(r.killed).toBe("timeout");
  expect(r.msg).toBe('killed by exec: timeout after 0.3 s\nno shell: "|" in args is a literal character');
});

test("hint: the shell hint joins the 127 msg", async () => {
  const r = await runExec({ prg: "no-such-prg-xyz", args: [">"] }, here);
  expect(r.msg).toBe('program not found in PATH: no-such-prg-xyz\nno shell: ">" in args is a literal character');
});

// Slice 7: prompt text, display, streaming.

test.each([
  ["abc", "abc"],
  ["/usr/bin/x-1.2", "/usr/bin/x-1.2"],
  ["", "''"],
  ["a b", "'a b'"],
  ["it's", "'it'\\''s'"],
  ["*", "'*'"],
  ["$HOME", "'$HOME'"],
  ["~", "'~'"],
  ["a=b", "'a=b'"],
  ["a\nb", "'a\nb'"],
])("shellQuote(%j) is %j", (input, quoted) => {
  expect(shellQuote(input)).toBe(quoted);
});

test("formatCall: a quoted command, no notes by default", () => {
  expect(formatCall({ prg: "git", args: ["commit", "-m", "a b"] }, "/w")).toEqual({
    command: "$ git commit -m 'a b'",
    notes: [],
  });
});

test("formatCall: cwd shows only when it differs", () => {
  expect(formatCall({ prg: "ls", cwd: "/tmp" }, "/w").notes).toEqual(["cwd: /tmp"]);
  expect(formatCall({ prg: "ls", cwd: "/w" }, "/w").notes).toEqual([]);
});

test("formatCall: a leading ~ in cwd expands like the runner does", () => {
  const saved = process.env.HOME;
  process.env.HOME = "/h";
  try {
    expect(formatCall({ prg: "ls", cwd: "~" }, "/h").notes).toEqual([]);
    expect(formatCall({ prg: "ls", cwd: "~/sub" }, "/h").notes).toEqual(["cwd: ~/sub"]);
  } finally {
    process.env.HOME = saved;
  }
});

test("formatCall: env shows keys, never values", () => {
  const { notes } = formatCall({ prg: "x", env: ["A=secret", "B"] }, "/w");
  expect(notes).toEqual(["env: A, B"]);
});

test("formatCall: tolerates partial arguments while the call streams in", () => {
  expect(formatCall({}, "/w").command).toBe("$ ...");
});

test("resultBody: collapsed shows the last 5 lines and the msg, no spill path", () => {
  const tail = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
  expect(resultBody({ tail, msg: "m", spill: "/tmp/s.log" }, false)).toEqual(["m", "l26", "l27", "l28", "l29", "l30"]);
});

test("resultBody: expanded shows the last 20 lines and the spill path", () => {
  const tail = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
  const lines = resultBody({ tail, spill: "/tmp/s.log" }, true);
  expect(lines).toHaveLength(21);
  expect(lines[0]).toBe("l11");
  expect(lines[19]).toBe("l30");
  expect(lines[20]).toBe("full output: /tmp/s.log");
});

test("the outcome carries the last 20 output lines", async () => {
  const r = await runExec({ prg: "seq", args: ["1", "30"] }, here);
  expect(r.tail).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 11)));
  expect(r.spill).toBeUndefined();
});

test("the outcome carries the spill path when the output is cut", async () => {
  const r = await runExec({ prg: "seq", args: ["1", "5000"] }, here);
  expect(r.spill).toMatch(/pi-exec-[0-9a-f]{16}\.log$/);
  expect(r.text).toContain(r.spill as string);
  expect(r.tail?.at(-1)).toBe("5000");
});

test("onUpdate is throttled to about one call per 100 ms for a chatty program", async () => {
  // Bounded in lines (300) and rate (about 2 ms between lines): at most a few KB in total.
  const chatty = "i=0; while [ $i -lt 300 ]; do echo x; i=$((i+1)); sleep 0.002; done";
  const updates: string[][] = [];
  const t0 = Date.now();
  const r = await runExec({ prg: "sh", args: ["-c", chatty], timeout: 10 }, here, undefined, (tail) =>
    updates.push(tail),
  );
  const ms = Date.now() - t0;
  expect(r.status).toBe(0);
  // Leading edge + one per 100 ms, with slack for the timer; far fewer than the 300 lines.
  expect(updates.length).toBeGreaterThanOrEqual(2);
  expect(updates.length).toBeLessThanOrEqual(Math.ceil(ms / 100) + 2);
  expect(updates.length).toBeLessThan(100);
  expect(updates[0].length).toBeGreaterThan(0);
  expect(updates.every((u) => u.length <= 20)).toBe(true);
}, 15000);

test("a pending update is flushed once before the run resolves", async () => {
  const updates: string[][] = [];
  // "b" arrives inside the throttle window of the update for "a" and the program exits before it ends.
  const r = await runExec({ prg: "sh", args: ["-c", "echo a; sleep 0.03; echo b"] }, here, undefined, (tail) =>
    updates.push(tail),
  );
  expect(r.status).toBe(0);
  expect(updates.at(-1)).toEqual(["a", "b"]);
});

test("no onUpdate call after the run resolves", async () => {
  let after = 0;
  let done = false;
  await runExec({ prg: "sh", args: ["-c", "echo a; sleep 0.03; echo b"] }, here, undefined, () => {
    if (done) after++;
  });
  done = true;
  await Bun.sleep(250);
  expect(after).toBe(0);
});

test("the registered tool has the spec's prompt text", () => {
  const tools: { name: string; promptSnippet: string; promptGuidelines: string[] }[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: a minimal fake of ExtensionAPI
  register({ registerTool: (t: any) => tools.push(t), on: () => {} } as any);
  const [tool] = tools;
  expect(tool.name).toBe("exec");
  expect(tool.promptSnippet).toBe("Run one program with prg and args, no shell. Waits for exit.");
  expect(tool.promptGuidelines).toEqual([
    "exec: put the program in prg and each argument as one item in args. No shell parses them, so `|`, `>`, `&&`, `*`, `$VAR`, `~` and quotes are literal characters.",
    "exec: use cwd, env, stdin and timeout to set the directory, variables, input and time limit.",
    "exec: status is the exit code. 126 and 127 mean the program did not run. 128+N means signal N ended it.",
    'exec: output lines that start with "2> " are stderr.',
    "exec: when the output is cut, read the spill file named in the last line.",
  ]);
  expect(tool.promptGuidelines.every((g) => !/bash/i.test(g))).toBe(true);
});
