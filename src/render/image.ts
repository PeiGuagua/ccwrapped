import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { DailyStats } from '../types.js';
import { t, type Lang } from '../i18n.js';

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

type FontEntry = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
};

let cachedInterFonts: { regular: Buffer; bold: Buffer } | null = null;
let cachedCJKFonts: { regular: Buffer; bold: Buffer } | null = null;

const CJK_FONT_CACHE_DIR = join(homedir(), '.ccwrapped', 'fonts');
const CJK_FONT_URLS = {
  regular:
    'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf',
  bold:
    'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-700-normal.ttf',
};

async function loadInterFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (cachedInterFonts) return cachedInterFonts;
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = resolve(here, '..', '..');
  const templates = join(pkgRoot, 'templates');
  const [regular, bold] = await Promise.all([
    readFile(join(templates, 'Inter-Regular.ttf')),
    readFile(join(templates, 'Inter-Bold.ttf')),
  ]);
  cachedInterFonts = { regular, bold };
  return cachedInterFonts;
}

async function loadCJKFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (cachedCJKFonts) return cachedCJKFonts;
  await mkdir(CJK_FONT_CACHE_DIR, { recursive: true });
  const regPath = join(CJK_FONT_CACHE_DIR, 'NotoSansSC-Regular.ttf');
  const boldPath = join(CJK_FONT_CACHE_DIR, 'NotoSansSC-Bold.ttf');
  if (!existsSync(regPath)) await downloadFont(CJK_FONT_URLS.regular, regPath);
  if (!existsSync(boldPath)) await downloadFont(CJK_FONT_URLS.bold, boldPath);
  const [regular, bold] = await Promise.all([readFile(regPath), readFile(boldPath)]);
  cachedCJKFonts = { regular, bold };
  return cachedCJKFonts;
}

async function downloadFont(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function loadFonts(lang: Lang): Promise<FontEntry[]> {
  const inter = await loadInterFonts();
  const fonts: FontEntry[] = [
    { name: 'Inter', data: inter.regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: inter.bold, weight: 700, style: 'normal' },
  ];
  if (lang === 'zh') {
    const cjk = await loadCJKFonts();
    fonts.push(
      { name: 'Noto Sans SC', data: cjk.regular, weight: 400, style: 'normal' },
      { name: 'Noto Sans SC', data: cjk.bold, weight: 700, style: 'normal' }
    );
  }
  return fonts;
}

export type RenderImageOptions = {
  format: 'horizontal' | 'vertical';
  lang?: Lang;
};

export async function renderImage(
  stats: DailyStats,
  opts: RenderImageOptions
): Promise<Buffer> {
  const lang = opts.lang ?? 'en';
  const fonts = await loadFonts(lang);
  const { width, height, tree } =
    opts.format === 'horizontal' ? buildHorizontal(stats, lang) : buildVertical(stats, lang);

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts,
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
    .render()
    .asPng();
  return Buffer.from(png);
}

export async function renderImageToFile(
  stats: DailyStats,
  outPath: string,
  opts: RenderImageOptions
): Promise<void> {
  const buf = await renderImage(stats, opts);
  await writeFile(outPath, buf);
}

function buildHorizontal(
  stats: DailyStats,
  lang: Lang
): { width: number; height: number; tree: Node } {
  const s = t(lang);
  const activeStr = s.fmtDuration(stats.activeMinutes);
  const totalTools = Object.values(stats.toolCounts).reduce((acc, n) => acc + n, 0);
  const topProject = stats.projectBreakdown[0];

  const modelTotal = Object.values(stats.modelTokens).reduce(
    (acc, u) =>
      acc + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    0
  );
  const models = Object.entries(stats.modelTokens)
    .map(([model, u]) => ({
      name: shortModel(model),
      pct:
        modelTotal > 0
          ? ((u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) /
              modelTotal) *
            100
          : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const topTools = Object.entries(stats.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  const width = 1200;
  const height = 675;

  const tree: Node = {
    type: 'div',
    props: {
      style: {
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f0f10 0%, #1a0f0a 100%)',
        color: '#fff',
        fontFamily: 'Inter, Noto Sans SC',
        padding: '48px 56px',
      },
      children: [
        headerRow(s.brand, s.fmtDate(stats.date)),
        spacer(28),
        heroNumber(activeStr, s.activeSubtitle),
        spacer(32),
        statsGrid([
          { label: s.messages, value: String(stats.assistantMessages + stats.userMessages) },
          { label: s.tools, value: String(totalTools) },
          { label: s.sessions, value: String(stats.sessionCount) },
          { label: s.cost, value: `~$${stats.estimatedCostUSD.toFixed(0)}` },
        ]),
        spacer(28),
        bottomRow(topProject, models, topTools, s),
        flexSpacer(),
        footer(s.footer),
      ],
    },
  };

  return { width, height, tree };
}

function buildVertical(
  stats: DailyStats,
  lang: Lang
): { width: number; height: number; tree: Node } {
  const s = t(lang);
  const activeStr = s.fmtDuration(stats.activeMinutes);
  const totalTools = Object.values(stats.toolCounts).reduce((acc, n) => acc + n, 0);
  const topProject = stats.projectBreakdown[0];

  const modelTotal = Object.values(stats.modelTokens).reduce(
    (acc, u) =>
      acc + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    0
  );
  const models = Object.entries(stats.modelTokens)
    .map(([model, u]) => ({
      name: shortModel(model),
      pct:
        modelTotal > 0
          ? ((u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) /
              modelTotal) *
            100
          : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const topTools = Object.entries(stats.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const width = 1080;
  const height = 1920;

  const tree: Node = {
    type: 'div',
    props: {
      style: {
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0f0f10 0%, #1a0f0a 100%)',
        color: '#fff',
        fontFamily: 'Inter, Noto Sans SC',
        padding: '96px 72px',
      },
      children: [
        headerRow(s.brand, s.fmtDate(stats.date)),
        spacer(64),
        heroNumber(activeStr, s.activeSubtitle, 180),
        spacer(80),
        statsGrid(
          [
            { label: s.messages, value: String(stats.assistantMessages + stats.userMessages) },
            { label: s.tools, value: String(totalTools) },
            { label: s.sessions, value: String(stats.sessionCount) },
            { label: s.cost, value: `~$${stats.estimatedCostUSD.toFixed(0)}` },
          ],
          { large: true }
        ),
        spacer(64),
        verticalBottom(topProject, models, topTools, s),
        flexSpacer(),
        footer(s.footer, true),
      ],
    },
  };

  return { width, height, tree };
}

function headerRow(brand: string, date: string): Node {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 18,
      },
      children: [
        { type: 'div', props: { style: { color: '#f59e0b', fontWeight: 700, letterSpacing: 2 }, children: brand } },
        { type: 'div', props: { style: { color: '#888' }, children: date } },
      ],
    },
  };
}

function heroNumber(value: string, subtitle: string, size = 160): Node {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: 8 },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: size, fontWeight: 700, letterSpacing: -4, lineHeight: 1, color: '#fff' },
            children: value,
          },
        },
        { type: 'div', props: { style: { fontSize: 22, color: '#aaa' }, children: subtitle } },
      ],
    },
  };
}

function statsGrid(
  items: Array<{ label: string; value: string }>,
  opts: { large?: boolean } = {}
): Node {
  const valueSize = opts.large ? 72 : 54;
  const labelSize = opts.large ? 18 : 14;
  return {
    type: 'div',
    props: {
      style: { display: 'flex', gap: 24 },
      children: items.map((it, i) => ({
        type: 'div',
        props: {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '24px 20px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.06)',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  fontSize: valueSize,
                  fontWeight: 700,
                  color: i === 0 ? '#f59e0b' : '#fff',
                  lineHeight: 1,
                },
                children: it.value,
              },
            },
            {
              type: 'div',
              props: {
                style: { fontSize: labelSize, color: '#888', letterSpacing: 1 },
                children: it.label,
              },
            },
          ],
        },
      })),
    },
  };
}

function bottomRow(
  topProject: { name: string; percentOfDay: number } | undefined,
  models: Array<{ name: string; pct: number }>,
  topTools: Array<{ name: string; count: number }>,
  s: ReturnType<typeof t>
): Node {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', gap: 32 },
      children: [projectCard(topProject, s), modelsCard(models, s), toolsCard(topTools, s)],
    },
  };
}

function verticalBottom(
  topProject: { name: string; percentOfDay: number } | undefined,
  models: Array<{ name: string; pct: number }>,
  topTools: Array<{ name: string; count: number }>,
  s: ReturnType<typeof t>
): Node {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: 40 },
      children: [
        projectCard(topProject, s, { large: true }),
        modelsCard(models, s, { large: true }),
        toolsCard(topTools, s, { large: true }),
      ],
    },
  };
}

function projectCard(
  top: { name: string; percentOfDay: number } | undefined,
  s: ReturnType<typeof t>,
  opts: { large?: boolean } = {}
): Node {
  const style: Record<string, unknown> = {
    display: 'flex',
    flexDirection: 'column',
    gap: opts.large ? 16 : 8,
  };
  if (opts.large) style.width = '100%';
  else style.flex = 1;
  return {
    type: 'div',
    props: {
      style,
      children: [
        sectionLabel(s.topProject, opts.large),
        top
          ? {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  fontSize: opts.large ? 56 : 30,
                  fontWeight: 700,
                },
                children: [
                  { type: 'div', props: { children: top.name } },
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: opts.large ? 26 : 16, color: '#888', fontWeight: 400 },
                      children: `${Math.round(top.percentOfDay)}%`,
                    },
                  },
                ],
              },
            }
          : { type: 'div', props: { style: { fontSize: opts.large ? 40 : 22, color: '#666' }, children: '—' } },
      ],
    },
  };
}

function modelsCard(
  models: Array<{ name: string; pct: number }>,
  s: ReturnType<typeof t>,
  opts: { large?: boolean } = {}
): Node {
  const style: Record<string, unknown> = {
    display: 'flex',
    flexDirection: 'column',
    gap: opts.large ? 16 : 8,
  };
  if (opts.large) style.width = '100%';
  else style.flex = 1;
  return {
    type: 'div',
    props: {
      style,
      children: [
        sectionLabel(s.models, opts.large),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: opts.large ? 14 : 6 },
            children: models.map((m) => progressRow(m.name, m.pct, `${Math.round(m.pct)}%`, opts.large)),
          },
        },
      ],
    },
  };
}

function toolsCard(
  tools: Array<{ name: string; count: number }>,
  s: ReturnType<typeof t>,
  opts: { large?: boolean } = {}
): Node {
  const max = tools[0]?.count ?? 1;
  const style: Record<string, unknown> = {
    display: 'flex',
    flexDirection: 'column',
    gap: opts.large ? 16 : 8,
  };
  if (opts.large) style.width = '100%';
  else style.flex = 1;
  return {
    type: 'div',
    props: {
      style,
      children: [
        sectionLabel(s.topTools, opts.large),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: opts.large ? 14 : 6 },
            children: tools.map((tool) =>
              progressRow(tool.name, (tool.count / max) * 100, String(tool.count), opts.large)
            ),
          },
        },
      ],
    },
  };
}

function progressRow(label: string, pct: number, right: string, large?: boolean): Node {
  const fontSize = large ? 24 : 14;
  const barHeight = large ? 14 : 8;
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: 12 },
      children: [
        { type: 'div', props: { style: { fontSize, color: '#ccc', width: large ? 220 : 110 }, children: label } },
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              height: barHeight,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 99,
              display: 'flex',
              overflow: 'hidden',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: `${Math.max(1, Math.round(pct))}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #ef6c00)',
                    borderRadius: 99,
                  },
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize, color: '#888', minWidth: large ? 80 : 40, textAlign: 'right' },
            children: right,
          },
        },
      ],
    },
  };
}

function sectionLabel(text: string, large?: boolean): Node {
  return {
    type: 'div',
    props: {
      style: { fontSize: large ? 18 : 12, color: '#888', letterSpacing: 2 },
      children: text,
    },
  };
}

function footer(text: string, large?: boolean): Node {
  return {
    type: 'div',
    props: {
      style: { fontSize: large ? 18 : 13, color: '#555', display: 'flex', justifyContent: 'center' },
      children: text,
    },
  };
}

function spacer(h: number): Node {
  return { type: 'div', props: { style: { height: h, display: 'flex' } } };
}

function flexSpacer(): Node {
  return { type: 'div', props: { style: { flex: 1, display: 'flex' } } };
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
