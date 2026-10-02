import type { LeagueContext } from "./context.ts";

/** Plain aligned text table; agents and terminals both read it well. */
export function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) =>
    r
      .map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]!)))
      .join("  ")
      .trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...cells.slice(1).map(line)].join("\n");
}

export const pts = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n.toFixed(1));

const chicago = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export const ctTime = (ms: number) => `${chicago.format(new Date(ms))} CT`;

export function teamLabel(ctx: LeagueContext, rosterId: number): string {
  const t = ctx.teams.find((x) => x.rosterId === rosterId);
  if (!t) return `roster ${rosterId}`;
  const name = t.teamName ? `${t.teamName} (${t.managerName})` : t.managerName;
  return `${name}${t.isOwner ? " ★" : ""}`;
}

export function shortTeam(ctx: LeagueContext, rosterId: number): string {
  const t = ctx.teams.find((x) => x.rosterId === rosterId);
  return t ? `${t.managerName}${t.isOwner ? "★" : ""}` : `roster ${rosterId}`;
}

export function header(ctx: LeagueContext, title: string): string {
  return `# ${title} — ${ctx.leagueName} ${ctx.season}, NFL week ${ctx.nfl.week} (${ctx.nfl.seasonType}) · validated ${ctx.fetchedAt}`;
}
