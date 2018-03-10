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
const { findIndex } = require('lodash');

const {
  IS_PULL_REQUEST,
  AWS_REGION = 'us-east-1',
  CLOUDFRONT_DISTRIBUTION_ID,
} = shelljs.env;

const isPullRequest = IS_PULL_REQUEST !== 'false';

async function main() {
  const buildCommands = ['yarn clean', 'yarn test'];
  const deploymentCommands = [
    'yarn build',
    () => createZipFile('build.zip', ['dist/**/*'], ['secrets/**/*.enc']),
    async () => {
      const cloudfront = new awsSdk.CloudFront({
        apiVersion: '2017-03-25',
        region: AWS_REGION,
      });

      const lambda = new awsSdk.Lambda({
        apiVersion: '2015-03-31',
        region: AWS_REGION,
      });

      try {
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

        const associations =
          DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations;

        let associationItems = associations ? [...associations.Items] : [];

        const index = findIndex(
          associationItems,
          ({ EventType, LambdaFunctionARN }) =>
            EventType === 'viewer-request' &&
            LambdaFunctionARN &&
            LambdaFunctionARN.match(FunctionArn.replace(/:\d+$/i, '')),
        );

        if (index >= 0) {
          associationItems[index].LambdaFunctionARN = FunctionArn;
        } else {
          associationItems = [
            {
              EventType: 'viewer-request',
              LambdaFunctionARN: FunctionArn,
            },
            ...associationItems,
          ];
        }

        await cloudfront
          .updateDistribution({
            Id: CLOUDFRONT_DISTRIBUTION_ID,
            IfMatch: ETag,
            DistributionConfig: {
              ...DistributionConfig,
              DefaultCacheBehavior: {
                ...DistributionConfig.DefaultCacheBehavior,
                LambdaFunctionAssociations: {
                  Quantity: associationItems.length,
                  Items: associationItems,
                },
              },
            },
          })
          .promise();
      } catch (error) {
        console.error(error.message);
      }
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
