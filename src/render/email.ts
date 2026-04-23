import type { DailyStats } from '../types.js';

export type EmailPayload = {
  subject: string;
  html: string;
  text: string;
};

export function renderEmail(stats: DailyStats, narrative: string): EmailPayload {
  const activeH = Math.floor(stats.activeMinutes / 60);
  const activeM = stats.activeMinutes % 60;
  const activeStr = activeH > 0 ? `${activeH}h ${activeM}min` : `${activeM}min`;

  const totalTools = Object.values(stats.toolCounts).reduce((s, n) => s + n, 0);
  const topProject = stats.projectBreakdown[0];

  const subject = `Your ccwrapped · ${formatDate(stats.date)} · ${activeStr} in Claude Code`;

  const topTools = Object.entries(stats.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const modelTotal = Object.values(stats.modelTokens).reduce(
    (s, u) =>
      s + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    0
  );
  const models = Object.entries(stats.modelTokens)
    .map(([model, u]) => ({
      model,
      total: u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    }))
    .sort((a, b) => b.total - a.total);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f10;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;color:#eee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f10;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1a1a1b;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 28px 16px 28px;">
          <div style="font-size:13px;color:#f59e0b;letter-spacing:1px;font-weight:600;">CCWRAPPED</div>
          <div style="font-size:14px;color:#888;margin-top:4px;">${escapeHtml(formatDate(stats.date))}</div>
        </td></tr>

        <tr><td style="padding:8px 28px 8px 28px;">
          <div style="font-size:56px;font-weight:800;color:#fff;letter-spacing:-1px;">${escapeHtml(activeStr)}</div>
          <div style="font-size:14px;color:#888;margin-top:4px;">active in Claude Code</div>
        </td></tr>

        <tr><td style="padding:24px 28px 12px 28px;">
          ${statRow('Messages', `${stats.assistantMessages + stats.userMessages}`, `(${stats.assistantMessages} assistant · ${stats.userMessages} user)`)}
          ${statRow('Tools', `${totalTools}`)}
          ${statRow('Sessions', `${stats.sessionCount}`, `longest ${stats.longestSessionMinutes}min`)}
          ${statRow('Cost', `~$${stats.estimatedCostUSD.toFixed(2)}`)}
        </td></tr>

        ${
          topProject
            ? `<tr><td style="padding:16px 28px;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Top project</div>
          <div style="font-size:18px;color:#fff;">${escapeHtml(topProject.name)} <span style="color:#888;font-size:14px;">· ${Math.round(topProject.percentOfDay)}%</span></div>
        </td></tr>`
            : ''
        }

        ${
          models.length
            ? `<tr><td style="padding:16px 28px;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Models</div>
          ${models
            .map((m) => {
              const pct = modelTotal > 0 ? (m.total / modelTotal) * 100 : 0;
              return barRow(shortModel(m.model), pct);
            })
            .join('')}
        </td></tr>`
            : ''
        }

        ${
          topTools.length
            ? `<tr><td style="padding:16px 28px;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Top tools</div>
          ${topTools
            .map(([name, count]) => {
              const pct = (count / topTools[0][1]) * 100;
              return barRow(name, pct, String(count));
            })
            .join('')}
        </td></tr>`
            : ''
        }

        ${
          stats.topFilesEdited.length
            ? `<tr><td style="padding:16px 28px;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Most edited</div>
          ${stats.topFilesEdited
            .slice(0, 3)
            .map(
              (f) =>
                `<div style="font-size:14px;color:#ccc;margin-bottom:4px;font-family:'SF Mono',Menlo,Monaco,monospace;">· ${escapeHtml(shortPath(f.path))} <span style="color:#f59e0b;">×${f.count}</span></div>`
            )
            .join('')}
        </td></tr>`
            : ''
        }

        <tr><td style="padding:20px 28px;">
          <div style="border-left:3px solid #f59e0b;padding:8px 14px;background:#222;border-radius:4px;">
            <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Story</div>
            <div style="font-size:15px;color:#eee;line-height:1.6;">${escapeHtml(narrative)}</div>
          </div>
        </td></tr>

        <tr><td style="padding:12px 28px 28px 28px;">
          <div style="font-size:11px;color:#666;text-align:center;">
            Peak hour <span style="color:#ccc;">${String(stats.peakHour).padStart(2, '0')}:00</span>
            · Night owl <span style="color:#ccc;">${computeNightOwl(stats.hourCounts)}%</span>
          </div>
        </td></tr>

        <tr><td style="padding:16px 28px;border-top:1px solid #222;">
          <div style="font-size:11px;color:#555;text-align:center;">
            Generated locally by <span style="color:#888;">ccwrapped</span> · zero upload of your code or chats
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = plainText(stats, narrative, activeStr, totalTools, topTools);

  return { subject, html, text };
}

function statRow(label: string, value: string, note?: string): string {
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #222;">
    <span style="font-size:14px;color:#888;">${escapeHtml(label)}</span>
    <span style="font-size:15px;color:#fff;">
      ${escapeHtml(value)}
      ${note ? `<span style="color:#666;font-size:12px;margin-left:6px;">${escapeHtml(note)}</span>` : ''}
    </span>
  </div>`;
}

function barRow(label: string, pct: number, rightNote?: string): string {
  const filled = Math.max(1, Math.min(100, Math.round(pct)));
  return `<div style="display:flex;align-items:center;margin-bottom:6px;">
    <div style="flex:1;font-size:13px;color:#ccc;min-width:90px;max-width:130px;">${escapeHtml(label)}</div>
    <div style="flex:3;background:#2a2a2a;border-radius:3px;height:10px;overflow:hidden;margin:0 10px;">
      <div style="width:${filled}%;background:linear-gradient(90deg,#f59e0b,#ef6c00);height:100%;"></div>
    </div>
    <div style="font-size:12px;color:#888;min-width:36px;text-align:right;">${escapeHtml(rightNote ?? Math.round(pct) + '%')}</div>
  </div>`;
}

function plainText(
  stats: DailyStats,
  narrative: string,
  activeStr: string,
  totalTools: number,
  topTools: Array<[string, number]>
): string {
  const lines: string[] = [];
  lines.push(`ccwrapped · ${formatDate(stats.date)}`);
  lines.push('');
  lines.push(`Active: ${activeStr}`);
  lines.push(`Messages: ${stats.assistantMessages + stats.userMessages}`);
  lines.push(`Tools: ${totalTools}`);
  lines.push(`Sessions: ${stats.sessionCount} (longest ${stats.longestSessionMinutes}min)`);
  lines.push(`Cost: ~$${stats.estimatedCostUSD.toFixed(2)}`);
  lines.push('');
  if (stats.projectBreakdown[0]) {
    lines.push(`Top project: ${stats.projectBreakdown[0].name} (${Math.round(stats.projectBreakdown[0].percentOfDay)}%)`);
  }
  if (topTools.length) {
    lines.push('');
    lines.push('Top tools:');
    for (const [name, count] of topTools) {
      lines.push(`  ${name}: ${count}`);
    }
  }
  if (stats.topFilesEdited.length) {
    lines.push('');
    lines.push('Most edited:');
    for (const f of stats.topFilesEdited.slice(0, 3)) {
      lines.push(`  · ${shortPath(f.path)} ×${f.count}`);
    }
  }
  lines.push('');
  lines.push('Story:');
  lines.push(narrative);
  lines.push('');
  lines.push('--');
  lines.push('Generated locally by ccwrapped · zero upload of your code or chats');
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortModel(model: string): string {
  const match = (prefix: string, re: RegExp) => {
    const m = model.match(re);
    return m ? `${prefix} ${m[1].replace('-', '.')}` : prefix;
  };
  if (model.includes('opus')) return match('Opus', /opus-(\d+(?:-\d+)?)/);
  if (model.includes('sonnet')) return match('Sonnet', /sonnet-(\d+(?:-\d+)?)/);
  if (model.includes('haiku')) return match('Haiku', /haiku-(\d+(?:-\d+)?)/);
  return model;
}

function shortPath(path: string): string {
  const home = process.env.HOME || '';
  if (home && path.startsWith(home)) return '~' + path.slice(home.length);
  const parts = path.split('/');
  if (parts.length > 3) return '.../' + parts.slice(-2).join('/');
  return path;
}

function computeNightOwl(hourCounts: number[]): number {
  const total = hourCounts.reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  let night = 0;
  for (let h = 0; h < 24; h++) {
    if (h >= 22 || h < 6) night += hourCounts[h];
  }
  return Math.round((night / total) * 100);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
