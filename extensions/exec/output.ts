import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, openSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateTail } from "@earendil-works/pi-coding-agent";

const STDERR_PREFIX = "2> ";
const PREFIX_BYTES = STDERR_PREFIX.length;

type Line = { text: string; err: boolean; bytes: number };
type Spill = {
  path: string;
  write: (s: string) => void;
  end: () => Promise<void>;
  failed: boolean;
  /** True once a write went over the cap: that write and all later ones are dropped. */
  capped: boolean;
};

/** Hard limit on the spill file: 64 MiB. */
const SPILL_CAP_BYTES = 64 * 1024 * 1024;

/** Open the spill file like pi's bash tool: tmpdir()/pi-exec-<16 hex>.log, mode 0600, flag "wx". undefined when it cannot open. */
function openSpill(cap: number): Spill | undefined {
  const path = join(tmpdir(), `pi-exec-${randomBytes(8).toString("hex")}.log`);
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    return undefined;
  }
  // ponytail: writes do not apply back-pressure to the child; a slow disk buffers in memory. Upgrade: pause the child streams on write() === false.
  // autoClose closes the fd on finish and on error.
  const stream = createWriteStream(path, { fd });
  const closed = new Promise<void>((done) => stream.once("close", () => done()));
  let buffered = "";
  /** Bytes taken in so far, buffered or written. */
  let accepted = 0;
  const spill: Spill = {
    path,
    // One write per 64 KiB instead of one per line.
    write: (s) => {
      if (spill.capped) return;
      accepted += Buffer.byteLength(s);
      if (accepted > cap) {
        spill.capped = true;
        return;
      }
      buffered += s;
      if (buffered.length >= 65536) {
        stream.write(buffered);
        buffered = "";
      }
    },
    end: () => {
      stream.end(buffered);
      return closed;
    },
    failed: false,
    capped: false,
  };
  stream.on("error", () => {
    spill.failed = true;
  });
  return spill;
}

/** Copy `path` over itself without the "2> " at the start of each line. */
async function stripPrefixes(path: string): Promise<void> {
  const tmp = `${path}.tmp`;
  let carry = "";
  const strip = (line: string) => (line.startsWith(STDERR_PREFIX) ? line.slice(PREFIX_BYTES) : line);
  const lines = new Transform({
    decodeStrings: false,
    transform(chunk: string, _enc, done) {
      const parts = (carry + chunk).split("\n");
      carry = parts.pop() ?? "";
      done(null, parts.map((p) => `${strip(p)}\n`).join(""));
    },
    flush(done) {
      done(null, strip(carry));
    },
  });
  const out = createWriteStream(tmp, { flags: "wx", mode: 0o600 });
  try {
    await pipeline(createReadStream(path, { encoding: "utf8" }), lines, out);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Merges stdout and stderr by line in arrival order and keeps a rolling tail for the model.
 * Output over the budget streams to a spill file, opened at the first overflow.
 * Memory: partial lines are not capped; one endless line without a newline stays in memory.
 * ponytail: the partial-line buffer has no cap. Upgrade: cut a partial line at a size limit and flush it as a line.
 * The spill file stops growing at `spillCapBytes`, so a runaway program cannot fill the disk or tmpfs.
 */
export function createOutput(spillCapBytes = SPILL_CAP_BYTES) {
  const pending = { out: "", err: "" };
  /** Rolling tail: lines[head..]. */
  let lines: Line[] = [];
  let head = 0;
  let tailBytes = 0;
  let totalLines = 0;
  /** Bytes of the merged output without any "2> " prefix. */
  let rawBytes = 0;
  /** Bytes the "2> " prefixes add; they count only once stdout has produced output. */
  let errPrefixBytes = 0;
  let dropped = 0;
  let stdoutSeen = false;
  /** False when the last line has no newline. */
  let lastTerminated = true;
  let spill: Spill | undefined;
  let spillFailedToOpen = false;
  let cutSpillPath: string | undefined;

  const format = (l: Line) => (l.err && stdoutSeen ? STDERR_PREFIX : "") + l.text;

  function trim(): void {
    // Keep at least DEFAULT_MAX_LINES lines and DEFAULT_MAX_BYTES raw bytes: raw is never more than prefixed.
    while (lines.length - head > DEFAULT_MAX_LINES && tailBytes - lines[head].bytes >= DEFAULT_MAX_BYTES) {
      tailBytes -= lines[head++].bytes;
      dropped++;
    }
    if (head >= 1024 && head * 2 >= lines.length) {
      lines = lines.slice(head);
      head = 0;
    }
  }

  function addLine(text: string, err: boolean, terminated: boolean): void {
    const line: Line = { text, err, bytes: Buffer.byteLength(text) + 1 };
    lines.push(line);
    tailBytes += line.bytes;
    totalLines++;
    rawBytes += line.bytes;
    if (err) errPrefixBytes += PREFIX_BYTES;
    lastTerminated = terminated;
    if (spill) spill.write((err ? STDERR_PREFIX : "") + text + (terminated ? "\n" : ""));
    else openSpillIfOver();
    trim();
  }

  /** Open the spill file at the first overflow of the output as the model would see it. Nothing was dropped yet, so the tail holds the whole output. */
  function openSpillIfOver(): void {
    if (spill || spillFailedToOpen) return;
    if (totalLines <= DEFAULT_MAX_LINES && rawBytes + (stdoutSeen ? errPrefixBytes : 0) <= DEFAULT_MAX_BYTES) return;
    spill = openSpill(spillCapBytes);
    spillFailedToOpen = spill === undefined;
    for (let i = head; spill && i < lines.length; i++) {
      const l = lines[i];
      spill.write((l.err ? STDERR_PREFIX : "") + l.text + (i < lines.length - 1 || lastTerminated ? "\n" : ""));
    }
  }

  return {
    push(stream: "out" | "err", chunk: string): void {
      if (stream === "out" && chunk !== "" && !stdoutSeen) {
        // The "2> " prefixes of earlier stderr lines are real now: the output may be over the budget.
        stdoutSeen = true;
        openSpillIfOver();
      }
      const parts = (pending[stream] + chunk).split("\n");
      pending[stream] = parts.pop() ?? "";
      for (const part of parts) addLine(part, stream === "err", true);
    },

    /** Flush partial lines, close the spill file, and return the model's output text, with the cut line when cut. */
    async finish(): Promise<string> {
      const partial = (["out", "err"] as const).filter((s) => pending[s] !== "");
      partial.forEach((s, i) => {
        addLine(pending[s], s === "err", i < partial.length - 1);
      });
      if (lines.length === head) return "";

      const result = truncateTail(lines.slice(head).map(format).join("\n"));
      const cut = dropped > 0 || result.truncated;
      let body = result.content + (lastTerminated ? "\n" : "");
      if (spill) {
        await spill.end();
        try {
          if (!cut) unlinkSync(spill.path);
          else if (!stdoutSeen && !spill.failed) await stripPrefixes(spill.path);
        } catch {
          spill.failed = true;
        }
      }
      if (cut) {
        cutSpillPath = spill && !spill.failed ? spill.path : undefined;
        const where = cutSpillPath ?? "unavailable, the temp file could not be written";
        if (!body.endsWith("\n")) body += "\n";
        const label = spill?.capped ? `spill file capped at ${spillCapBytes} bytes, partial output` : "full output";
        body += `[output cut: last ${result.outputLines} of ${totalLines} lines; ${label}: ${where}]`;
      }
      return body;
    },

    /** The last `n` output lines as the model would see them (complete lines, and partial ones after finish). For the display. */
    preview(n: number): string[] {
      return lines.slice(Math.max(head, lines.length - n)).map(format);
    },

    /** The spill file path when finish() cut the output and the file was written. */
    spillPath(): string | undefined {
      return cutSpillPath;
    },
  };
}
