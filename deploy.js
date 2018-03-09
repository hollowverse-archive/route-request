#! /usr/bin/env node
/* eslint-disable no-console */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */

const shelljs = require('shelljs');
const {
  executeCommands,
} = require('@hollowverse/common/helpers/executeCommands');
const { createZipFile } = require('@hollowverse/common/helpers/createZipFile');
const fs = require('fs');
const awsSdk = require('aws-sdk');

awsSdk.config.region = 'us-east-1';

const { IS_PULL_REQUEST, CLOUDFRONT_DISTRIBUTION_ID } = shelljs.env;

const isPullRequest = IS_PULL_REQUEST !== 'false';

async function main() {
  const buildCommands = ['yarn clean', 'yarn build'];
  const deploymentCommands = [
    () => createZipFile('build.zip', ['dist/**/*'], ['secrets/**/*.enc']),
    async () => {
      const cloudfront = new awsSdk.CloudFront({
        apiVersion: '2017-03-25',
        region: 'us-east-1',
      });
      const lambda = new awsSdk.Lambda({
        apiVersion: '2015-03-31',
        region: 'us-east-1',
      });

      const { FunctionArn } = await lambda
        .updateFunctionCode({
          FunctionName: 'assignEnvironment',
          Publish: true,
          ZipFile: fs.readFileSync('build.zip'),
        })
        .promise();

      const { DistributionConfig, ETag } = await cloudfront
        .getDistributionConfig({
          Id: CLOUDFRONT_DISTRIBUTION_ID,
        })
        .promise();

      await cloudfront
        .updateDistribution({
          Id: CLOUDFRONT_DISTRIBUTION_ID,
          IfMatch: ETag,
          DistributionConfig: {
            ...DistributionConfig,
            DefaultCacheBehavior: {
              ...DistributionConfig.DefaultCacheBehavior,
              LambdaFunctionAssociations: {
                Quantity: 1,
                Items: [
                  {
                    EventType: 'viewer-request',
                    LambdaFunctionARN: FunctionArn,
                  },
                ],
              },
            },
          },
        })
        .promise();
    },
  ];

  let isDeployment = false;
  if (isPullRequest === true) {
    console.info('Skipping deployment commands in PRs');
  } else {
    isDeployment = true;
  }

  try {
    await executeCommands(
      isDeployment ? [...buildCommands, ...deploymentCommands] : buildCommands,
    );
  } catch (e) {
    console.error('Build/deployment failed:', e);
    process.exit(1);
  }
}

main();
