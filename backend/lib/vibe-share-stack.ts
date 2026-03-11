import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

const UPLOAD_PREFIX = "uploads/";

export class VibeShareStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── S3 Bucket ───
    const bucket = new s3.Bucket(this, "UploadBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
    });

    // ─── DynamoDB Table ───
    const table = new dynamodb.Table(this, "UploadsTable", {
      partitionKey: { name: "uploadId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── Shared Lambda config ───
    const lambdaDir = path.join(__dirname, "..", "lambda");
    const sharedEnv = {
      TABLE_NAME: table.tableName,
      BUCKET_NAME: bucket.bucketName,
      UPLOAD_PREFIX,
    };
    const sharedProps: Partial<lambdaNode.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: sharedEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    };

    // ─── Presign Lambda ───
    const presignFn = new lambdaNode.NodejsFunction(this, "PresignFunction", {
      ...sharedProps,
      entry: path.join(lambdaDir, "presign", "index.ts"),
      handler: "handler",
      environment: {
        ...sharedEnv,
        PRESIGN_EXPIRY_SECONDS: "300",
      },
    });

    // Presign needs: PutObject on S3 (to generate presigned URLs) + PutItem on DynamoDB
    bucket.grantPut(presignFn, `${UPLOAD_PREFIX}*`);
    table.grantWriteData(presignFn);

    // ─── Confirm Lambda ───
    const confirmFn = new lambdaNode.NodejsFunction(this, "ConfirmFunction", {
      ...sharedProps,
      entry: path.join(lambdaDir, "confirm", "index.ts"),
      handler: "handler",
    });

    // Confirm needs: HeadObject on S3 + GetItem/UpdateItem on DynamoDB
    confirmFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:HeadObject"],
        resources: [bucket.arnForObjects(`${UPLOAD_PREFIX}*`)],
      })
    );
    table.grantReadWriteData(confirmFn);

    // ─── Health Lambda ───
    const healthFn = new lambdaNode.NodejsFunction(this, "HealthFunction", {
      ...sharedProps,
      entry: path.join(lambdaDir, "health", "index.ts"),
      handler: "handler",
      environment: {}, // no env needed
    });

    // ─── API Gateway HTTP API ───
    const api = new apigatewayv2.HttpApi(this, "VibeShareApi", {
      description: "codespeak-vibe-share upload API",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.GET,
        ],
        allowHeaders: ["Content-Type"],
      },
    });

    // Routes
    api.addRoutes({
      path: "/api/v1/presign",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "PresignIntegration",
        presignFn
      ),
    });

    api.addRoutes({
      path: "/api/v1/confirm",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "ConfirmIntegration",
        confirmFn
      ),
    });

    api.addRoutes({
      path: "/health",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "HealthIntegration",
        healthFn
      ),
    });

    // ─── Throttling ───
    // HTTP API v2 throttling is set on the stage
    const stage = api.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    if (stage) {
      stage.defaultRouteSettings = {
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
      };
    }

    // ─── Outputs ───
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url ?? "UNKNOWN",
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: table.tableName,
      description: "DynamoDB table name",
    });
  }
}
