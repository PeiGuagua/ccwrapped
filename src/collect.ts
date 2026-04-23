import fg from 'fast-glob';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RawEvent, ToolCall, TokenUsage } from './types.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

export async function collectEvents(start: Date, end: Date): Promise<RawEvent[]> {
  const files = await fg('*/*.jsonl', { cwd: PROJECTS_DIR, absolute: true });
  const startMs = start.getTime();
  const endMs = end.getTime();
  const events: RawEvent[] = [];

  for (const file of files) {
    await parseFile(file, startMs, endMs, events);
  }

  events.sort((a, b) => a.timestampMs - b.timestampMs);
  return events;
}

async function parseFile(
  path: string,
  startMs: number,
  endMs: number,
  sink: RawEvent[]
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = obj.timestamp;
    if (typeof ts !== 'string') continue;
    const ms = Date.parse(ts);
    if (Number.isNaN(ms)) continue;
    if (ms < startMs || ms >= endMs) continue;

    const message = obj.message as
      | { model?: string; role?: string; content?: unknown[]; usage?: Record<string, number> }
      | undefined;

    const toolCalls: ToolCall[] = [];
    let textLen = 0;
    if (message && Array.isArray(message.content)) {
      for (const c of message.content as Array<{ type?: string; name?: string; input?: Record<string, unknown>; text?: string }>) {
        if (c.type === 'tool_use' && typeof c.name === 'string') {
          toolCalls.push({ name: c.name, input: c.input ?? {} });
        } else if (c.type === 'text' && typeof c.text === 'string') {
          textLen += c.text.length;
        }
      }
    }

    let usage: TokenUsage | undefined;
    if (message?.usage) {
      usage = {
        input_tokens: message.usage.input_tokens ?? 0,
        output_tokens: message.usage.output_tokens ?? 0,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      };
    }

    sink.push({
      type: typeof obj.type === 'string' ? obj.type : 'unknown',
      timestamp: ts,
      timestampMs: ms,
      uuid: typeof obj.uuid === 'string' ? obj.uuid : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      cwd: typeof obj.cwd === 'string' ? obj.cwd : undefined,
      version: typeof obj.version === 'string' ? obj.version : undefined,
      model: message?.model,
      role: message?.role,
      toolCalls,
      usage,
      textLen: textLen || undefined,
    });
  }
}
