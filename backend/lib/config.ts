export const config = {
  alarmEmail: "alarms@codespeak.dev",

  // SSM parameter name containing the Slack incoming webhook URL.
  // Create it before deploying:
  //   aws ssm put-parameter --name /vibe-share/slack-webhook-url --type SecureString --value "https://hooks.slack.com/services/..."
  slackWebhookSsmParam: "/vibe-share/slack-webhook-url",

  // Allowed CORS origins for API Gateway and S3 presigned uploads.
  corsAllowedOrigins: [
    "https://codespeak.dev",
    "https://*.codespeak.dev",
  ],
};
