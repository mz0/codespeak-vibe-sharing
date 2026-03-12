import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const TOPIC_ARN = process.env.UPLOAD_EVENTS_TOPIC_ARN;

/**
 * Publish an upload event to SNS (fire-and-forget).
 * Never throws — failures are logged but don't affect the API response.
 */
export async function notifyUploadEvent(
  subject: string,
  message: string
): Promise<void> {
  if (!TOPIC_ARN) return;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: TOPIC_ARN,
        Subject: subject,
        Message: message,
      })
    );
  } catch (err) {
    console.error("Failed to publish upload event:", err);
  }
}
