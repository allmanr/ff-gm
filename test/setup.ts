import { afterEach, beforeEach, expect, vi } from "vitest";

// Catch accidental production fetches even when a command swallows optional-source errors.
const network = vi.fn(async () => { throw new Error("Network disabled in tests; inject a fetcher"); });
beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network, "Tests must inject every external data source").not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
