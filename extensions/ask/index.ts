import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Params, type Result, toToolResult, validate } from "./contract.ts";
import { AskView } from "./view.ts";

const NAME = "ask_user_question";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: NAME,
		label: "Ask",
		description: "Ask the user 1-4 multiple-choice questions. A 'Type something.' row is added automatically.",
		promptSnippet: "Ask the user structured questions when a decision is ambiguous",
		promptGuidelines: [
			'Put a recommended option first and suffix its label with "(Recommended)".',
			`Group all questions into one ${NAME} call.`,
		],
		parameters: Params,
		exposure: "model-only",
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const error = validate(params);
			if (error) throw new Error(error);
			if (ctx.mode !== "tui") throw new Error(`${NAME} needs the interactive TUI; ask in plain text instead.`);
			const result = await ctx.ui.custom<Result>(
				(tui, theme, _keybindings, done) =>
					new AskView({
						questions: params.questions,
						theme,
						markdownTheme: getMarkdownTheme(),
						rows: () => tui.terminal.rows,
						requestRender: () => tui.requestRender(),
						done,
					}),
			);
			return toToolResult(result ?? { answers: [], cancelled: true });
		},
	});

	// Print, JSON and RPC runs have no TUI: hide the tool so the model asks in plain text.
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") pi.setActiveTools(pi.getActiveTools().filter((name) => name !== NAME));
	});
}
