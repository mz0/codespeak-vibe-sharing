#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { VibeShareStack } from "../lib/vibe-share-stack";

const app = new cdk.App();
new VibeShareStack(app, "VibeShareStack", {
  description: "codespeak-vibe-share backend: S3 upload via presigned URLs",
});
