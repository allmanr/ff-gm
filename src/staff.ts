import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { safeDirectory, safeWrite } from "./private-files.ts";

export const staff = [
  { name: "research_boy", description: "Research NFL injuries, usage and news with dated primary-source evidence." },
  { name: "dynasty_knower", description: "Evaluate Superflex dynasty roster construction, trades and long-term value." },
  { name: "league_watcher", description: "Interpret league changes, roster needs and manager tendencies." },
  { name: "rookie_scout", description: "Scout prospects and rookies, separating evidence from projections." },
  { name: "ai_guru", description: "Audit GM reports, prompts, agent behavior and research efficiency." },
] as const;
export type StaffName = typeof staff[number]["name"];
// JSON basic strings are TOML basic strings; these are arguments, never shell code.
export const tomlString = (value: string) => JSON.stringify(value);

export function specialistInstructions(repo: string, name: StaffName): string {
  return `${readFileSync(join(repo, "gm/STAFF.md"), "utf8")}\n${readFileSync(join(repo, "gm/agents", `${name}.md`), "utf8")}`;
}

export function prepareStaff(repo: string, privateDir: string): string[] {
  const configDir = join(privateDir, ".codex");
  safeDirectory(configDir);
  const agentsDir = join(configDir, "agents");
  safeDirectory(agentsDir);
  const expected = new Set(staff.map((role) => `${role.name}.toml`));
  for (const file of readdirSync(agentsDir)) {
    if (file.endsWith(".toml") && !expected.has(file)) {
      throw new Error(`Unexpected agent definition in football workspace: ${file}. Move it outside .codex/agents before launching the GM.`);
    }
  }
  safeDirectory(join(privateDir, "notes/staff"));
  const overrides = ["agents.enabled=true", "agents.max_concurrent_threads_per_session=3"];
  const charter = readFileSync(join(repo, "gm/CHARTER.md"), "utf8");
  for (const role of staff) {
    safeDirectory(join(privateDir, "notes/staff", role.name));
    const file = join(agentsDir, `${role.name}.toml`);
    safeWrite(file, [
      `name = ${tomlString(role.name)}`, `description = ${tomlString(role.description)}`,
      'model = "gpt-6-sol"', 'model_reasoning_effort = "high"',
      'sandbox_mode = "workspace-write"', 'approval_policy = "never"', 'web_search = "live"',
      `developer_instructions = ${tomlString(`${charter}\n${specialistInstructions(repo, role.name)}`)}`,
      "[agents]", "enabled = false", "",
    ].join("\n"));
    overrides.push(`agents.${role.name}.description=${tomlString(role.description)}`);
    overrides.push(`agents.${role.name}.config_file=${tomlString(file)}`);
  }
  return overrides;
}

export function seedNote(privateDir: string, name: string, text: string): void {
  const file = join(privateDir, "notes", name);
  if (!existsSync(file)) safeWrite(file, text);
}
