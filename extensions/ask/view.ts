import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	type TuiMouseEvent,
	type TuiMouseEventResult,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Question, Result } from "./contract.ts";
import { type Action, Questionnaire } from "./state.ts";

export interface AskViewOptions {
	questions: Question[];
	theme: { fg(color: ThemeColor, text: string): string; bold(text: string): string };
	markdownTheme: MarkdownTheme;
	/** Terminal height, read on every render to size the preview. */
	rows: () => number;
	requestRender: () => void;
	done: (result: Result) => void;
}

/** Full-width inline questionnaire: tab header, option list, scrollable markdown preview. */
export class AskView implements Component, Focusable {
	private readonly state: Questionnaire;
	private readonly input = new Input();
	private finished = false;
	private _focused = false;
	private previewScroll = 0;
	/** Rendered line range [start, end) of the preview body, for mouse hit-testing. */
	private previewRows: [number, number] | undefined;
	private readonly markdown = new Map<string, Markdown>();

	constructor(private readonly opts: AskViewOptions) {
		this.state = new Questionnaire(opts.questions);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		const rows = this.previewRows;
		if (event.type !== "wheel" || !rows || event.y < rows[0] || event.y >= rows[1]) return undefined;
		this.previewScroll = Math.max(0, this.previewScroll + (event.wheelDelta ?? 0));
		return { handled: true };
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	invalidate(): void {
		this.markdown.clear();
	}

	handleInput(data: string): void {
		if (this.finished) return;
		if (this.state.mode === "options" && this.scroll(data)) {
			this.opts.requestRender();
			return;
		}
		const action = this.toAction(data) ?? (this.state.mode === "confirmCancel" ? "other" : undefined);
		if (!action) {
			if (this.inTextMode) {
				this.input.handleInput(data);
				this.opts.requestRender();
			}
			return;
		}
		const before = { mode: this.state.mode, focus: `${this.state.tab}:${this.state.cursor}` };
		const result = this.state.dispatch(action);
		if (result) {
			this.finished = true;
			this.opts.done(result);
			return;
		}
		if (before.focus !== `${this.state.tab}:${this.state.cursor}`) this.previewScroll = 0;
		if (this.inTextMode && before.mode !== this.state.mode) {
			const tab = this.state.tab;
			this.input.setValue(this.state.mode === "note" ? this.state.note(tab) : this.state.customText(tab));
		}
		this.opts.requestRender();
	}

	render(width: number): string[] {
		const { theme } = this.opts;
		const s = this.state;
		const lines: string[] = [theme.fg("dim", "─".repeat(width))];
		this.previewRows = undefined;
		const wrap = (text: string, indent = " ") => {
			for (const line of wrapTextWithAnsi(text, Math.max(1, width - indent.length))) lines.push(indent + line);
		};

		lines.push(` ${this.header()}`);
		const q = s.questions[s.tab];
		if (q) {
			wrap(theme.bold(q.question));
			lines.push("");
			q.options.forEach((o, i) => {
				const mark = q.multiSelect ? (s.isChecked(s.tab, o.label) ? "[x] " : "[ ] ") : "";
				const focused = i === s.cursor;
				const label = `${focused ? ">" : " "} ${i + 1}. ${mark}${o.label}`;
				wrap(focused ? theme.fg("accent", label) : label);
				wrap(theme.fg("muted", o.description), "      ");
			});
			const typed = s.customText(s.tab);
			const typeRow = `${s.cursor === q.options.length ? ">" : " "} ${q.options.length + 1}. Type something.`;
			wrap(
				(s.cursor === q.options.length ? theme.fg("accent", typeRow) : typeRow) +
					(typed && s.mode !== "custom" ? theme.fg("muted", ` ${typed}`) : ""),
			);
			if (s.mode === "custom") this.renderInput("      ", width, lines);
			if (s.mode === "note") this.renderInput(` ${theme.fg("muted", "Note:")} `, width, lines);
			else if (s.note(s.tab)) wrap(theme.fg("muted", `Note: ${s.note(s.tab)}`));
			const preview = q.multiSelect ? undefined : q.options[s.cursor]?.preview;
			if (preview) this.renderPreview(preview, width, lines);
		} else this.renderReview(wrap, lines);
		lines.push("");
		wrap(this.hint());
		return lines.map((line) => truncateToWidth(line, width));
	}

	private get inTextMode(): boolean {
		return this.state.mode === "custom" || this.state.mode === "note";
	}

	private renderInput(prefix: string, width: number, lines: string[]): void {
		const prefixWidth = visibleWidth(prefix);
		for (const line of this.input.render(Math.max(1, width - prefixWidth))) lines.push(prefix + line);
	}

	private renderReview(wrap: (text: string) => void, lines: string[]): void {
		const { theme } = this.opts;
		const s = this.state;
		lines.push("");
		s.questions.forEach((q, i) => {
			const a = s.answers[i];
			const value = !a
				? theme.fg("warning", "(unanswered)")
				: a.kind === "multi"
					? (a.selected ?? []).join(", ")
					: (a.answer ?? "");
			wrap(`${theme.fg("muted", `${q.header}:`)} ${value}`);
			if (s.note(i)) wrap(theme.fg("muted", `  Note: ${s.note(i)}`));
		});
		lines.push("");
		["Submit", "Cancel"].forEach((label, i) => {
			const row = `${s.reviewCursor === i ? ">" : " "} ${label}`;
			wrap(s.reviewCursor === i ? theme.fg("accent", row) : row);
		});
	}

	private hint(): string {
		const { theme } = this.opts;
		const s = this.state;
		if (s.mode === "confirmCancel")
			return theme.fg("warning", "Esc again to discard answers · any other key continues");
		if (this.inTextMode) return theme.fg("dim", "Enter save · Esc back");
		const q = s.questions[s.tab];
		const parts = ["↑↓ select"];
		if (!q) parts.push("Enter confirm");
		else parts.push(q.multiSelect ? "Space/Enter toggle" : "Enter answer", "n note");
		if (q && !q.multiSelect && q.options[s.cursor]?.preview) parts.push("Shift+↑↓/Ctrl+U/D/PgUp/PgDn scroll");
		parts.push("←→/Tab switch", "Esc cancel");
		return theme.fg("dim", parts.join(" · "));
	}

	private get previewHeight(): number {
		return Math.max(8, Math.floor(this.opts.rows() / 2));
	}

	/** Handles preview scroll keys; returns true when the key was a scroll key. */
	private scroll(data: string): boolean {
		const page = this.previewHeight - 1;
		let delta = 0;
		if (matchesKey(data, Key.shift("up"))) delta = -1;
		else if (matchesKey(data, Key.shift("down"))) delta = 1;
		else if (matchesKey(data, Key.pageUp)) delta = -page;
		else if (matchesKey(data, Key.pageDown)) delta = page;
		else if (matchesKey(data, Key.ctrl("u"))) delta = -Math.floor(this.previewHeight / 2);
		else if (matchesKey(data, Key.ctrl("d"))) delta = Math.floor(this.previewHeight / 2);
		else return false;
		this.previewScroll = Math.max(0, this.previewScroll + delta);
		return true;
	}

	private renderPreview(preview: string, width: number, lines: string[]): void {
		const { theme } = this.opts;
		let md = this.markdown.get(preview);
		if (!md) {
			md = new Markdown(preview, 1, 0, this.opts.markdownTheme);
			this.markdown.set(preview, md);
		}
		const content = md.render(width);
		const height = Math.min(content.length, this.previewHeight);
		this.previewScroll = Math.min(this.previewScroll, content.length - height);
		const top = this.previewScroll;
		const range = content.length > height ? ` ${top + 1}-${top + height}/${content.length} ` : "";
		const title = "── Preview ";
		const fill = "─".repeat(Math.max(0, width - title.length - range.length));
		lines.push("", theme.fg("dim", title + fill) + theme.fg("muted", range));
		this.previewRows = [lines.length, lines.length + height];
		lines.push(...content.slice(top, top + height));
	}

	private header(): string {
		const { theme } = this.opts;
		const s = this.state;
		const n = s.questions.length;
		const dots = s.questions.map((_, i) => {
			if (i === s.tab) return theme.fg("accent", "◉");
			return s.answers[i] ? theme.fg("success", "●") : theme.fg("dim", "○");
		});
		dots.push(s.isReview ? theme.fg("accent", "✓") : theme.fg("dim", "✓"));
		const chip = s.questions[s.tab]?.header ?? "Review";
		return `${theme.fg("dim", `${Math.min(s.tab + 1, n)}/${n}`)}  ${dots.join(" ")}   ${theme.fg("accent", theme.bold(chip))}`;
	}

	private toAction(data: string): Action | undefined {
		if (matchesKey(data, Key.escape)) return "escape";
		if (this.inTextMode) return matchesKey(data, Key.enter) ? { text: this.input.getValue() } : undefined;
		if (matchesKey(data, Key.up)) return "up";
		if (matchesKey(data, Key.down)) return "down";
		if (matchesKey(data, Key.enter)) return "select";
		if (matchesKey(data, Key.space)) return "toggle";
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) return "next";
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) return "prev";
		if (matchesKey(data, "n")) return "note";
		return undefined;
	}
}
