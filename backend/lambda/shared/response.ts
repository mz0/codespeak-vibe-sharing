import type { APIGatewayProxyResultV2 } from "aws-lambda";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 400,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

export function notFound(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 404,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

export function serverError(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}
