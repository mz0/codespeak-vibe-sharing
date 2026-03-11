import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ok } from "../shared/response";

export async function handler(
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  return ok({ status: "ok", timestamp: new Date().toISOString() });
}
