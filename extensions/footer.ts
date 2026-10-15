// Two-line footer with ASCII icons. Layout adapted from pi-open-tui (MIT, OldSuns):
// https://github.com/OldSuns/pi-open-tui/blob/main/extensions/open-tui/footer.ts
//   L1: @cwd h host *branch [git counts] timer          # [bar] pct · used/window
//   L2: M provider · model · ~effort    & ext statuses | ↑in ↓out c% | $cost
//   L3: (ext statuses, right-aligned, only when they don't fit on L2)
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { relative, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Git = { branch?: string; detached: boolean; counts: [string, number, ThemeColor][]; ahead: number; behind: number };
type Seg = { text: string; compact?: string; priority: number; right?: boolean };

const HOST = hostname().split(".")[0] ?? "";

function readGit(cwd: string): Promise<Git | undefined> {
	return new Promise((done) =>
		execFile("git", ["status", "--porcelain=v1", "--branch", "--show-stash"], { cwd, timeout: 2000 }, (err, out) => {
			if (err) return done(undefined);
			const n = { "=": 0, x: 0, "!": 0, r: 0, A: 0, "?": 0, S: 0 };
			const g: Git = { detached: false, counts: [], ahead: 0, behind: 0 };
			for (const line of out.split("\n")) {
				if (line.startsWith("## ")) {
					g.detached = line.startsWith("## HEAD (no branch)");
					const m = line.slice(3).match(/^(\S+?)(?:\.\.\.\S+)?(?: \[(.*)\])?$/);
					if (!g.detached && m) g.branch = m[1];
					g.ahead = Number(m?.[2]?.match(/ahead (\d+)/)?.[1] ?? 0);
					g.behind = Number(m?.[2]?.match(/behind (\d+)/)?.[1] ?? 0);
				} else if (line.startsWith("# stash ")) n.S = Number(line.slice(8)) || 0;
				else if (line.length >= 3) {
					const [x, y] = line;
					if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) n["="]++;
					else if (x === "?") n["?"]++;
					else if (x === "R") n.r++;
					else if (x === "D" || y === "D") n.x++;
					else {
						if (x !== " ") n.A++;
						if (y === "M") n["!"]++;
					}
				}
			}
			const color: Record<string, ThemeColor> = { "=": "error", x: "error", "!": "warning", r: "warning", A: "success", "?": "muted", S: "muted" };
			g.counts = Object.entries(n).filter(([, c]) => c > 0).map(([k, c]) => [k, c, color[k]!]);
			done(g);
		}),
	);
}

const fmtTokens = (n: number) =>
	n < 1000 ? `${n}` : n < 1e4 ? `${(n / 1e3).toFixed(1)}k` : n < 1e6 ? `${Math.round(n / 1e3)}k` : `${(n / 1e6).toFixed(1)}M`;

function fmtDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
	return `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m ${s % 60}s`;
}

const stress = (pct: number): ThemeColor => (pct >= 90 ? "error" : pct >= 70 ? "warning" : "accent");

function tildePath(cwd: string): string {
	const home = process.env.HOME;
	const rel = home ? relative(home, cwd) : "..";
	return rel === "" ? "~" : rel.startsWith("..") || rel.startsWith(sep) ? cwd : `~${sep}${rel}`;
}

/** Fish-style: `~/src/work/proj` -> `~/s/w/proj`. Dot-dirs keep the dot: `.config` -> `.c`. */
function shortPath(path: string): string {
	const parts = path.split(sep);
	return parts.map((p, i) => (i === parts.length - 1 || p === "~" ? p : p.slice(0, p.startsWith(".") ? 2 : 1))).join(sep);
}

// Keep SGR colours set by the extension; replace every other escape/control sequence with a space.
const STATUS_TOKEN =
	/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b[P\]X^_]|[\x90\x9d\x98\x9e\x9f])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)|\x1b[@-Z\\_]|[\u0000-\u001f\u007f-\u009f]/g;
const SGR = /^(?:\x1b\[|\x9b)[0-9;:]*m$/;
function cleanStatus(theme: Theme, text: string): string {
	const s = text.replace(STATUS_TOKEN, (t) => (SGR.test(t) ? t : " ")).replace(/ {2,}/g, " ").trim();
	if (!s || !visibleWidth(s)) return "";
	return /\x1b\[|\x9b/.test(s) ? `${s}\x1b[0m` : theme.fg("muted", s);
}

/** Left/right on one row; the right side wins, the left side truncates. */
function alignRight(left: string, right: string, width: number, theme: Theme): string {
	right = truncateToWidth(right, width, theme.fg("dim", "..."));
	const room = width - visibleWidth(right) - 1;
	if (room <= 0) return right;
	left = truncateToWidth(left, room, theme.fg("dim", "..."));
	return left + " ".repeat(width - visibleWidth(left) - visibleWidth(right)) + right;
}

// ponytail: compact (cwd -> basename) first, then drop whole segments by lowest priority.
// open-tui also truncates segments partially; add that if dropping proves too eager.
function fit(segs: Seg[], max: number): Seg[] {
	const live = segs.map((s) => ({ ...s }));
	const total = () => live.reduce((a, s) => a + visibleWidth(s.text), 0) + Math.max(0, live.length - 1);
	for (const s of live) if (total() > max && s.compact) s.text = s.compact;
	while (total() > max && live.length > 0) {
		const worst = live.reduce((w, s) => (s.priority < w.priority ? s : w));
		live.splice(live.indexOf(worst), 1);
	}
	return live;
}

export function renderFooter(
	theme: Theme,
	width: number,
	d: {
		cwd: string;
		git?: Git;
		workingSince?: number;
		lastDoneIn?: number;
		ctxUsage?: { tokens: number; window: number; percent: number };
		provider?: string;
		model: string;
		effort?: string;
		totals: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; hit?: number };
		statuses: string[];
	},
): string[] {
	if (width <= 0) return [];
	const fg = theme.fg.bind(theme);
	const dim = (t: string) => fg("dim", t);

	// Line 1
	const segs: Seg[] = [];
	const cwd = tildePath(d.cwd);
	const base = cwd.split(sep).filter(Boolean).at(-1) ?? cwd;
	// ponytail: abbreviated parents always; basename only when the line still overflows.
	segs.push({ text: `${fg("mdLink", "@")} ${fg("accent", shortPath(cwd))}`, compact: `${fg("mdLink", "@")} ${fg("accent", base)}`, priority: 9 });
	if (HOST) segs.push({ text: `${dim("h")} ${fg("accent", HOST)}`, priority: 1 });
	if (d.git) {
		const g = d.git;
		const parts = [g.branch ? fg("mdLink", `* ${truncateToWidth(g.branch, 20, "...")}`) : fg("warning", "* HEAD")];
		const st = g.counts.map(([k, c, col]) => fg(col, `${k}${c}`));
		if (g.ahead && g.behind) st.push(fg("warning", `^v${g.ahead}/${g.behind}`));
		else if (g.ahead) st.push(fg("success", `^${g.ahead}`));
		else if (g.behind) st.push(fg("warning", `v${g.behind}`));
		if (st.length) parts.push(`${dim("[")}${st.join(" ")}${dim("]")}`);
		segs.push({ text: parts.join(" "), priority: 3 });
	}
	if (d.workingSince !== undefined)
		segs.push({ text: `${fg("accent", "o")} ${dim("working")} ${fg("accent", fmtDuration(Date.now() - d.workingSince))}`, priority: 2 });
	else if (d.lastDoneIn !== undefined)
		segs.push({ text: `${fg("success", "+ done")} ${fg("text", fmtDuration(d.lastDoneIn))}`, priority: 2 });
	if (d.ctxUsage && d.ctxUsage.window > 0) {
		const { tokens, window, percent } = d.ctxUsage;
		const c = stress(percent);
		const pct = fg(c, `${percent.toFixed(1)}%`);
		const filled = Math.max(0, Math.min(12, Math.round((percent / 100) * 12)));
		const bar = `${dim("[")}${fg(c, "#".repeat(filled))}${dim("-".repeat(12 - filled))}${dim("]")}`;
		segs.push({
			text: `${fg(c, "#")} ${bar} ${pct} ${dim("·")} ${fg("text", fmtTokens(tokens))}${dim("/")}${fg("text", fmtTokens(window))}`,
			compact: `${fg(c, "#")} ${pct}`,
			priority: 4,
			right: true,
		});
	}
	const fitted = fit(segs, width);
	const join = (right: boolean) => fitted.filter((s) => !!s.right === right).map((s) => s.text).join(" ");
	const line1 = alignRight(join(false), join(true), width, theme);

	// Line 2
	const model = [fg("mdLink", "M")];
	if (d.provider) model.push(fg("muted", d.provider));
	model.push(fg("text", d.model));
	if (d.effort && d.effort !== "off") {
		const effortColor = `thinking${d.effort[0]!.toUpperCase()}${d.effort.slice(1)}` as ThemeColor;
		model.push(fg(effortColor, `~ ${d.effort}`));
	}
	const left2 = model.join(dim(" · "));
	const t = d.totals;
	const bar = ` ${dim("|")} `;
	const input = t.cacheRead > 0 ? `${fmtTokens(t.input + t.cacheRead)} (U ${fmtTokens(t.input)} + R ${fmtTokens(t.cacheRead)})` : fmtTokens(t.input);
	const stats = [fg("accent", `↑ ${input}`), fg("success", `↓ ${fmtTokens(t.output)}`)];
	if ((t.cacheRead > 0 || t.cacheWrite > 0) && t.hit !== undefined) stats.push(fg(t.hit < 30 ? "error" : t.hit < 70 ? "warning" : "success", `c ${t.hit.toFixed(1)}%`));
	stats.push(fg("warning", `$ ${t.cost.toFixed(3)}`));
	const statsText = stats.join(bar);
	const statusText = d.statuses.length ? `${fg("mdLink", "&")} ${d.statuses.join(bar)}` : "";
	const withStatus = statusText ? `${statusText}${bar}${statsText}` : statsText;
	const inline = visibleWidth(left2) + 1 + visibleWidth(withStatus) <= width;
	const line2 = alignRight(left2, inline ? withStatus : statsText, width, theme);
	return inline || !statusText ? [line1, line2] : [line1, line2, alignRight("", statusText, width, theme)];
}

export default function (pi: ExtensionAPI) {
	let git: Git | undefined;
	let workingSince: number | undefined;
	let lastDoneIn: number | undefined;
	let render: (() => void) | undefined;
	let ticker: NodeJS.Timeout | undefined;
	const stopTicker = () => ticker && clearInterval(ticker);
	let refreshCtx: ExtensionContext | undefined;

	const refreshGit = async () => {
		const ctx = refreshCtx;
		if (!ctx) return;
		git = await readGit(ctx.cwd);
		render?.();
	};

	pi.on("session_start", (_e, ctx) => {
		if (!ctx.hasUI) return;
		refreshCtx = ctx;
		workingSince = lastDoneIn = undefined;
		ctx.ui.setFooter((tui, theme, footerData) => {
			render = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => void refreshGit());
			// ponytail: fixed 5s poll catches edits made outside pi; make it configurable if large repos lag.
			const poll = setInterval(() => void refreshGit(), 5000);
			poll.unref?.();
			return {
				dispose() {
					clearInterval(poll);
					unsub();
					render = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					// ponytail: usage totals are recomputed per render; cache by entry count if long sessions lag.
					const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, hit: undefined as number | undefined };
					for (const e of ctx.sessionManager.getEntries()) {
						const u =
							e.type === "message" && (e.message.role === "assistant" || e.message.role === "toolResult")
								? (e.message as { usage?: any }).usage
								: e.type === "branch_summary" || e.type === "compaction"
									? (e as { usage?: any }).usage
									: undefined;
						if (!u) continue;
						const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
						const [inp, cr, cw] = [num(u.input), num(u.cacheRead), num(u.cacheWrite)];
						totals.input += inp + cw;
						totals.output += num(u.output);
						totals.cacheRead += cr;
						totals.cacheWrite += cw;
						totals.cost += num(u.cost?.total);
						if (e.type === "message" && e.message.role === "assistant") totals.hit = inp + cr + cw > 0 ? (cr / (inp + cr + cw)) * 100 : undefined;
					}
					const usage = ctx.getContextUsage();
					const statuses = [...footerData.getExtensionStatuses().entries()]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([, s]) => cleanStatus(theme, s))
						.filter(Boolean);
					return renderFooter(theme, width, {
						cwd: ctx.sessionManager.getCwd(),
						git,
						workingSince,
						lastDoneIn,
						ctxUsage: { tokens: usage?.tokens ?? 0, window: usage?.contextWindow ?? ctx.model?.contextWindow ?? 0, percent: usage?.percent ?? 0 },
						provider: ctx.model?.provider,
						model: ctx.model?.name ?? ctx.model?.id ?? "no-model",
						effort: ctx.model?.reasoning ? pi.getThinkingLevel() : undefined,
						totals,
						statuses,
					});
				},
			};
		});
		void refreshGit();
	});

	pi.on("agent_start", () => {
		workingSince = Date.now();
		lastDoneIn = undefined;
		stopTicker();
		ticker = setInterval(() => render?.(), 1000);
		ticker.unref?.();
	});
	pi.on("agent_end", () => {
		stopTicker();
		if (workingSince !== undefined) lastDoneIn = Date.now() - workingSince;
		workingSince = undefined;
		void refreshGit();
	});
	pi.on("tool_execution_end", () => void refreshGit());
	const rerender = () => render?.();
	pi.on("model_select", rerender);
	pi.on("thinking_level_select", rerender);
	pi.on("message_end", rerender);
	pi.on("session_compact", rerender);
	pi.on("session_tree", rerender);
	pi.on("session_shutdown", () => {
		stopTicker();
		refreshCtx = undefined;
	});
}