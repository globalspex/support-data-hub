// Login has been removed from this app: API routes are open within the deployment.
export async function requireAdminFromRequest(_request: Request): Promise<string> {
  return 'system';
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
