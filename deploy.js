#! /usr/bin/env node
/* eslint-disable no-console */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */

const shelljs = require('shelljs');
const {
  executeCommands,
} = require('@hollowverse/common/helpers/executeCommands');
const { createZipFile } = require('@hollowverse/common/helpers/createZipFile');

const { IS_PULL_REQUEST } = shelljs.env;

const isPullRequest = IS_PULL_REQUEST !== 'false';

async function main() {
  const buildCommands = ['yarn clean', 'yarn build'];
  const deploymentCommands = [
    () => createZipFile('build.zip', ['dist/**/*'], ['secrets/**/*.enc']),
    'aws lambda update-function-code --function-name assignEnvironment --zip-file fileb://build.zip --publish',
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
