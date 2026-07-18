/* Newsletter subscribe — forwards to self-hosted listmonk.
   Env: LISTMONK_URL, LISTMONK_USER, LISTMONK_TOKEN, LISTMONK_LIST_ID */

export const prerender = false;

import type { APIRoute } from 'astro';
import { subscribeSchema, timeTrapOk } from '../../lib/forms/schemas';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid request body' });
  }

  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  // spam checks fail silently-positive: bots get a 200 and nothing happens
  if (parsed.data.website !== undefined && parsed.data.website !== '') return json(200, { ok: true });
  if (!timeTrapOk(parsed.data.ts)) return json(200, { ok: true });

  const url = import.meta.env.LISTMONK_URL;
  const user = import.meta.env.LISTMONK_USER;
  const token = import.meta.env.LISTMONK_TOKEN;
  const listId = Number(import.meta.env.LISTMONK_LIST_ID ?? 0);
  if (!url || !user || !token || !listId) {
    return json(503, { ok: false, error: 'Subscriptions are not configured yet' });
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/subscribers`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email: parsed.data.email,
        name: parsed.data.email.split('@')[0],
        status: 'enabled',
        lists: [listId],
        attribs: parsed.data.utm ?? {},
      }),
    });
    // 409 = already subscribed; treat as success
    if (res.ok || res.status === 409) return json(200, { ok: true });
    return json(502, { ok: false, error: 'Subscription service rejected the request' });
  } catch {
    return json(502, { ok: false, error: 'Subscription service unreachable' });
  }
};
