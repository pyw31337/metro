/**
 * Public API configuration.
 *
 * Keep the legacy OPEN_DATA name as a compatibility fallback while all
 * deployments migrate to NEXT_PUBLIC_SEOUL_API_KEY. The browser bundle may
 * contain this key; production deployments should prefer a Worker proxy.
 */
export function getSeoulOpenDataKey(): string {
  return (
    process.env.NEXT_PUBLIC_SEOUL_API_KEY ||
    process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY ||
    "sample"
  ).trim() || "sample";
}

export function getBusApiKey(): string {
  return (process.env.NEXT_PUBLIC_BUS_API_KEY || "").trim();
}
