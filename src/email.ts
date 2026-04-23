import { Resend } from 'resend';
import type { DailyStats } from './types.js';
import { loadConfig } from './config.js';
import { renderEmail } from './render/email.js';

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(
  stats: DailyStats,
  narrative: string
): Promise<SendResult> {
  const cfg = await loadConfig();
  const e = cfg.email;
  if (!e?.resend_api_key || !e?.email_to) {
    return { ok: false, error: 'email not configured (missing resend_api_key or email_to)' };
  }

  const { subject, html, text } = renderEmail(stats, narrative);
  const resend = new Resend(e.resend_api_key);
  const from = e.from ?? 'onboarding@resend.dev';

  try {
    const res = await resend.emails.send({
      from,
      to: e.email_to,
      subject,
      html,
      text,
    });
    if (res.error) {
      return { ok: false, error: res.error.message ?? String(res.error) };
    }
    return { ok: true, id: res.data?.id ?? '' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
