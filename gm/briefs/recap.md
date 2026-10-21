Weekly recap, after Monday Night Football.

1. Run `ff matchups --week <the week just finished>`, `ff roster`, `ff standings`, and `ff transactions --week <that week>`. (Use `ff changes --no-write` if you also want changes since the last session without resetting its baseline.)
2. Our result and why: which slots decided it, and `ff bench --week <week>` for points left on the bench and whether the best lineup would have changed the result.
3. Standings and playoff picture: where we sit, the race for playoff spots and byes, and the schedule ahead if relevant.
4. League moves this week and what they say about each manager. Update notes/managers.md with dated facts.
5. Review open entries in notes/recommendations.md:
   - For each open entry whose decision window has passed, check whether Sleeper transactions (`ff transactions --week <week>`) or matchups (`ff matchups --week <week>`, `ff roster`) reflect the move.
   - Record explicit status: `ACTED`, `DECLINED`, `SUPERSEDED`, or `ACTION_UNKNOWN`.
   - Record decision quality (process soundness using facts known at the time) strictly separately from observed outcome (actual points, stats, or transaction result in Sleeper).
   - If Sleeper records cannot verify whether the move was made or attempted, ask the Owner one concise question rather than guessing or assuming an unobserved move was declined.
   - Move closed recommendations from the Active / Open section to Closed history to keep open items easy to scan at the top.
6. Archive old closures: move Closed history entries closed more than two weeks ago to `notes/archive/recommendations-<season>.md` (create it if missing). Append them unedited, oldest first; never rewrite or delete archived entries. Leave the Active / Open section untouched.

Keep it short. End with the two or three things that matter for next week.
