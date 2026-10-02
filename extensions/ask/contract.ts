import { type Static, Type } from "typebox";

export const RESERVED_LABELS = ["Other", "Type something."];

const Option = Type.Object({
	label: Type.String({ maxLength: 60, description: "1-5 words" }),
	description: Type.String({ description: "Meaning or trade-off" }),
	preview: Type.Optional(Type.String({ description: "Markdown artifact to compare (code, mockup)" })),
});

const QuestionSchema = Type.Object({
	question: Type.String(),
	header: Type.String({ maxLength: 16, description: "Tab label" }),
	options: Type.Array(Option, { minItems: 2, maxItems: 4 }),
	multiSelect: Type.Optional(Type.Boolean()),
});

export const Params = Type.Object({
	questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }),
});

export type Params = Static<typeof Params>;
export type Question = Static<typeof QuestionSchema>;

/** Returns an error message stating the broken rule, or undefined when the questionnaire is valid. */
export function validate(params: Params): string | undefined {
	const seen = new Set<string>();
	for (const q of params.questions) {
		if (seen.has(q.question)) return `Error: question text must be unique: ${q.question}`;
		seen.add(q.question);
		const labels = new Set<string>();
		for (const o of q.options) {
			if (RESERVED_LABELS.includes(o.label))
				return `Error: "${o.label}" is reserved; the UI adds a "Type something." row itself`;
			if (labels.has(o.label))
				return `Error: option labels must be unique within a question: "${o.label}" in "${q.question}"`;
			if (q.multiSelect && o.preview) return `Error: previews are single-select only: "${q.question}"`;
			labels.add(o.label);
		}
	}
	return undefined;
}

export interface Answer {
	question: string;
	kind: "option" | "custom" | "multi";
	/** Chosen label or typed text; null for multi. */
	answer: string | null;
	selected?: string[];
	preview?: string;
	notes?: string;
}

export interface Result {
	answers: Answer[];
	cancelled: boolean;
}

const DECLINE = "User declined to answer questions";

function segment(a: Answer): string {
	const value = (a.kind === "multi" ? (a.selected ?? []).join(", ") : a.answer) || "(no input)";
	const parts = [`"${a.question}"="${value}"`];
	if (a.preview) parts.push(`selected preview: ${a.preview}`);
	if (a.notes) parts.push(`user notes: ${a.notes}`);
	return `${parts.join(". ")}.`;
}

/** Builds the model-facing tool result in the rpiv envelope format. */
export function toToolResult(result: Result) {
	const text =
		result.cancelled || result.answers.length === 0
			? DECLINE
			: `User has answered your questions: ${result.answers.map(segment).join(" ")} You can now continue with the user's answers in mind.`;
	return { content: [{ type: "text" as const, text }], details: result };
}
