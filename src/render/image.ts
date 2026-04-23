import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DailyStats } from '../types.js';

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function loadFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (fontCache) return fontCache;
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = resolve(here, '..', '..');
  const templates = join(pkgRoot, 'templates');
  const [regular, bold] = await Promise.all([
    readFile(join(templates, 'Inter-Regular.ttf')),
    readFile(join(templates, 'Inter-Bold.ttf')),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

export type RenderImageOptions = {
  format: 'horizontal' | 'vertical';
};

export async function renderImage(
  stats: DailyStats,
  opts: RenderImageOptions
): Promise<Buffer> {
  const fonts = await loadFonts();
  const { width, height, tree } =
    opts.format === 'horizontal' ? buildHorizontal(stats) : buildVertical(stats);

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
    ],
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

function buildHorizontal(stats: DailyStats): { width: number; height: number; tree: Node } {
  const activeH = Math.floor(stats.activeMinutes / 60);
  const activeM = stats.activeMinutes % 60;
  const activeStr = activeH > 0 ? `${activeH}h ${activeM}min` : `${activeM}min`;
  const totalTools = Object.values(stats.toolCounts).reduce((s, n) => s + n, 0);
  const topProject = stats.projectBreakdown[0];

  const modelTotal = Object.values(stats.modelTokens).reduce(
    (s, u) =>
      s + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
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
        fontFamily: 'Inter',
        padding: '48px 56px',
      },
      children: [
        headerRow(stats.date),
        spacer(28),
        heroNumber(activeStr, 'active in Claude Code'),
        spacer(32),
        statsGrid([
          { label: 'messages', value: String(stats.assistantMessages + stats.userMessages) },
          { label: 'tools', value: String(totalTools) },
          { label: 'sessions', value: String(stats.sessionCount) },
          { label: 'cost', value: `~$${stats.estimatedCostUSD.toFixed(0)}` },
        ]),
        spacer(28),
        bottomRow(topProject, models, topTools),
        flexSpacer(),
        footer(),
      ],
    },
  };

  return { width, height, tree };
}

function buildVertical(stats: DailyStats): { width: number; height: number; tree: Node } {
  const activeH = Math.floor(stats.activeMinutes / 60);
  const activeM = stats.activeMinutes % 60;
  const activeStr = activeH > 0 ? `${activeH}h ${activeM}min` : `${activeM}min`;
  const totalTools = Object.values(stats.toolCounts).reduce((s, n) => s + n, 0);
  const topProject = stats.projectBreakdown[0];

  const modelTotal = Object.values(stats.modelTokens).reduce(
    (s, u) =>
      s + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
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
        fontFamily: 'Inter',
        padding: '96px 72px',
      },
      children: [
        headerRow(stats.date),
        spacer(64),
        heroNumber(activeStr, 'active in Claude Code', 180),
        spacer(80),
        statsGrid(
          [
            { label: 'messages', value: String(stats.assistantMessages + stats.userMessages) },
            { label: 'tools', value: String(totalTools) },
            { label: 'sessions', value: String(stats.sessionCount) },
            { label: 'cost', value: `~$${stats.estimatedCostUSD.toFixed(0)}` },
          ],
          { large: true }
        ),
        spacer(64),
        verticalBottom(topProject, models, topTools),
        flexSpacer(),
        footer(true),
      ],
    },
  };

  return { width, height, tree };
}

function headerRow(date: string): Node {
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
        {
          type: 'div',
          props: {
            style: { color: '#f59e0b', fontWeight: 700, letterSpacing: 2 },
            children: 'CCWRAPPED',
          },
        },
        {
          type: 'div',
          props: {
            style: { color: '#888' },
            children: formatDate(date),
          },
        },
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
            style: {
              fontSize: size,
              fontWeight: 700,
              letterSpacing: -4,
              lineHeight: 1,
              color: '#fff',
            },
            children: value,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: 22, color: '#aaa' },
            children: subtitle,
          },
        },
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
                style: {
                  fontSize: labelSize,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                },
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
  topTools: Array<{ name: string; count: number }>
): Node {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', gap: 32 },
      children: [
        projectCard(topProject),
        modelsCard(models),
        toolsCard(topTools),
      ],
    },
  };
}

function verticalBottom(
  topProject: { name: string; percentOfDay: number } | undefined,
  models: Array<{ name: string; pct: number }>,
  topTools: Array<{ name: string; count: number }>
): Node {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: 40 },
      children: [
        projectCard(topProject, { large: true }),
        modelsCard(models, { large: true }),
        toolsCard(topTools, { large: true }),
      ],
    },
  };
}

function projectCard(
  top: { name: string; percentOfDay: number } | undefined,
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
        sectionLabel('top project', opts.large),
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
          : {
              type: 'div',
              props: {
                style: { fontSize: opts.large ? 40 : 22, color: '#666' },
                children: '—',
              },
            },
      ],
    },
  };
}

function modelsCard(
  models: Array<{ name: string; pct: number }>,
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
        sectionLabel('models', opts.large),
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
        sectionLabel('top tools', opts.large),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: opts.large ? 14 : 6 },
            children: tools.map((t) =>
              progressRow(t.name, (t.count / max) * 100, String(t.count), opts.large)
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
        {
          type: 'div',
          props: {
            style: { fontSize, color: '#ccc', width: large ? 220 : 110 },
            children: label,
          },
        },
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
      style: {
        fontSize: large ? 18 : 12,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: 2,
      },
      children: text,
    },
  };
}

function footer(large?: boolean): Node {
  return {
    type: 'div',
    props: {
      style: {
        fontSize: large ? 18 : 13,
        color: '#555',
        display: 'flex',
        justifyContent: 'center',
      },
      children: 'ccwrapped · generated locally, code never uploaded',
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

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
