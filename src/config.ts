import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.ccwrapped');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export type AIConfig = {
  base_url: string;
  api_key: string;
  model: string;
};

export type EmailConfig = {
  resend_api_key: string;
  email_to: string;
  from?: string;
};

export type Config = {
  language?: 'en' | 'zh';
  ai?: AIConfig;
  email?: EmailConfig;
};

export async function loadConfig(): Promise<Config> {
  try {
    const text = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(text) as Config;
  } catch {
    return {};
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function configPath(): string {
  return CONFIG_PATH;
}
