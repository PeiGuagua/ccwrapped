export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type RawEvent = {
  type: string;
  timestamp: string;
  timestampMs: number;
  uuid?: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  model?: string;
  role?: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  textLen?: number;
};

export type ProjectStat = {
  cwd: string;
  name: string;
  messageCount: number;
  toolCount: number;
  percentOfDay: number;
};

export type DailyStats = {
  date: string;
  timezone: string;
  totalEvents: number;
  assistantMessages: number;
  userMessages: number;
  toolCounts: Record<string, number>;
  modelTokens: Record<string, TokenUsage>;
  sessionIds: string[];
  sessionCount: number;
  hourCounts: number[];
  peakHour: number;
  projectBreakdown: ProjectStat[];
  topFilesEdited: Array<{ path: string; count: number }>;
  firstActivityMs: number;
  lastActivityMs: number;
  activeMinutes: number;
  estimatedCostUSD: number;
  longestSessionMinutes: number;
};
