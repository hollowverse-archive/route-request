import awsSdk from 'aws-sdk';

const eb = new awsSdk.ElasticBeanstalk({ region: 'us-east-1' });

const prefix = (str: string) => `hollowverse-${str}`;

const unprefix = (str: string) => str.replace(/^hollowverse-/, '');

export const findEnvByName = async (branch: string) => {
  const { Environments } = await eb
    .describeEnvironments({
      ApplicationName: 'Hollowverse',
      IncludeDeleted: false,
      EnvironmentNames: [prefix(branch)],
    })
    .promise();

  if (Environments && Environments.length > 0) {
    const [env] = Environments;

    // tslint:disable-next-line:no-non-null-assertion
    return env.CNAME;
  }

  return undefined;
};
