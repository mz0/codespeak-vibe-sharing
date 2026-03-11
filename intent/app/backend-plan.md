# Backend for codespeak-vibe-share: S3 Upload via AWS CDK

## Context

The CLI tool (`codespeak-vibe-share`) already has a working upload flow in `src/upload/upload.ts` that expects a backend providing presigned S3 URLs. No backend exists yet. We need a serverless backend deployed via AWS CDK that the CLI can upload zips to, with optional user metadata (email, name, repo URL).

## Architecture

```
CLI                              AWS
 │
 ├─► POST /api/v1/presign ──► API Gateway ──► Lambda (presign)
 │                                               │ writes to DynamoDB
 │◄── { uploadUrl, uploadId } ◄──────────────────┘
 │                                               │ generates presigned S3 PUT URL
 ├─► PUT uploadUrl ──────────────────────────► S3 bucket
 │
 ├─► POST /api/v1/confirm ──► API Gateway ──► Lambda (confirm)
 │                                               │ verifies S3 object, updates DynamoDB
 │◄── { shareUrl } ◄────────────────────────────┘
```

## Backend File Structure

```
backend/
  cdk.json
  package.json
  tsconfig.json
  bin/
    app.ts                    # CDK app entry point
  lib/
    vibe-share-stack.ts       # All constructs: S3, DynamoDB, Lambdas, API Gateway
  lambda/
    shared/
      response.ts             # HTTP response helpers (ok, badRequest, notFound, serverError)
      types.ts                # UploadRecord interface
    presign/
      index.ts                # POST /api/v1/presign
    confirm/
      index.ts                # POST /api/v1/confirm
    health/
      index.ts                # GET /health
```

## CDK Stack (`lib/vibe-share-stack.ts`)

### S3 Bucket
- Auto-generated name, removal policy: **RETAIN**
- Block all public access
- CORS: allow PUT from `*` (for presigned URL uploads)
- No lifecycle rules (no auto-deletion)
- SSE-S3 encryption (default)
- Key structure: `uploads/{uploadId}/{sanitized-filename}`

### DynamoDB Table
- Billing: **PAY_PER_REQUEST** (on-demand, essentially free at low volume)
- Partition key: `uploadId` (String), no sort key
- Removal policy: **RETAIN**
- No TTL, no GSIs for MVP

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `uploadId` | S (PK) | Yes | UUID v4 |
| `status` | S | Yes | `"pending"` or `"confirmed"` |
| `filename` | S | Yes | Original filename |
| `sizeBytes` | N | Yes | Declared size |
| `s3Key` | S | Yes | Full S3 key |
| `sourceIp` | S | Yes | From API Gateway request context |
| `createdAt` | S | Yes | ISO 8601 |
| `confirmedAt` | S | No | Set on confirm |
| `userEmail` | S | No | Optional |
| `userName` | S | No | Optional |
| `repoUrl` | S | No | Optional |

### Lambda Functions (all 3)
- Runtime: Node.js 20, ARM64
- Memory: 256 MB, Timeout: 10s
- Bundled via CDK `NodejsFunction` (esbuild)
- Environment: `TABLE_NAME`, `BUCKET_NAME`, `UPLOAD_PREFIX=uploads/`

**Presign Lambda** — IAM: `s3:PutObject` (scoped to bucket prefix) + `dynamodb:PutItem`
**Confirm Lambda** — IAM: `s3:HeadObject` (scoped) + `dynamodb:GetItem` + `dynamodb:UpdateItem`
**Health Lambda** — No IAM grants, just returns `{ status: "ok" }`

### API Gateway HTTP API (v2)
- Routes: `POST /api/v1/presign`, `POST /api/v1/confirm`, `GET /health`
- Throttle: burst 10, rate 5/sec (global, per-account — sufficient for MVP)
- CORS: allow all origins, POST/GET methods

### Custom Domain
Defer to a follow-up. For MVP, use the auto-generated API Gateway URL and set it via `VIBE_SHARING_API_URL` env var when testing. Add `api.codespeak.dev` custom domain later (requires ACM cert + Route 53 hosted zone).

## Lambda Implementations

### `lambda/presign/index.ts`
1. Parse body: `{ filename, sizeBytes, contentType, userEmail?, userName?, repoUrl? }`
2. Validate: filename non-empty, sizeBytes > 0 and <= 5GB, contentType = `application/zip`
3. Generate `uploadId` via `crypto.randomUUID()`
4. Build `s3Key = uploads/${uploadId}/${sanitized-filename}`
5. Generate presigned PUT URL (5-min expiry) via `@aws-sdk/s3-request-presigner`
6. Write record to DynamoDB (status: `"pending"`, include optional metadata)
7. Return `{ uploadUrl, uploadId }`

### `lambda/confirm/index.ts`
1. Parse body: `{ uploadId }`
2. Get record from DynamoDB — 404 if not found
3. If already confirmed, return existing shareUrl (idempotent)
4. HeadObject on S3 to verify file exists — 400 if not
5. Update DynamoDB: status → `"confirmed"`, set `confirmedAt`
6. Return `{ shareUrl: "https://codespeak.dev/share/${uploadId}" }`

### `lambda/health/index.ts`
Return `{ status: "ok", timestamp: ... }`

## CLI Changes

### 1. `src/upload/upload.ts` — Add metadata parameter

Add `UploadMetadata` interface and optional `metadata` param to `uploadArchive()`. Spread metadata fields into the presign POST body.

### 2. `src/ui/prompts.ts` — Add `promptUploadMetadata()`

New function that prompts for optional email, name, and repo URL. Auto-detect repo URL from `git remote get-url origin` and let user confirm/edit. All fields skippable with Enter.

### 3. `src/cli.ts` — Collect metadata before upload

After upload consent (line ~256), call `promptUploadMetadata()` and pass result to `uploadArchive()`.

## Key Files to Modify

| File | Change |
|------|--------|
| `src/upload/upload.ts` | Add `UploadMetadata` interface, add `metadata` param to `uploadArchive`, spread into presign body |
| `src/ui/prompts.ts` | Add `promptUploadMetadata()` function |
| `src/cli.ts` | Call `promptUploadMetadata()` before upload, pass to `uploadArchive()` |
| `.gitignore` | Add `cdk.out/` |

## New Files to Create

All files under `backend/`: `cdk.json`, `package.json`, `tsconfig.json`, `bin/app.ts`, `lib/vibe-share-stack.ts`, `lambda/shared/response.ts`, `lambda/shared/types.ts`, `lambda/presign/index.ts`, `lambda/confirm/index.ts`, `lambda/health/index.ts`

## Implementation Order

1. **Backend scaffolding**: `backend/package.json`, `tsconfig.json`, `cdk.json`, `bin/app.ts`
2. **CDK stack**: `lib/vibe-share-stack.ts` — S3, DynamoDB, Lambdas, API Gateway
3. **Lambda shared code**: `lambda/shared/response.ts`, `lambda/shared/types.ts`
4. **Lambda handlers**: `presign/index.ts`, `confirm/index.ts`, `health/index.ts`
5. **CLI changes**: update `upload.ts`, `prompts.ts`, `cli.ts`
6. **Root .gitignore**: add `cdk.out/`

## Verification

1. `cd backend && npm install && npx cdk synth` — should produce CloudFormation template without errors
2. `npx cdk deploy` — deploys to AWS
3. `curl <api-url>/health` — returns `{ "status": "ok" }`
4. `curl -X POST <api-url>/api/v1/presign -H 'Content-Type: application/json' -d '{"filename":"test.zip","sizeBytes":1024,"contentType":"application/zip"}'` — returns `{ uploadUrl, uploadId }`
5. Upload a test file to the presigned URL with `curl -X PUT -T test.zip <uploadUrl>`
6. Confirm: `curl -X POST <api-url>/api/v1/confirm -d '{"uploadId":"..."}'` — returns `{ shareUrl }`
7. Run the full CLI: `VIBE_SHARING_API_URL=<api-url> npx tsx src/index.ts` — end-to-end test

## Prerequisites (user must have)

- AWS CLI installed and configured via SSO (`aws configure sso`) ✅
- Node.js 18+ ✅
- One-time: `cd backend && npx aws-cdk bootstrap aws://ACCOUNT/REGION` ✅ done
