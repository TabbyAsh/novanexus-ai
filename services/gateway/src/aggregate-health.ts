export interface RequiredServiceHealth {
  ok: boolean;
  status: number | null;
  reportedStatus?: string;
  error?: string;
}

export type RequiredServiceMap = Record<string, string>;

/** Check the services that make the monolith usable, not just gateway liveness. */
export async function checkRequiredServices(
  services: RequiredServiceMap,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2_000,
): Promise<Record<string, RequiredServiceHealth>> {
  const checks = await Promise.all(Object.entries(services).map(async ([name, baseUrl]) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('health check timed out')), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/health`, { signal: controller.signal });
      const body = await response.json().catch(() => ({})) as { status?: string };
      const ok = response.ok && body.status === 'healthy';
      return [name, {
        ok,
        status: response.status,
        reportedStatus: body.status,
        ...(!ok ? { error: 'service did not report healthy' } : {}),
      }] as const;
    } catch (error) {
      return [name, {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      }] as const;
    } finally {
      clearTimeout(timeout);
    }
  }));

  return Object.fromEntries(checks);
}
