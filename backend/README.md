# codespeak-vibe-share Backend

Serverless backend for the codespeak-vibe-share CLI. Provides presigned S3 URLs for secure file uploads.

## Architecture

- **API Gateway HTTP API** — routes + rate limiting (burst 10, rate 5/sec)
- **3 Lambda functions** (Node.js 20, ARM64):
  - `POST /api/v1/presign` — validates request, generates presigned S3 PUT URL, writes metadata to DynamoDB
  - `POST /api/v1/confirm` — verifies S3 object exists, marks upload confirmed
  - `GET /health` — returns `{ status: "ok" }`
- **S3 bucket** — stores uploaded zips (max 5 GB each, no auto-deletion)
- **DynamoDB table** — tracks upload metadata (on-demand billing)

## Prerequisites

- AWS CLI configured (`aws configure sso`)
- Node.js 18+
- CDK bootstrapped in your account/region (one-time):
  ```bash
  npx aws-cdk bootstrap aws://ACCOUNT_ID/REGION --profile YOUR_PROFILE
  ```

## Setup

```bash
cd backend
npm install
```

## Deploy

```bash
npx aws-cdk deploy --profile YOUR_PROFILE
```

Outputs the API Gateway URL, S3 bucket name, and DynamoDB table name.

## Verify

```bash
# Health check
curl https://YOUR_API_URL/health

# Test presign
curl -X POST https://YOUR_API_URL/api/v1/presign \
  -H 'Content-Type: application/json' \
  -d '{"filename":"test.zip","sizeBytes":1024,"contentType":"application/zip"}'

# Upload a file to the returned presigned URL
curl -X PUT -H 'Content-Type: application/zip' -T test.zip "PRESIGNED_URL"

# Confirm
curl -X POST https://YOUR_API_URL/api/v1/confirm \
  -H 'Content-Type: application/json' \
  -d '{"uploadId":"UPLOAD_ID"}'
```

## Use with the CLI

```bash
VIBE_SHARING_API_URL=https://YOUR_API_URL npx tsx src/index.ts
```

## Other commands

```bash
npx aws-cdk diff --profile YOUR_PROFILE    # Preview changes before deploy
npx aws-cdk synth                           # Generate CloudFormation template
npx aws-cdk destroy --profile YOUR_PROFILE  # Tear down (S3 + DynamoDB are retained)
```

## Presign request body

```json
{
  "filename": "archive.zip",
  "sizeBytes": 123456,
  "contentType": "application/zip",
  "userEmail": "optional",
  "userName": "optional",
  "repoUrl": "optional"
}
```
