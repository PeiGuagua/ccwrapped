import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.ccwrapped.daily';
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = join(PLIST_DIR, `${LABEL}.plist`);
const LOG_DIR = join(homedir(), '.ccwrapped');
const LOG_PATH = join(LOG_DIR, 'daily.log');

export type InstallOptions = {
  hour: number;
  minute: number;
};

export type CronStatus = {
  installed: boolean;
  loaded: boolean;
  plistPath: string;
  logPath: string;
  schedule?: string;
};

export async function installCron(opts: InstallOptions): Promise<void> {
  if (platform() !== 'darwin') {
    throw new Error('install-cron currently only supports macOS (launchd)');
  }

  const nodePath = process.execPath;
  const cliPath = resolveCliPath();

  if (!existsSync(cliPath)) {
    throw new Error(
      `CLI not built. Run "npm run build" in the ccwrapped project first. Expected: ${cliPath}`
    );
  }

  await mkdir(PLIST_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });

  const plist = renderPlist({ ...opts, nodePath, cliPath });
  await writeFile(PLIST_PATH, plist, 'utf-8');

  try {
    execSync(`launchctl unload ${JSON.stringify(PLIST_PATH)}`, { stdio: 'ignore' });
  } catch {
    // not loaded yet, fine
  }
  execSync(`launchctl load ${JSON.stringify(PLIST_PATH)}`, { stdio: 'ignore' });
}

export async function uninstallCron(): Promise<{ removed: boolean }> {
  if (platform() !== 'darwin') {
    throw new Error('uninstall-cron currently only supports macOS');
  }
  if (!existsSync(PLIST_PATH)) return { removed: false };
  try {
    execSync(`launchctl unload ${JSON.stringify(PLIST_PATH)}`, { stdio: 'ignore' });
  } catch {
    // ignore
  }
  await unlink(PLIST_PATH).catch(() => {});
  return { removed: true };
}

export function cronStatus(): CronStatus {
  const installed = existsSync(PLIST_PATH);
  let loaded = false;
  try {
    const out = execSync(`launchctl list | grep ccwrapped || true`, {
      encoding: 'utf-8',
    });
    loaded = out.includes(LABEL);
  } catch {
    // ignore
  }
  return { installed, loaded, plistPath: PLIST_PATH, logPath: LOG_PATH };
}

export function triggerNow(): void {
  if (platform() !== 'darwin') {
    throw new Error('trigger currently only supports macOS');
  }
  execSync(`launchctl start ${LABEL}`, { stdio: 'ignore' });
}

function renderPlist(o: InstallOptions & { nodePath: string; cliPath: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(o.nodePath)}</string>
    <string>${escapeXml(o.cliPath)}</string>
    <string>--email</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${o.hour}</integer>
    <key>Minute</key>
    <integer>${o.minute}</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(LOG_PATH)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(LOG_PATH)}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(homedir())}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveCliPath(): string {
  // This module lives at <pkg>/dist/cron.js or <pkg>/src/cron.ts when run via tsx.
  // In both cases, a sibling cli.js/ts is present; but launchd must use the built version.
  const here = dirname(fileURLToPath(import.meta.url));
  // If running from dist/, sibling cli.js is the launchd entry.
  const builtSibling = join(here, 'cli.js');
  if (existsSync(builtSibling)) return builtSibling;
  // If running from src/ (dev), go up one level and into dist/
  const pkgRoot = resolve(here, '..');
  return join(pkgRoot, 'dist', 'cli.js');
}

export function logPath(): string {
  return LOG_PATH;
}
