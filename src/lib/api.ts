export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = (json && typeof json === 'object' && 'error' in json && typeof (json as { error: unknown }).error === 'string')
      ? (json as { error: string }).error
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}
