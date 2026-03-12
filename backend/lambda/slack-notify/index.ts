import type { SNSEvent } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const SSM_PARAM = process.env.SLACK_WEBHOOK_SSM_PARAM!;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedWebhookUrl: string | undefined;
let cachedAt = 0;

async function getWebhookUrl(): Promise<string> {
  if (cachedWebhookUrl && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedWebhookUrl;
  }
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: SSM_PARAM, WithDecryption: true })
  );
  cachedWebhookUrl = Parameter?.Value;
  if (!cachedWebhookUrl) throw new Error("Slack webhook URL not found in SSM");
  cachedAt = Date.now();
  return cachedWebhookUrl;
}

export async function handler(event: SNSEvent): Promise<void> {
  const webhookUrl = await getWebhookUrl();

  for (const record of event.Records) {
    const subject = record.Sns.Subject ?? "VibeShare Alarm";
    const message = record.Sns.Message;

    const payload = {
      text: `*${subject}*\n${message}`,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Slack webhook failed: ${res.status} ${body}`);
    }
  }
}
