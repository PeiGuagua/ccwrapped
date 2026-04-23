import { basename } from 'node:path';
import { homedir } from 'node:os';
import type { DailyStats, RawEvent, TokenUsage, ProjectStat } from './types.js';

const HOME = homedir();

function displayProjectName(cwd: string): string {
  if (cwd === HOME) return '(chat/misc)';
  return basename(cwd) || cwd;
}

type Pricing = { input: number; output: number; cacheRead: number; cacheWrite: number };

// Approximate USD per 1M tokens. Adjust as Anthropic updates pricing.
const PRICING: Record<string, Pricing> = {
  'claude-opus-4-7': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

export function aggregate(events: RawEvent[], date: Date): DailyStats {
  const dateStr = formatDateYMD(date);
  const stats: DailyStats = {
    date: dateStr,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    totalEvents: events.length,
    assistantMessages: 0,
    userMessages: 0,
    toolCounts: {},
    modelTokens: {},
    sessionIds: [],
    sessionCount: 0,
    hourCounts: new Array(24).fill(0),
    peakHour: 0,
    projectBreakdown: [],
    topFilesEdited: [],
    firstActivityMs: 0,
    lastActivityMs: 0,
    activeMinutes: 0,
    estimatedCostUSD: 0,
    longestSessionMinutes: 0,
  };

  if (events.length === 0) return stats;

  stats.firstActivityMs = events[0].timestampMs;
  stats.lastActivityMs = events[events.length - 1].timestampMs;

  const sessionMap = new Map<string, { start: number; end: number; events: number }>();
  const projectMap = new Map<string, { cwd: string; messages: number; tools: number }>();
  const fileEditCount = new Map<string, number>();
  const activeMinuteBuckets = new Set<number>();

  for (const ev of events) {
    if (ev.role === 'assistant') stats.assistantMessages++;
    else if (ev.role === 'user') stats.userMessages++;

    const hour = new Date(ev.timestampMs).getHours();
    stats.hourCounts[hour]++;

    activeMinuteBuckets.add(Math.floor(ev.timestampMs / 60000));

    if (ev.sessionId) {
      const s = sessionMap.get(ev.sessionId);
      if (s) {
        s.start = Math.min(s.start, ev.timestampMs);
        s.end = Math.max(s.end, ev.timestampMs);
        s.events++;
      } else {
        sessionMap.set(ev.sessionId, { start: ev.timestampMs, end: ev.timestampMs, events: 1 });
      }
    }

    if (ev.cwd) {
      const p = projectMap.get(ev.cwd);
      if (p) {
        p.messages++;
        p.tools += ev.toolCalls.length;
      } else {
        projectMap.set(ev.cwd, { cwd: ev.cwd, messages: 1, tools: ev.toolCalls.length });
      }
    }

    for (const tc of ev.toolCalls) {
      stats.toolCounts[tc.name] = (stats.toolCounts[tc.name] ?? 0) + 1;
      if ((tc.name === 'Edit' || tc.name === 'Write') && typeof tc.input.file_path === 'string') {
        const fp = tc.input.file_path;
        fileEditCount.set(fp, (fileEditCount.get(fp) ?? 0) + 1);
      }
    }

    if (ev.model && ev.usage && !ev.model.startsWith('<')) {
      const existing = stats.modelTokens[ev.model];
      if (existing) {
        existing.input_tokens += ev.usage.input_tokens;
        existing.output_tokens += ev.usage.output_tokens;
        existing.cache_read_input_tokens += ev.usage.cache_read_input_tokens;
        existing.cache_creation_input_tokens += ev.usage.cache_creation_input_tokens;
      } else {
        stats.modelTokens[ev.model] = { ...ev.usage };
      }
    }
  }

  stats.peakHour = stats.hourCounts.reduce(
    (bestHour, count, hour, arr) => (count > arr[bestHour] ? hour : bestHour),
    0
  );

  stats.sessionIds = Array.from(sessionMap.keys());
  stats.sessionCount = sessionMap.size;
  let longestMin = 0;
  for (const s of sessionMap.values()) {
    const minutes = (s.end - s.start) / 60000;
    if (minutes > longestMin) longestMin = minutes;
  }
  stats.longestSessionMinutes = Math.round(longestMin);
  stats.activeMinutes = activeMinuteBuckets.size;

  const totalMessages = events.length;
  const projectStats: ProjectStat[] = [];
  for (const p of projectMap.values()) {
    projectStats.push({
      cwd: p.cwd,
      name: displayProjectName(p.cwd),
      messageCount: p.messages,
      toolCount: p.tools,
      percentOfDay: totalMessages > 0 ? (p.messages / totalMessages) * 100 : 0,
    });
  }
  projectStats.sort((a, b) => b.messageCount - a.messageCount);
  stats.projectBreakdown = projectStats;

  stats.topFilesEdited = Array.from(fileEditCount.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  stats.estimatedCostUSD = estimateCost(stats.modelTokens);

  return stats;
}

function estimateCost(modelTokens: Record<string, TokenUsage>): number {
  let cost = 0;
  for (const [model, usage] of Object.entries(modelTokens)) {
    const p = lookupPricing(model);
    if (!p) continue;
    cost +=
      (usage.input_tokens / 1_000_000) * p.input +
      (usage.output_tokens / 1_000_000) * p.output +
      (usage.cache_read_input_tokens / 1_000_000) * p.cacheRead +
      (usage.cache_creation_input_tokens / 1_000_000) * p.cacheWrite;
  }
  return Math.round(cost * 100) / 100;
}

function lookupPricing(model: string): Pricing | null {
  if (PRICING[model]) return PRICING[model];
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return PRICING['claude-opus-4-7'];
  if (lower.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  if (lower.includes('haiku')) return PRICING['claude-haiku-4-5'];
  return null;
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
