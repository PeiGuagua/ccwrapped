export type Lang = 'en' | 'zh';

export type StringTable = {
  // top-line
  brand: string;
  active: string;
  activeSubtitle: string;

  // stat rows
  messages: string;
  tools: string;
  sessions: string;
  longest: string;
  cost: string;
  assistant: string;
  user: string;

  // section labels
  topProject: string;
  models: string;
  topTools: string;
  mostEdited: string;
  story: string;
  peakHour: string;
  nightOwl: string;

  // misc
  footer: string;
  emptyDay: string;

  // units
  fmtDuration: (minutes: number) => string;
  fmtDate: (isoDate: string) => string;
  fmtMinutes: (n: number) => string;
  fmtLongestSuffix: (minutes: number) => string;
  fmtBreakdown: (assistantMsgs: number, userMsgs: number) => string;
  fmtEmailSubject: (date: string, duration: string) => string;
  fmtScanNotice: (date: string) => string;
  fmtScanResult: (events: number, ms: number) => string;

  // narrate
  narrateSystemPrompt: string;
};

const EN: StringTable = {
  brand: 'CCWRAPPED',
  active: 'Active',
  activeSubtitle: 'active in Claude Code',

  messages: 'Messages',
  tools: 'Tools',
  sessions: 'Sessions',
  longest: 'longest',
  cost: 'Cost',
  assistant: 'assistant',
  user: 'user',

  topProject: 'Top project',
  models: 'Models',
  topTools: 'Top tools',
  mostEdited: 'Most edited',
  story: 'Story',
  peakHour: 'Peak hour',
  nightOwl: 'Night owl',

  footer: 'ccwrapped · generated locally, code never uploaded',
  emptyDay: 'No Claude Code activity on this date.',

  fmtDuration: (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  },
  fmtDate: (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  fmtMinutes: (n) => `${n}min`,
  fmtLongestSuffix: (min) => `longest ${min}min`,
  fmtBreakdown: (a, u) => `(${a} assistant · ${u} user)`,
  fmtEmailSubject: (date, duration) =>
    `Your ccwrapped · ${date} · ${duration} in Claude Code`,
  fmtScanNotice: (date) => `Scanning ~/.claude for ${date}…`,
  fmtScanResult: (events, ms) => `  scanned ${events} events in ${ms}ms`,

  narrateSystemPrompt: [
    'You are the narrator of a daily Claude Code usage report.',
    'Write a 2-3 sentence English summary based on the user\'s stats today (strictly <=30 words).',
    'Rules:',
    '1. <=30 words total. Shorter is better.',
    '2. Cite 1-2 concrete numbers, file names, or project names.',
    '3. No corny encouragement (no "keep it up", "great job", "remember to rest").',
    '4. Read numbers accurately. peakHour=11 is late morning, not early. nightOwlPercent>=50 counts as night owl.',
    '5. If topProjects contains "(chat/misc)" that means activity at the user\'s home directory, not a real project.',
    '6. Mention patterns when visible (same file repeatedly, long session, late-night work).',
    '7. Plain prose only. No headings, bullets, emojis.',
  ].join('\n'),
};

const ZH: StringTable = {
  brand: 'CCWRAPPED',
  active: '活跃',
  activeSubtitle: '今日在 Claude Code',

  messages: '消息数',
  tools: '工具调用',
  sessions: '会话',
  longest: '最长',
  cost: '成本估算',
  assistant: '助手',
  user: '用户',

  topProject: '主力项目',
  models: '模型分布',
  topTools: '工具排行',
  mostEdited: '高频文件',
  story: '今日叙事',
  peakHour: '峰值时段',
  nightOwl: '夜猫指数',

  footer: 'ccwrapped · 全程本地生成，代码不上传',
  emptyDay: '今天没有 Claude Code 活动。',

  fmtDuration: (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}小时${m}分` : `${m}分`;
  },
  fmtDate: (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },
  fmtMinutes: (n) => `${n}分`,
  fmtLongestSuffix: (min) => `最长 ${min}分`,
  fmtBreakdown: (a, u) => `(助手 ${a} · 用户 ${u})`,
  fmtEmailSubject: (date, duration) =>
    `今日 Claude Code 日报 · ${date} · 活跃 ${duration}`,
  fmtScanNotice: (date) => `扫描 ~/.claude （${date}）…`,
  fmtScanResult: (events, ms) => `  已处理 ${events} 条事件，耗时 ${ms}ms`,

  narrateSystemPrompt: [
    '你是 Claude Code 使用日报的叙事作者。',
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
};

export function t(lang: Lang): StringTable {
  return lang === 'zh' ? ZH : EN;
}

export function resolveLang(configured?: string): Lang {
  if (configured === 'zh' || configured === 'en') return configured;
  // auto-detect from OS locale
  const env = process.env.LANG || process.env.LC_ALL || '';
  if (/^zh/i.test(env)) return 'zh';
  return 'en';
}
