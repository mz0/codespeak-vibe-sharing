// After first deploy, update these values from the CDK stack outputs.
// Run: cd backend && cdk deploy
// Then copy the output values here.
window.VIBE_SHARE_CONFIG = {
  // CognitoDomain output
  cognitoDomain: "codespeak-vibe-share.auth.eu-north-1.amazoncognito.com",
  // CognitoClientId output
  clientId: "6jvht524cn0vuohkbnl46fn3a3",
  // WebUiUrl output (the CloudFront domain, e.g. https://d1234abcde.cloudfront.net)
  redirectUri: "https://dzy3mo6yrryh.cloudfront.net/callback.html",
  // API base URL
  apiBaseUrl: "https://vibe-share.codespeak.dev",
};
