import kleur from 'kleur';
import type { DailyStats } from '../types.js';
import { t, type Lang } from '../i18n.js';

const WIDTH = 52;

export type RenderOptions = {
  narrative?: string;
  narrativeSource?: 'ai' | 'template' | 'empty';
  lang?: Lang;
};

export function renderTerminal(stats: DailyStats, opts: RenderOptions = {}): string {
  const lang = opts.lang ?? 'en';
  const s = t(lang);
  const lines: string[] = [];
  const sep = kleur.dim('─'.repeat(WIDTH));

  lines.push(sep);
  lines.push(' ' + kleur.bold(kleur.yellow(s.brand.toLowerCase())) + kleur.dim(`  ·  ${s.fmtDate(stats.date)}`));
  lines.push(sep);
  lines.push('');

  if (stats.totalEvents === 0) {
    lines.push(kleur.dim('  ' + s.emptyDay));
    lines.push('');
    lines.push(sep);
    return lines.join('\n');
  }

  const activeStr = s.fmtDuration(stats.activeMinutes);
  const pad = (label: string) => label + ':';

  lines.push(`  ${kleur.bold(pad(s.active))}    ${kleur.bold(kleur.yellow(activeStr))}`);
  const totalMsg = stats.assistantMessages + stats.userMessages;
  lines.push(
    `  ${kleur.bold(pad(s.messages))}  ${totalMsg}  ` +
      kleur.dim(s.fmtBreakdown(stats.assistantMessages, stats.userMessages))
  );
  const totalTools = Object.values(stats.toolCounts).reduce((acc, n) => acc + n, 0);
  lines.push(`  ${kleur.bold(pad(s.tools))}     ${totalTools}`);
  lines.push(
    `  ${kleur.bold(pad(s.sessions))}  ${stats.sessionCount}  ` +
      kleur.dim(`(${s.fmtLongestSuffix(stats.longestSessionMinutes)})`)
  );
  lines.push(`  ${kleur.bold(pad(s.cost))}      ${kleur.yellow('~$' + stats.estimatedCostUSD.toFixed(2))}`);
  lines.push('');

  if (stats.projectBreakdown.length > 0) {
    lines.push('  ' + kleur.bold(s.topProject));
    for (const p of stats.projectBreakdown.slice(0, 3)) {
      const barStr = bar(p.percentOfDay, 16);
      lines.push(
        `  ${barStr} ${kleur.cyan(padRight(p.name, 16))} ${kleur.dim(p.percentOfDay.toFixed(0).padStart(2) + '%')}`
      );
    }
    lines.push('');
  }

  const totalModelTokens = Object.values(stats.modelTokens).reduce(
    (acc, u) =>
      acc + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    0
  );
  if (totalModelTokens > 0) {
    lines.push('  ' + kleur.bold(s.models));
    const entries = Object.entries(stats.modelTokens)
      .map(([model, u]) => {
        const total =
          u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
        return { model, total, pct: (total / totalModelTokens) * 100 };
      })
      .sort((a, b) => b.total - a.total);
    for (const e of entries) {
      lines.push(
        `  ${bar(e.pct, 16)} ${kleur.dim(padRight(shortModel(e.model), 16))} ${kleur.dim(
          e.pct.toFixed(0).padStart(2) + '%'
        )}`
      );
    }
    lines.push('');
  }

  const toolEntries = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (toolEntries.length > 0) {
    const maxVal = toolEntries[0][1];
    lines.push('  ' + kleur.bold(s.topTools));
    for (const [name, count] of toolEntries) {
      const barLen = Math.max(1, Math.round((count / maxVal) * 16));
      lines.push(
        `  ${kleur.yellow('█'.repeat(barLen))}${kleur.dim('░'.repeat(16 - barLen))} ${kleur.dim(
          padRight(name, 10)
        )} ${count}`
      );
    }
    lines.push('');
  }

  const nightOwl = computeNightOwl(stats.hourCounts);
  lines.push(
    `  ${kleur.bold(pad(s.peakHour))} ${String(stats.peakHour).padStart(2, '0')}:00` +
      kleur.dim('   ·   ') +
      `${kleur.bold(pad(s.nightOwl))} ${nightOwl}%`
  );
  lines.push('');

  if (stats.topFilesEdited.length > 0) {
    lines.push('  ' + kleur.bold(s.mostEdited));
    for (const f of stats.topFilesEdited.slice(0, 3)) {
      lines.push(`  ${kleur.dim('·')} ${kleur.cyan(shortPath(f.path))} ${kleur.dim('×' + f.count)}`);
    }
    lines.push('');
  }

  if (opts.narrative) {
    const tag =
      opts.narrativeSource === 'ai'
        ? kleur.dim('(ai)')
        : opts.narrativeSource === 'template'
          ? kleur.dim('(template)')
          : kleur.dim('(empty)');
    lines.push('  ' + kleur.bold(s.story) + '  ' + tag);
    for (const line of wrap(opts.narrative, WIDTH - 4)) {
      lines.push('  ' + kleur.italic(line));
    }
    lines.push('');
  }

  lines.push(sep);
  return lines.join('\n');
}

function bar(pct: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return kleur.yellow('▓'.repeat(filled)) + kleur.dim('░'.repeat(width - filled));
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
  const total = hourCounts.reduce((acc, c) => acc + c, 0);
  if (total === 0) return 0;
  let night = 0;
  for (let h = 0; h < 24; h++) {
    if (h >= 22 || h < 6) night += hourCounts[h];
  }
  return Math.round((night / total) * 100);
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    const w = isWide(ch) ? 2 : 1;
    if (widthOf(line) + w > width && line.length > 0) {
      out.push(line);
      line = '';
    }
    line += ch;
  }
  if (line.length > 0) out.push(line);
  return out;
}

function widthOf(s: string): number {
  let w = 0;
  for (const ch of s) w += isWide(ch) ? 2 : 1;
  return w;
}

function isWide(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function padRight(s: string, width: number): string {
  const w = widthOf(s);
  if (w >= width) return s;
  return s + ' '.repeat(width - w);
}
