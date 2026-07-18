/* Contact form — stores submissions in self-hosted Postgres.
   Env: DATABASE_URL (postgres://…) */

export const prerender = false;

import type { APIRoute } from 'astro';
import pg from 'pg';
import { contactSchema, timeTrapOk } from '../../lib/forms/schemas';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function db(): pg.Pool | null {
  const url = import.meta.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    ready = pool
      .query(
        `CREATE TABLE IF NOT EXISTS contact_messages (
           id         BIGSERIAL PRIMARY KEY,
           name       TEXT NOT NULL,
           email      TEXT NOT NULL,
           message    TEXT NOT NULL,
           utm        JSONB NOT NULL DEFAULT '{}'::jsonb,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined);
  }
  return pool;
}

export const POST: APIRoute = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid request body' });
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  if (parsed.data.website !== undefined && parsed.data.website !== '') return json(200, { ok: true });
  if (!timeTrapOk(parsed.data.ts)) return json(200, { ok: true });

  const client = db();
  if (!client) return json(503, { ok: false, error: 'Contact form is not configured yet' });

  try {
    await ready;
    await client.query(
      'INSERT INTO contact_messages (name, email, message, utm) VALUES ($1, $2, $3, $4)',
      [parsed.data.name, parsed.data.email, parsed.data.message, parsed.data.utm ?? {}],
    );
    return json(200, { ok: true });
  } catch {
    return json(502, { ok: false, error: 'Could not store your message — try again shortly' });
  }
};
