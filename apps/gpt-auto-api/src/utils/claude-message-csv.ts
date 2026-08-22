import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const MESSAGE_LOG_FILE = path.join(LOG_DIR, 'claude-messages.csv');
const REQUEST_LOG_FILE = path.join(LOG_DIR, 'claude-requests.csv');

export interface ClaudeMessageLog {
  timestamp: string;
  requestId: string;
  model: string;
  stream: boolean;
  messageIndex: number;
  role: string;
  contentType: string;
  contentLength: number;
  content: string;
}

export interface ClaudeRequestLog {
  timestamp: string;
  requestId: string;
  model: string;
  stream: boolean;
  requestType: string;
  totalMessages: number;
  systemPromptLength: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalInputLength: number;
  lastUserMessageLength: number;
  forwardedPayloadLength: number;
  forwardedOnlyLastUser: boolean;
  outputConfigType: string;
  status: string;
  responseLength: number;
  durationMs: number;
  lastUserPreview: string;
}

let messageWriteQueue = Promise.resolve();
let requestWriteQueue = Promise.resolve();

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function appendCsvRow(
  file: string,
  header: string,
  row: string,
  queue: 'message' | 'request',
): Promise<void> {
  const targetQueue = queue === 'message' ? messageWriteQueue : requestWriteQueue;

  const nextQueue = targetQueue.then(async () => {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });

    const exists = await fs.promises
      .access(file)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await fs.promises.writeFile(file, `${header}\n`, 'utf8');
    }

    await fs.promises.appendFile(file, `${row}\n`, 'utf8');
  });

  if (queue === 'message') {
    messageWriteQueue = nextQueue;
  } else {
    requestWriteQueue = nextQueue;
  }

  return nextQueue;
}

export function logClaudeMessage(log: ClaudeMessageLog): Promise<void> {
  const row = [
    log.timestamp,
    log.requestId,
    log.model,
    log.stream,
    log.messageIndex,
    log.role,
    log.contentType,
    log.contentLength,
    log.content,
  ]
    .map(escapeCsv)
    .join(',');

  return appendCsvRow(
    MESSAGE_LOG_FILE,
    'timestamp,request_id,model,stream,message_index,role,content_type,content_length,content',
    row,
    'message',
  );
}

export function logClaudeRequest(log: ClaudeRequestLog): Promise<void> {
  const row = [
    log.timestamp,
    log.requestId,
    log.model,
    log.stream,
    log.requestType,
    log.totalMessages,
    log.systemPromptLength,
    log.userMessageCount,
    log.assistantMessageCount,
    log.totalInputLength,
    log.lastUserMessageLength,
    log.forwardedPayloadLength,
    log.forwardedOnlyLastUser,
    log.outputConfigType,
    log.status,
    log.responseLength,
    log.durationMs,
    log.lastUserPreview,
  ]
    .map(escapeCsv)
    .join(',');

  return appendCsvRow(
    REQUEST_LOG_FILE,
    'timestamp,request_id,model,stream,request_type,total_messages,system_prompt_length,user_message_count,assistant_message_count,total_input_length,last_user_message_length,forwarded_payload_length,forwarded_only_last_user,output_config_type,status,response_length,duration_ms,last_user_preview',
    row,
    'request',
  );
}
