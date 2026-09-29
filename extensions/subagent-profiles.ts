import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";

type Thinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type ProfileEntry = { model: string; thinking?: Thinking };
type ModelProfile = Record<string, ProfileEntry>;
type Active = { name: string; profile: ModelProfile };
type ProfileFile = {
  name: string;
  origin: "user" | "project";
  profile?: ModelProfile;
  error?: string;
  content?: string;
  hiddenUser?: boolean;
};
type Validation = { ok: true; value: ModelProfile } | { ok: false; error: string };

const ENTRY = "subagent-profile";
const SETTING = "subagentsDefaultProfile";
const THINKING = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const MODEL = /^[^/\s]+\/.+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function validateProfile(value: unknown): Validation {
  if (!isRecord(value) || Object.keys(value).length === 0)
    return { ok: false, error: "must contain at least one selector" };

  const profile: ModelProfile = Object.create(null);
  const selectors = new Set<string>();
  for (const [selector, entry] of Object.entries(value)) {
    const folded = selector.toLocaleLowerCase();
    if (selectors.has(folded))
      return { ok: false, error: `selector '${selector}' collides case-insensitively` };
    selectors.add(folded);

    if (!isRecord(entry))
      return { ok: false, error: `selector '${selector}' must contain an object` };
    for (const key of Object.keys(entry))
      if (key !== "model" && key !== "thinking")
        return { ok: false, error: `selector '${selector}' has an unknown field '${key}'` };
    if (typeof entry.model !== "string" || !MODEL.test(entry.model))
      return { ok: false, error: `selector '${selector}' model must be provider/model-id` };
    if (
      entry.thinking !== undefined &&
      !(typeof entry.thinking === "string" && THINKING.has(entry.thinking))
    )
      return { ok: false, error: `selector '${selector}' has an invalid thinking value` };

    profile[selector] =
      entry.thinking === undefined
        ? { model: entry.model }
        : { model: entry.model, thinking: entry.thinking as Thinking };
  }
  return { ok: true, value: profile };
}

async function readDirectory(
  directory: string,
  origin: ProfileFile["origin"],
): Promise<ProfileFile[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }

  return Promise.all(
    names
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const name = file.slice(0, -".json".length);
        try {
          const content = await readFile(path.join(directory, file), "utf8");
          const checked = validateProfile(JSON.parse(content));
          return checked.ok
            ? { name, origin, profile: checked.value, content }
            : { name, origin, error: checked.error, content };
        } catch (error: unknown) {
          return {
            name,
            origin,
            error: error instanceof Error ? `invalid JSON: ${error.message}` : "invalid JSON",
          };
        }
      }),
  );
}

const userProfileDir = () => path.join(getAgentDir(), "profiles");

async function discover(ctx: ExtensionContext): Promise<ProfileFile[]> {
  const user = await readDirectory(userProfileDir(), "user");
  if (!ctx.isProjectTrusted()) return user;

  const project = await readDirectory(path.join(ctx.cwd, CONFIG_DIR_NAME, "profiles"), "project");
  const userNames = new Set(user.map(({ name }) => name));
  return [
    ...user.filter(({ name }) => !project.some((profile) => profile.name === name)),
    ...project.map((profile) => ({ ...profile, hiddenUser: userNames.has(profile.name) })),
  ];
}

async function readSetting(file: string): Promise<string | undefined> {
  try {
    const settings: unknown = JSON.parse(await readFile(file, "utf8"));
    const value = isRecord(settings) ? settings[SETTING] : undefined;
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  } catch {
    // ponytail: Missing or broken settings mean "no default". Pi reports broken settings.json itself.
    return undefined;
  }
}

async function defaultProfileName(ctx: ExtensionContext): Promise<string | undefined> {
  const project = ctx.isProjectTrusted()
    ? await readSetting(path.join(ctx.cwd, CONFIG_DIR_NAME, "settings.json"))
    : undefined;
  return project ?? (await readSetting(path.join(getAgentDir(), "settings.json")));
}

function upstreamAvailable(tools: ToolInfo[]): boolean {
  const parameters: unknown = tools.find(({ name }) => name === "subagent")?.parameters;
  const properties: unknown = isRecord(parameters) ? parameters.properties : undefined;
  if (!isRecord(properties)) return false;
  return ["subagent_type", "model", "thinking", "resume"].every((field) =>
    Object.hasOwn(properties, field),
  );
}

/** Resolve a profile name into an Active profile, or an error message. */
async function load(
  name: string,
  ctx: ExtensionContext,
  tools: ToolInfo[],
): Promise<Active | string> {
  if (!upstreamAvailable(tools)) return "a compatible subagent tool is not loaded";

  const found = (await discover(ctx)).find((candidate) => candidate.name === name);
  if (found === undefined) return "the profile was not found";
  if (found.profile === undefined)
    return `the profile is invalid: ${found.error ?? "unknown error"}`;

  const available = ctx.modelRegistry.getAvailable();
  for (const { model } of Object.values(found.profile)) {
    const [provider, ...ids] = model.split("/");
    const modelId = ids.join("/");
    if (!available.some((candidate) => candidate.provider === provider && candidate.id === modelId))
      return `model '${model}' is unavailable`;
  }
  return { name, profile: structuredClone(found.profile) };
}

function profileText(profile: ProfileFile): string {
  const status = profile.error === undefined ? "valid" : `invalid: ${profile.error}`;
  const hidden = profile.hiddenUser === true ? "; hides the user profile" : "";
  return `${profile.name} (${profile.origin}, ${status}${hidden})`;
}

type SubagentInput = {
  subagent_type?: unknown;
  model?: unknown;
  thinking?: unknown;
  resume?: unknown;
};

function injectProfile(input: SubagentInput, active: Active | undefined): void {
  const blank = (value: unknown) => typeof value === "string" && value.trim() === "";
  const subagentType = input.subagent_type;
  if (
    active === undefined ||
    (input.resume !== undefined && !blank(input.resume)) ||
    typeof subagentType !== "string"
  )
    return;

  const entry = Object.entries(active.profile).find(
    ([selector]) => selector.toLocaleLowerCase() === subagentType.toLocaleLowerCase(),
  )?.[1];
  if (entry === undefined) return;

  // ponytail: Normalize blanks only for matched spawns; upstream validates other calls.
  if (blank(input.resume)) delete input.resume;
  if (input.model === undefined || blank(input.model)) input.model = entry.model;
  if (blank(input.thinking)) delete input.thinking;
  if (input.thinking === undefined && entry.thinking !== undefined) input.thinking = entry.thinking;
}

/** Session-level Model Profiles for the upstream `subagent` tool. */
export default function extension(pi: ExtensionAPI): void {
  let active: Active | undefined;

  pi.on("session_start", async (_event, ctx) => {
    active = undefined;
    // The latest `use`/`off` on this branch wins. Without one, the settings default applies.
    const saved = ctx.sessionManager
      .getBranch()
      .findLast((entry) => entry.type === "custom" && entry.customType === ENTRY);
    const data: unknown = saved?.type === "custom" ? saved.data : undefined;
    const name =
      saved === undefined
        ? await defaultProfileName(ctx)
        : isRecord(data) && typeof data.name === "string"
          ? data.name
          : undefined;
    if (name === undefined) return;

    const result = await load(name, ctx, pi.getAllTools());
    if (typeof result === "string")
      ctx.ui.notify(
        `Model Profile '${name}' was not loaded: ${result}. The profile is off.`,
        "warning",
      );
    else active = result;
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName === "subagent") injectProfile(event.input, active);
  });

  for (const command of ["list", "show", "use", "off"] as const) {
    pi.registerCommand(`subagents:profile:${command}`, {
      description: `${command} a Model Profile.`,
      async getArgumentCompletions(prefix) {
        if (command !== "show" && command !== "use") return null;
        const items = (await readDirectory(userProfileDir(), "user"))
          .filter(({ name }) => name.startsWith(prefix))
          .map(({ name }) => ({ value: name, label: name }));
        return items.length === 0 ? null : items;
      },
      async handler(args, ctx) {
        const name = args.trim();

        if (command === "off") {
          active = undefined;
          pi.appendEntry(ENTRY, {});
          ctx.ui.notify("Model Profile is off.", "info");
          return;
        }

        if (command === "show" && name === "") {
          ctx.ui.notify(
            active === undefined
              ? "No Active Model Profile."
              : `${active.name}:\n${JSON.stringify(active.profile, undefined, 2)}`,
            "info",
          );
          return;
        }

        if (command === "list") {
          const profiles = await discover(ctx);
          ctx.ui.notify(
            profiles.length === 0 ? "No Model Profiles." : profiles.map(profileText).join("\n"),
            "info",
          );
          return;
        }

        if (command === "show") {
          const profile = (await discover(ctx)).find((candidate) => candidate.name === name);
          if (profile === undefined)
            ctx.ui.notify(`subagents:profile:show: '${name}' was not found.`, "error");
          else ctx.ui.notify(`${profileText(profile)}\n${profile.content ?? ""}`, "info");
          return;
        }

        const result = await load(name, ctx, pi.getAllTools());
        if (typeof result === "string") {
          ctx.ui.notify(`subagents:profile:use: '${name}': ${result}.`, "error");
          return;
        }
        active = result;
        pi.appendEntry(ENTRY, { name });
        ctx.ui.notify(`Active Model Profile: ${name}.`, "info");
      },
    });
  }
}
