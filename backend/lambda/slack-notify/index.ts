import type { SNSEvent } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UploadEvent } from "../shared/notify";

const ssm = new SSMClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BOT_TOKEN_PARAM = process.env.SLACK_BOT_TOKEN_SSM_PARAM!;
const CHANNEL_ID_PARAM = process.env.SLACK_CHANNEL_ID_SSM_PARAM!;
const THREADS_TABLE = process.env.SLACK_THREADS_TABLE_NAME!;
const ADMIN_UI_URL = process.env.ADMIN_UI_URL!;
const CACHE_TTL_MS = 5 * 60 * 1000;
const THREAD_TTL_DAYS = 30;

// ─── SSM cache ───
let cachedBotToken: string | undefined;
let cachedChannelId: string | undefined;
let tokenCachedAt = 0;
let channelCachedAt = 0;

async function getBotToken(): Promise<string> {
  if (cachedBotToken && Date.now() - tokenCachedAt < CACHE_TTL_MS) {
    return cachedBotToken;
  }
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: BOT_TOKEN_PARAM, WithDecryption: true })
  );
  cachedBotToken = Parameter?.Value;
  if (!cachedBotToken) throw new Error("Slack bot token not found in SSM");
  tokenCachedAt = Date.now();
  return cachedBotToken;
}

async function getChannelId(): Promise<string> {
  if (cachedChannelId && Date.now() - channelCachedAt < CACHE_TTL_MS) {
    return cachedChannelId;
  }
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: CHANNEL_ID_PARAM })
  );
  cachedChannelId = Parameter?.Value;
  if (!cachedChannelId) throw new Error("Slack channel ID not found in SSM");
  channelCachedAt = Date.now();
  return cachedChannelId;
}

// ─── Slack Web API helpers ───

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
}

const AUTH_ERRORS = new Set([
  "missing_scope",
  "invalid_auth",
  "token_revoked",
  "not_authed",
  "account_inactive",
  "token_expired",
]);

function invalidateCacheOnAuthError(slackError: string | undefined): void {
  if (slackError && AUTH_ERRORS.has(slackError)) {
    cachedBotToken = undefined;
    tokenCachedAt = 0;
  }
}

async function slackPostMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<string> {
  const token = await getBotToken();
  const body: Record<string, string> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as SlackResponse;
  if (!data.ok) {
    invalidateCacheOnAuthError(data.error);
    throw new Error(`Slack chat.postMessage failed: ${data.error}`);
  }
  return data.ts!;
}

async function slackUpdateMessage(
  channel: string,
  ts: string,
  text: string
): Promise<void> {
  const token = await getBotToken();
  const res = await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, ts, text }),
  });

  const data = (await res.json()) as SlackResponse;
  if (!data.ok) {
    invalidateCacheOnAuthError(data.error);
    throw new Error(`Slack chat.update failed: ${data.error}`);
  }
}

// ─── DynamoDB thread tracking ───

interface SlackThread {
  groupKey: string;
  threadTs?: string; // undefined while the claiming handler is posting to Slack
  channel: string;
  topLevelText: string;
  createdAt: string;
  expiresAt: number;
}

async function getThread(groupKey: string): Promise<SlackThread | null> {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: THREADS_TABLE, Key: { groupKey } })
  );
  return (Item as SlackThread) ?? null;
}

/** Atomically claim thread creation. Returns true if this invocation won. */
async function claimThread(
  groupKey: string,
  channel: string,
  topLevelText: string
): Promise<boolean> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: THREADS_TABLE,
        Item: {
          groupKey,
          channel,
          topLevelText,
          createdAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + THREAD_TTL_DAYS * 86400,
        },
        ConditionExpression: "attribute_not_exists(groupKey)",
      })
    );
    return true;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === "ConditionalCheckFailedException"
    ) {
      return false;
    }
    throw err;
  }
}

async function setThreadTs(
  groupKey: string,
  threadTs: string
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: THREADS_TABLE,
      Key: { groupKey },
      UpdateExpression: "SET threadTs = :ts",
      ExpressionAttributeValues: { ":ts": threadTs },
    })
  );
}

async function updateTopLevelText(
  groupKey: string,
  newText: string
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: THREADS_TABLE,
      Key: { groupKey },
      UpdateExpression: "SET topLevelText = :text",
      ExpressionAttributeValues: { ":text": newText },
    })
  );
}

/** Poll until the thread record has a threadTs (the winner finished posting). */
async function awaitThreadTs(
  groupKey: string,
  maxAttempts = 10,
  delayMs = 100
): Promise<SlackThread | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const thread = await getThread(groupKey);
    if (thread?.threadTs) return thread;
  }
  return null;
}

/**
 * Ensure a Slack thread exists for this upload. Uses DynamoDB conditional
 * write as an atomic mutex — exactly one handler wins and creates the
 * top-level Slack message; all others wait for it.
 */
async function ensureThread(
  groupKey: string,
  channel: string,
  event: UploadEvent
): Promise<SlackThread | null> {
  const existing = await getThread(groupKey);

  // Thread fully ready
  if (existing?.threadTs) return existing;

  // Another handler is creating it — wait
  if (existing) return awaitThreadTs(groupKey);

  // No record yet — try to claim
  const topText = formatTopLevel(event);
  const won = await claimThread(groupKey, channel, topText);

  if (won) {
    // We won: post top-level Slack message and store its ts
    const ts = await slackPostMessage(channel, topText);
    await setThreadTs(groupKey, ts);
    return { groupKey, threadTs: ts, channel, topLevelText: topText, createdAt: "", expiresAt: 0 };
  }

  // Lost the race — wait for the winner to finish
  return awaitThreadTs(groupKey);
}

// ─── Message formatting ───

function groupKeyFor(event: UploadEvent): string {
  return event.uploadId;
}

function formatTopLevel(event: UploadEvent): string {
  const parts: string[] = [];
  const name = event.userName || event.userEmail || "Anonymous";
  if (event.userEmail) {
    parts.push(`*${name}* (${event.userEmail})`);
  } else {
    parts.push(`*${name}*`);
  }
  parts.push(`Upload: ${event.filename} (${event.sizeMB} MB)`);
  if (event.repoUrl) parts.push(event.repoUrl);
  return parts.join("\n");
}

function appendDownloadLink(
  topLevelText: string,
  uploadId: string,
  filename: string
): string {
  const link = `${ADMIN_UI_URL}/?download=${uploadId}`;
  return `${topLevelText}\n:white_check_mark: <${link}|Download ${filename}>`;
}

function formatPresignReply(event: UploadEvent): string {
  const parts = [`New upload: ${event.filename} (${event.sizeMB} MB)`];
  parts.push(`Upload ID: ${event.uploadId}`);
  if (event.sourceIp) parts.push(`IP: ${event.sourceIp}`);
  return parts.join(" | ");
}

function formatConfirmReply(event: UploadEvent): string {
  return `:white_check_mark: Upload confirmed: ${event.filename} (${event.sizeMB} MB)`;
}

function formatFailedReply(event: UploadEvent): string {
  return `:x: Upload failed: ${event.filename} — ${event.error ?? "unknown error"}`;
}

// ─── Event handling ───

async function handleUploadEvent(event: UploadEvent): Promise<void> {
  const channel = await getChannelId();
  const groupKey = groupKeyFor(event);
  const thread = await ensureThread(groupKey, channel, event);

  if (event.eventType === "presign") {
    if (thread) {
      await slackPostMessage(channel, formatPresignReply(event), thread.threadTs!);
    } else {
      await slackPostMessage(channel, formatPresignReply(event));
    }
  } else if (event.eventType === "confirm") {
    if (thread?.threadTs) {
      const updatedText = appendDownloadLink(
        thread.topLevelText,
        event.uploadId,
        event.filename
      );
      await slackUpdateMessage(channel, thread.threadTs, updatedText);
      await updateTopLevelText(groupKey, updatedText);
      await slackPostMessage(channel, formatConfirmReply(event), thread.threadTs);
    } else {
      await slackPostMessage(channel, formatConfirmReply(event));
    }
  } else if (event.eventType === "confirm-failed") {
    if (thread?.threadTs) {
      await slackPostMessage(channel, formatFailedReply(event), thread.threadTs);
    } else {
      await slackPostMessage(channel, formatFailedReply(event));
    }
  }
}

interface CloudWatchAlarm {
  AlarmName?: string;
  AlarmDescription?: string;
  NewStateValue?: string;
  NewStateReason?: string;
  StateChangeTime?: string;
  Region?: string;
}

function formatAlarmTopLevel(alarm: CloudWatchAlarm): string {
  const isOk = alarm.NewStateValue === "OK";
  const icon = isOk ? ":white_check_mark:" : ":rotating_light:";
  const state = alarm.NewStateValue ?? "UNKNOWN";
  const description = alarm.AlarmDescription || alarm.AlarmName || "Unknown alarm";

  const lines = [`${icon} *${state}: ${description}*`];
  if (alarm.NewStateReason) lines.push(`Reason: ${alarm.NewStateReason}`);
  if (alarm.Region) lines.push(`Region: ${alarm.Region}`);
  if (alarm.StateChangeTime) lines.push(`Time: ${alarm.StateChangeTime}`);
  return lines.join("\n");
}

async function handleAlarmMessage(
  subject: string,
  message: string
): Promise<void> {
  const channel = await getChannelId();

  // Try to parse as CloudWatch alarm JSON
  try {
    const alarm = JSON.parse(message) as CloudWatchAlarm;
    if (alarm.AlarmName) {
      const topText = formatAlarmTopLevel(alarm);
      const ts = await slackPostMessage(channel, topText);
      await slackPostMessage(
        channel,
        "```\n" + JSON.stringify(alarm, null, 2) + "\n```",
        ts
      );
      return;
    }
  } catch {
    // Not JSON — fall through to plain text
  }

  await slackPostMessage(channel, `*${subject}*\n${message}`);
}

// ─── Lambda handler ───

export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    const subject = record.Sns.Subject ?? "VibeShare Alarm";
    const message = record.Sns.Message;

    try {
      const parsed = JSON.parse(message) as UploadEvent;
      if (parsed.eventType) {
        await handleUploadEvent(parsed);
        continue;
      }
    } catch {
      // Not JSON — treat as plain alarm message
    }

    await handleAlarmMessage(subject, message);
  }
}
