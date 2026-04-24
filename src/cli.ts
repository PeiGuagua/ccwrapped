#!/usr/bin/env node
import { Command } from 'commander';
import kleur from 'kleur';
import { collectEvents } from './collect.js';
import { aggregate } from './aggregate.js';
import { narrate } from './narrate.js';
import { renderTerminal } from './render/terminal.js';
import { configPath, loadConfig } from './config.js';
import { sendEmail } from './email.js';
import { installCron, uninstallCron, cronStatus, triggerNow, logPath } from './cron.js';
import { renderImageToFile } from './render/image.js';
import { resolveLang, t, type Lang } from './i18n.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const program = new Command();

program
  .name('ccwrapped')
  .description('Claude Code daily wrapped — your daily report')
  .version('0.1.0');

program
  .option('-d, --date <YYYY-MM-DD>', 'target date (default: today)')
  .option('-y, --yesterday', 'shortcut for yesterday')
  .option('--json', 'output raw DailyStats as JSON')
  .option('--no-ai', 'skip AI narrative, use template only')
  .option('--email', 'also send report via email (requires email config)')
  .option('--share', 'also generate PNG share images to ~/Desktop')
  .option('--lang <en|zh>', 'output language (default: from config or OS locale)')
  .action(
    async (opts: {
      date?: string;
      yesterday?: boolean;
      json?: boolean;
      ai?: boolean;
      email?: boolean;
      share?: boolean;
      lang?: string;
    }) => {
      const cfg = await loadConfig();
      const lang: Lang = opts.lang === 'en' || opts.lang === 'zh'
        ? opts.lang
        : resolveLang(cfg.language);
      const s = t(lang);

      const target = resolveDate(opts);
      const { start, end } = dayBounds(target);

      if (!opts.json) {
        process.stderr.write(kleur.dim(s.fmtScanNotice(formatYMD(target)) + '\n'));
      }

      const t0 = Date.now();
      const events = await collectEvents(start, end);
      const stats = aggregate(events, target);

      if (opts.json) {
        process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
        return;
      }

      const { text: narrative, source } = await narrate(stats, {
        useAI: opts.ai !== false,
        lang,
      });
      const elapsed = Date.now() - t0;

      process.stdout.write(
        renderTerminal(stats, { narrative, narrativeSource: source, lang }) + '\n'
      );
      process.stderr.write(kleur.dim(s.fmtScanResult(events.length, elapsed) + '\n\n'));

      if (opts.share) {
        process.stderr.write(
          kleur.dim(lang === 'zh' ? '生成分享图...\n' : 'Rendering PNG share images...\n')
        );
        const desktop = join(homedir(), 'Desktop');
        const hPath = join(desktop, `ccwrapped-${stats.date}.png`);
        const vPath = join(desktop, `ccwrapped-${stats.date}-story.png`);
        try {
          await renderImageToFile(stats, hPath, { format: 'horizontal', lang });
          await renderImageToFile(stats, vPath, { format: 'vertical', lang });
          process.stderr.write(kleur.green(`  ✓ ${hPath}\n`));
          process.stderr.write(kleur.green(`  ✓ ${vPath}\n`));
        } catch (err) {
          process.stderr.write(
            kleur.red(`  ✗ PNG failed: ${err instanceof Error ? err.message : String(err)}\n`)
          );
          process.exitCode = 1;
        }
      }

      if (opts.email) {
        process.stderr.write(
          kleur.dim(lang === 'zh' ? '发送邮件...\n' : 'Sending email...\n')
        );
        const result = await sendEmail(stats, narrative, lang);
        if (result.ok) {
          process.stderr.write(
            kleur.green(
              (lang === 'zh' ? '  ✓ 邮件已发送 (id ' : '  ✓ email sent (id ') + result.id + ')\n'
            )
          );
        } else {
          process.stderr.write(
            kleur.red(
              (lang === 'zh' ? '  ✗ 邮件失败: ' : '  ✗ email failed: ') + result.error + '\n'
            )
          );
          process.exitCode = 1;
        }
      }
    }
  );

program
  .command('install-cron')
  .description('schedule daily email via macOS launchd (default 23:00)')
  .option('--at <HH:MM>', 'time of day in 24h format', '23:00')
  .action(async (opts: { at: string }) => {
    const match = opts.at.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error('invalid --at format, expected HH:MM');
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('invalid time');
    }
    await installCron({ hour, minute });
    const s = cronStatus();
    process.stdout.write(
      kleur.green(`✓ installed daily run at ${pad(hour)}:${pad(minute)}\n`)
    );
    process.stdout.write(kleur.dim(`  plist: ${s.plistPath}\n`));
    process.stdout.write(kleur.dim(`  log:   ${s.logPath}\n`));
    process.stdout.write(
      kleur.dim(`\nto trigger a run immediately: ccwrapped trigger-cron\n`)
    );
  });

program
  .command('uninstall-cron')
  .description('remove the scheduled daily run')
  .action(async () => {
    const r = await uninstallCron();
    if (r.removed) process.stdout.write(kleur.green('✓ removed\n'));
    else process.stdout.write(kleur.dim('not installed\n'));
  });

program
  .command('cron-status')
  .description('show whether the daily launchd job is installed and loaded')
  .action(() => {
    const s = cronStatus();
    process.stdout.write(`installed: ${s.installed ? 'yes' : 'no'}\n`);
    process.stdout.write(`loaded:    ${s.loaded ? 'yes' : 'no'}\n`);
    process.stdout.write(`plist:     ${s.plistPath}\n`);
    process.stdout.write(`log:       ${s.logPath}\n`);
  });

program
  .command('trigger-cron')
  .description('trigger the scheduled launchd job once, now')
  .action(() => {
    triggerNow();
    process.stdout.write(
      kleur.green('✓ triggered\n') +
        kleur.dim(`  follow progress: tail -f ${logPath()}\n`)
    );
  });

program
  .command('config')
  .description('show config file path and current contents')
  .action(() => {
    process.stdout.write(`config file: ${configPath()}\n`);
    process.stdout.write(
      [
        '',
        'example contents:',
        '',
        JSON.stringify(
          {
            ai: {
              base_url: 'https://api.moonshot.cn/v1',
              api_key: 'sk-...',
              model: 'moonshot-v1-8k',
            },
            email: {
              resend_api_key: 're_...',
              email_to: 'you@example.com',
            },
          },
          null,
          2
        ),
        '',
      ].join('\n')
    );
  });

program.parseAsync().catch((err) => {
  process.stderr.write(kleur.red(`ccwrapped: ${err?.message ?? err}\n`));
  process.exit(1);
});

function resolveDate(opts: { date?: string; yesterday?: boolean }): Date {
  if (opts.date) {
    const d = new Date(opts.date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) {
      throw new Error(`invalid --date: ${opts.date}`);
    }
    return d;
  }
  const d = new Date();
  if (opts.yesterday) d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
