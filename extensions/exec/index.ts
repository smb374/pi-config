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
      "exec: on a non-zero status the output ends with `Command exited with code N`. 126 and 127 mean the program did not run. 128+N means signal N ended it.",
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
    outputSchema: Type.Object({
      output: Type.String({ description: "Combined stdout and stderr, possibly cut" }),
      status: Type.Number(),
      seconds: Type.Number(),
      killed: Type.Optional(Type.String({ description: '"timeout" or "aborted", when exec killed the program' })),
      msg: Type.Optional(Type.String()),
      spill: Type.Optional(Type.String({ description: "Full output, when cut" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const outcome = await runExec(params, ctx.cwd, signal, (tail) =>
        onUpdate?.({ content: [{ type: "text", text: tail.join("\n") }], details: { tail } satisfies ExecDetails }),
      );
      const { text, isError, output, ...details } = outcome;
      const { status, seconds, killed, msg, spill } = details;
      return {
        content: [{ type: "text", text }],
        isError,
        details,
        structuredContent: {
          output,
          status,
          seconds,
          ...(killed && { killed }),
          ...(msg && { msg }),
          ...(spill && { spill }),
        },
      };
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
      const color = context.isError ? "error" : details.status ? "warning" : "muted";
      const body = resultBody(details, options.expanded).map((l) => theme.fg("toolOutput", l));
      const more = !options.expanded && ((details.tail?.length ?? 0) > COLLAPSED_LINES || details.spill);
      if (more) body.push(theme.fg("muted", `(${context.keyHint("app.tools.expand", "to expand")})`));
      const footer = options.isPartial ? "running…" : `status ${details.status} · Took ${details.seconds?.toFixed(1)}s`;
      return new Text([...body, theme.fg(color, footer)].join("\n"), 0, 0);
    },
  });
  pi.on("session_shutdown", () => killAllGroups());
}
