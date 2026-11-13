// exec: run one program with prg + args, no shell. See the "exec: design" spec.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { COLLAPSED_LINES, type ExecDetails, formatCall, resultBody } from "./display.ts";
import { killAllGroups, runExec } from "./run.ts";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "exec",
    label: "Exec",
    description: "Run one program with prg and args, no shell. Waits for exit.",
    promptSnippet: "Run one program with prg and args, no shell. Waits for exit.",
    promptGuidelines: [
      "exec: put the program in prg and each argument as one item in args. No shell parses them, so `|`, `>`, `&&`, `*`, `$VAR`, `~` and quotes are literal characters.",
      "exec: use cwd, env, stdin and timeout to set the directory, variables, input and time limit.",
      "exec: status is the exit code. 126 and 127 mean the program did not run. 128+N means signal N ended it.",
      'exec: output lines that start with "2> " are stderr.',
      "exec: when the output is cut, read the spill file named in the last line.",
    ],
    parameters: Type.Object({
      prg: Type.String({ description: "The program (argv[0])." }),
      args: Type.Optional(Type.Array(Type.String(), { description: "argv[1..], default []." })),
      cwd: Type.Optional(Type.String({ description: "Working directory. Default: Pi's cwd." })),
      env: Type.Optional(Type.Array(Type.String(), { description: '"K=V" sets, "K" unsets.' })),
      stdin: Type.Optional(Type.Union([Type.Object({ text: Type.String() }), Type.Object({ path: Type.String() })])),
      timeout: Type.Optional(Type.Number({ description: "Seconds, default 120." })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const outcome = await runExec(params, ctx.cwd, signal, (tail) =>
        onUpdate?.({ content: [{ type: "text", text: tail.join("\n") }], details: { tail } satisfies ExecDetails }),
      );
      const { text, isError, ...details } = outcome;
      return { content: [{ type: "text", text }], isError, details };
    },
    renderCall(args, theme, context) {
      const { command, notes } = formatCall(args, context.cwd);
      const line =
        theme.fg("toolTitle", theme.bold(command)) + (notes.length ? theme.fg("muted", ` (${notes.join("; ")})`) : "");
      if (context.expanded) return new Text(line, 0, 0);
      // Collapsed: one line, cut to the terminal width.
      const oneLine = line.replaceAll("\n", "⏎");
      return { render: (width) => [truncateToWidth(oneLine, width)], invalidate() {} };
    },
    renderResult(result, options, theme, context) {
      const details = (result.details ?? {}) as ExecDetails;
      const first = result.content.find((c) => c.type === "text")?.text.split("\n")[0] ?? "";
      const head = options.isPartial ? "running…" : first;
      const color = context.isError ? "error" : details.status ? "warning" : "muted";
      const body = resultBody(details, options.expanded).map((l) => theme.fg("toolOutput", l));
      const more = !options.expanded && ((details.tail?.length ?? 0) > COLLAPSED_LINES || details.spill);
      if (more) body.push(theme.fg("muted", `(${context.keyHint("app.tools.expand", "to expand")})`));
      return new Text([theme.fg(color, head), ...body].join("\n"), 0, 0);
    },
  });
  pi.on("session_shutdown", () => killAllGroups());
}
