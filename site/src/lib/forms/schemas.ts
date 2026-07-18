/* Shared form contracts — the SAME zod schema validates in the browser and
   again in the endpoint. The honeypot and time-trap ride along as fields. */

import { z } from 'zod';

const antiSpam = {
  /** honeypot — real users never fill this; bots do */
  website: z.literal('').or(z.undefined()),
  /** epoch ms when the form rendered — instant submits are bots */
  ts: z.coerce.number().int().positive(),
  /** utm attribution captured client-side */
  utm: z.record(z.string(), z.string()).optional(),
};

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  ...antiSpam,
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Tell us who you are').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  message: z.string().trim().min(10, 'A little more detail helps').max(4000),
  ...antiSpam,
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

export const MIN_FILL_MS = 3000;

export function timeTrapOk(ts: number): boolean {
  const elapsed = Date.now() - ts;
  return elapsed >= MIN_FILL_MS && elapsed < 1000 * 60 * 60 * 24;
}
