/* eslint-disable no-console */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
require('@babel/register')({
  only: [/@hollowverse/],
  babelrc: false,
  presets: [
    [
      '@babel/env',
      {
        targets: {
          node: '6.10',
        },
        useBuiltIns: 'usage',
      },
    ],
  ],
});

const shelljs = require('shelljs');
const {
  executeCommands,
} = require('@hollowverse/utils/helpers/executeCommands');

const { IS_PULL_REQUEST } = shelljs.env;

const isPullRequest = IS_PULL_REQUEST !== 'false';

async function main() {
  const buildCommands = ['yarn test'];
  const deploymentCommands = [
    'NODE_ENV=production yarn serverless deploy --stage development',
  ];

  let isDeployment = false;
  if (isPullRequest === true) {
    console.info('Skipping deployment commands in PRs');
    buildCommands.push(
      'NODE_ENV=production yarn serverless package --stage development',
    );
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
