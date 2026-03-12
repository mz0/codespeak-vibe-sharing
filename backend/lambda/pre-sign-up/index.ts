import type { PreSignUpTriggerEvent } from "aws-lambda";

const ALLOWED_DOMAIN = "codespeak.dev";

export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const email = event.request.userAttributes.email;

  if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(`Only @${ALLOWED_DOMAIN} email addresses are allowed to register.`);
  }

  // Auto-confirm email so they don't need a separate verification step
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  return event;
}
