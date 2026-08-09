type BackendEnvironment = {
  backendUrl?: string;
  nodeEnv?: string;
};

/**
 * Resolve the backend without ever letting an unconfigured preview inherit the
 * production service. Local development keeps its explicit localhost default;
 * every deployed environment must provide BACKEND_URL.
 */
export function resolveBackendUrl(environment?: BackendEnvironment): string | null {
  const backendUrl = environment?.backendUrl ?? process.env.BACKEND_URL;
  const nodeEnv = environment?.nodeEnv ?? process.env.NODE_ENV;
  const configured = backendUrl?.trim();

  if (configured) return configured.replace(/\/+$/, '');
  if (nodeEnv === 'development') return 'http://localhost:3000';
  return null;
}
