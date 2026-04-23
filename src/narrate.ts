import OpenAI from 'openai';
import type { DailyStats } from './types.js';
import { loadConfig, type AIConfig } from './config.js';

export type NarrateResult = {
  text: string;
  source: 'ai' | 'template' | 'empty';
};

export async function narrate(
  stats: DailyStats,
  opts: { useAI: boolean }
): Promise<NarrateResult> {
  if (stats.totalEvents === 0) {
    return { text: '今天没有使用 Claude Code —— 休息一天也不错。', source: 'empty' };
  }

  if (!opts.useAI) {
    return { text: templateSummary(stats), source: 'template' };
  }

  const cfg = await loadConfig();
  if (!cfg.ai?.api_key || !cfg.ai?.base_url || !cfg.ai?.model) {
    return { text: templateSummary(stats), source: 'template' };
  }

  try {
    const text = await aiSummary(stats, cfg.ai);
    return { text, source: 'ai' };
  } catch (err) {
    if (process.env.CCWRAPPED_DEBUG) {
      process.stderr.write(`[ccwrapped] AI call failed: ${String(err)}\n`);
    }
    return { text: templateSummary(stats), source: 'template' };
  }
}

function templateSummary(stats: DailyStats): string {
  const hours = Math.floor(stats.activeMinutes / 60);
  const mins = stats.activeMinutes % 60;
  const activeStr = hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;

  const topProject = stats.projectBreakdown[0];
  const topTools = Object.entries(stats.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  const nightOwl = computeNightOwl(stats.hourCounts);
  const rhythm =
    nightOwl >= 50
      ? '深夜节奏'
      : nightOwl >= 25
        ? '晚间偏多'
        : stats.peakHour < 9
          ? '大清早就开干'
          : '白天工作节奏';

  const parts: string[] = [];
  parts.push(
    topProject
      ? `今天在 ${topProject.name} 活跃了 ${activeStr}（占 ${Math.round(topProject.percentOfDay)}%）。`
      : `今天活跃了 ${activeStr}。`
  );

  if (topTools.length >= 2) {
    parts.push(
      `主要是 ${topTools[0][0]} × ${topTools[0][1]} 和 ${topTools[1][0]} × ${topTools[1][1]}。`
    );
  } else if (topTools.length === 1) {
    parts.push(`主要在用 ${topTools[0][0]} × ${topTools[0][1]}。`);
  }

  parts.push(
    `峰值 ${String(stats.peakHour).padStart(2, '0')}:00，${rhythm}。`
  );

  if (stats.topFilesEdited.length > 0 && stats.topFilesEdited[0].count >= 3) {
    const f = stats.topFilesEdited[0];
    parts.push(`反复修了 ${shortName(f.path)} ${f.count} 次。`);
  }

  return parts.join(' ');
}

async function aiSummary(stats: DailyStats, ai: AIConfig): Promise<string> {
  const client = new OpenAI({
    apiKey: ai.api_key,
    baseURL: ai.base_url,
  });

  const payload = condense(stats);

  const completion = await client.chat.completions.create({
    model: ai.model,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: [
          '你是一个 Claude Code 使用报告的叙事作者。',
          '根据用户今日的使用统计，写 2-3 句中文总结（严格 ≤120 字）。',
          '硬性要求：',
          '1. 总长度不超过 120 个汉字，宁短勿长。',
          '2. 观察具体，引用 1-2 个真实数字或项目/文件名。',
          '3. 禁止浮夸鼓励类结尾（例如"继续保持"、"加油"、"记得休息"）。',
          '4. 准确解读数字。例如 peakHour=11 是上午工作时段，不是"早起"；nightOwlPercent≥50 才算夜猫子。',
          '5. 如果 topProjects 里出现 "(chat/misc)"，这代表在 home 目录的对话/规划，不是真正的项目，不要把它当主项目夸。',
          '6. 如果看到明显模式（反复改同一文件、深夜集中、会话很长），点出来。',
          '7. 直接写叙事，不要标题、列表、emoji。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('empty completion');
  return text;
}

function condense(stats: DailyStats): Record<string, unknown> {
  const totalTools = Object.values(stats.toolCounts).reduce((s, n) => s + n, 0);
  return {
    date: stats.date,
    activeMinutes: stats.activeMinutes,
    assistantMessages: stats.assistantMessages,
    userMessages: stats.userMessages,
    totalToolCalls: totalTools,
    sessionCount: stats.sessionCount,
    longestSessionMinutes: stats.longestSessionMinutes,
    peakHour: stats.peakHour,
    nightOwlPercent: computeNightOwl(stats.hourCounts),
    estimatedCostUSD: stats.estimatedCostUSD,
    topProjects: stats.projectBreakdown.slice(0, 3).map((p) => ({
      name: p.name,
      percentOfDay: Math.round(p.percentOfDay),
    })),
    topTools: Object.entries(stats.toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    topFilesEdited: stats.topFilesEdited.slice(0, 3).map((f) => ({
      name: shortName(f.path),
      count: f.count,
    })),
    modelsUsed: Object.keys(stats.modelTokens),
  };
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

function shortName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}
