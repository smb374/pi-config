import type { Answer, Question, Result } from "./contract.ts";

/**
 * Semantic input. The view maps keys to these; `{ text }` commits the open text field,
 * and "other" is any key without a meaning (it dismisses the cancel confirmation).
 */
export type Action =
	| "up"
	| "down"
	| "next"
	| "prev"
	| "select"
	| "toggle"
	| "note"
	| "escape"
	| "other"
	| { text: string };

export type Mode = "options" | "custom" | "note" | "confirmCancel";

/** Questionnaire state machine: tabs are the questions followed by a review tab. */
export class Questionnaire {
	tab = 0;
	mode: Mode = "options";
	readonly answers: (Answer | undefined)[];
	reviewCursor = 0;
	private readonly cursors: number[];
	private readonly checked: Set<string>[];
	private readonly custom: string[];
	private readonly notes: string[];

	constructor(readonly questions: Question[]) {
		this.answers = questions.map(() => undefined);
		this.cursors = questions.map(() => 0);
		this.checked = questions.map(() => new Set());
		this.custom = questions.map(() => "");
		this.notes = questions.map(() => "");
	}

	get cursor(): number {
		return this.cursors[this.tab] ?? 0;
	}

	get isReview(): boolean {
		return this.tab === this.questions.length;
	}

	dispatch(action: Action): Result | undefined {
		if (this.mode === "custom" || this.mode === "note") {
			if (typeof action === "object") {
				const text = action.text.trim();
				if (this.mode === "note") {
					this.notes[this.tab] = text;
					this.mode = "options";
				} else this.commitCustom(text);
			} else if (action === "escape") this.mode = "options";
			return undefined;
		}
		if (this.mode === "confirmCancel") {
			this.mode = "options";
			return action === "escape" ? { cancelled: true, answers: [] } : undefined;
		}
		if (action === "note") {
			if (!this.isReview) this.mode = "note";
			return undefined;
		}
		if (action === "escape") {
			this.mode = "confirmCancel";
			return undefined;
		}
		const tabs = this.questions.length + 1;
		if (action === "next" || action === "prev") {
			this.tab = (this.tab + (action === "next" ? 1 : tabs - 1)) % tabs;
			return undefined;
		}
		const q = this.questions[this.tab];
		if (!q) return this.review(action);
		const rows = q.options.length + 1;
		const option = q.options[this.cursor];
		if (action === "down") this.cursors[this.tab] = (this.cursor + 1) % rows;
		else if (action === "up") this.cursors[this.tab] = (this.cursor - 1 + rows) % rows;
		else if (action === "select" && !option) this.mode = "custom";
		else if (option && q.multiSelect && (action === "select" || action === "toggle")) {
			const checked = this.checked[this.tab];
			if (checked && !checked.delete(option.label)) checked.add(option.label);
			this.syncMulti(q);
		} else if (option && action === "select") {
			const preview = option.preview ? { preview: option.preview } : {};
			this.answers[this.tab] = { question: q.question, kind: "option", answer: option.label, ...preview };
			this.tab++;
		}
		return undefined;
	}

	isChecked(questionIndex: number, label: string): boolean {
		return this.checked[questionIndex]?.has(label) ?? false;
	}

	/** Last committed "Type something." text, used to pre-fill the field. */
	customText(questionIndex: number): string {
		return this.custom[questionIndex] ?? "";
	}

	note(questionIndex: number): string {
		return this.notes[questionIndex] ?? "";
	}

	private commitCustom(text: string): void {
		const q = this.questions[this.tab];
		this.mode = "options";
		if (!q) return;
		if (q.multiSelect) {
			this.custom[this.tab] = text;
			this.syncMulti(q);
		} else if (text) {
			this.custom[this.tab] = text;
			this.answers[this.tab] = { question: q.question, kind: "custom", answer: text };
			this.tab++;
		}
	}

	private syncMulti(q: Question): void {
		const checked = this.checked[this.tab];
		const selected = q.options.map((o) => o.label).filter((l) => checked?.has(l));
		const custom = this.custom[this.tab];
		if (custom) selected.push(custom);
		this.answers[this.tab] = selected.length
			? { question: q.question, kind: "multi", answer: null, selected }
			: undefined;
	}

	/** Review tab: cursor 0 is Submit, 1 is Cancel. */
	private review(action: Action): Result | undefined {
		if (action === "up" || action === "down") this.reviewCursor = 1 - this.reviewCursor;
		else if (action === "select") {
			if (this.reviewCursor === 1) return { cancelled: true, answers: [] };
			const answers = this.answers.flatMap((a, i) => {
				const notes = this.notes[i];
				if (!a) {
					const question = this.questions[i]?.question ?? "";
					return notes ? [{ question, kind: "custom" as const, answer: "", notes }] : [];
				}
				return [notes ? { ...a, notes } : a];
			});
			return { cancelled: false, answers };
		}
		return undefined;
	}
}
