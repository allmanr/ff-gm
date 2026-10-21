import { afterEach, expect, it, vi } from "vitest";
import { startAgentProgress } from "../src/agent-progress.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("reports elapsed time and event silence, then stops when the run finishes", () => {
  vi.useFakeTimers();
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const progress = startAgentProgress("GM war-room brief", "/private/run.events.jsonl");
  expect(output.mock.calls).toEqual([
    ["Starting GM war-room brief. Progress every 15s; no terminal input needed."],
    ["Live events: /private/run.events.jsonl"],
  ]);
  vi.advanceTimersByTime(15_000);
  expect(output).toHaveBeenLastCalledWith("GM war-room brief: running for 15s; no events yet.");
  vi.advanceTimersByTime(3_000);
  progress.activity();
  vi.advanceTimersByTime(12_000);
  expect(output).toHaveBeenLastCalledWith("GM war-room brief: running for 30s; last event 12s ago.");
  vi.advanceTimersByTime(45_000);
  expect(output).toHaveBeenLastCalledWith("GM war-room brief: running for 1m 15s; last event 57s ago.");
  progress.stop("completed");
  expect(output).toHaveBeenLastCalledWith("GM war-room brief: completed after 1m 15s.");
  const count = output.mock.calls.length;
  vi.advanceTimersByTime(60_000);
  expect(output).toHaveBeenCalledTimes(count);
});
