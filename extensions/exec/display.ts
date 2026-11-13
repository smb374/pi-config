import { type ExecOutcome, resolveCwd } from "./run.ts";

/** What the tool result carries for the renderer. `tail` is the last lines of the merged output. */
export type ExecDetails = Omit<ExecOutcome, "text" | "isError">;

export const COLLAPSED_LINES = 5;
export const EXPANDED_LINES = 20;

/** POSIX single quoting, for display only. Plain words stay bare. "=" is quoted: a bare `a=b` first word is an assignment. */
export function shellQuote(s: string): string {
  if (s !== "" && /^[A-Za-z0-9_@%+:,./-]+$/.test(s)) return s;
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/** The call line and its notes. Tolerates the partial arguments of a call that is still streaming in. */
export function formatCall(
  args: { prg?: string; args?: string[]; cwd?: string; env?: string[] },
  defaultCwd: string,
): { command: string; notes: string[] } {
  const words = args.prg ? [args.prg, ...(args.args ?? [])].map(shellQuote) : ["..."];
  const notes: string[] = [];
  if (args.cwd !== undefined && resolveCwd(args.cwd, defaultCwd) !== defaultCwd) notes.push(`cwd: ${args.cwd}`);
  if (args.env?.length) notes.push(`env: ${args.env.map((e) => e.split("=")[0]).join(", ")}`);
  return { command: `$ ${words.join(" ")}`, notes };
}

/** The lines under the status line: the msg, the last 5 output lines (collapsed) or 20 plus the spill path (expanded). */
export function resultBody(d: ExecDetails, expanded: boolean): string[] {
  const lines = d.msg ? d.msg.split("\n") : [];
  lines.push(...(d.tail ?? []).slice(-(expanded ? EXPANDED_LINES : COLLAPSED_LINES)));
  if (expanded && d.spill) lines.push(`full output: ${d.spill}`);
  return lines;
}
