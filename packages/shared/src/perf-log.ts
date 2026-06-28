export function isPerfLogEnabled(): boolean {
  return process.env.PERF_LOG === "true";
}

/** Structured perf line (JSON) when PERF_LOG=true. */
export function perfLog(event: string, fields: Record<string, unknown> = {}): void {
  if (!isPerfLogEnabled()) return;
  console.log(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...fields,
    })
  );
}
