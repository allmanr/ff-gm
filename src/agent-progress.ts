/** Progress stays on stderr; agent output and private events keep their own destinations. */
export function startAgentProgress(label: string, events: string) {
  const started = Date.now();
  let lastActivity: number | undefined;
  console.error(`Starting ${label}. Progress every 15s; no terminal input needed.`);
  console.error(`Live events: ${events}`);
  const timer = setInterval(() => {
    const now = Date.now();
    const activity = lastActivity === undefined ? "no events yet" : `last event ${duration(now - lastActivity)} ago`;
    console.error(`${label}: running for ${duration(now - started)}; ${activity}.`);
  }, 15_000);
  return {
    activity() { lastActivity = Date.now(); },
    stop(status: "completed" | "failed") {
      clearInterval(timer);
      console.error(`${label}: ${status} after ${duration(Date.now() - started)}.`);
    },
  };
}

function duration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
