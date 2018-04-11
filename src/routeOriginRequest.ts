import { Handler, CloudFrontRequestEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import bluebird from 'bluebird';
import compact from 'lodash/compact';
import first from 'lodash/first';
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';
import awsSdk from 'aws-sdk';
import get from 'lodash/get';

const eb = new awsSdk.ElasticBeanstalk({ region: 'us-east-1' });

export const prefix = (str: string) => `hollowverse-${str}`;

export const unprefix = (str: string) => str.replace(/^hollowverse-/, '');

const findEnvByName = async (branch: string) => {
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

export const routeOriginRequest: Handler<
  CloudFrontRequestEvent
> = createLambdaHandler(async event => {
  const request = event.Records[0].cf.request;

  const branch: string | undefined = get(request.headers, [
    'x-hollowverse-requested-branch',
    '0',
    'value',
  ]);

  const env: string | undefined = get(request.headers, [
    'x-hollowverse-assigned-environment',
    '0',
    'value',
  ]);

  const resolvedEnvironment = first(
    compact(
      await bluebird.map(
        [branch, env],
        async (envName, i) =>
          envName
            ? {
                envName,
                envUrl: await findEnvByName(envName),
                isInternal: i === 0,
              }
            : undefined,
      ),
    ),
  );

  if (!resolvedEnvironment) {
    throw new TypeError(
      'Could not find any environment to route the request to',
    );
  }

  const { envUrl } = resolvedEnvironment;

  if (!envUrl) {
    throw new TypeError(
      `Could not find a URL for the requested environment ${env}`,
    );
  }

  if (!envUrl) {
    throw new TypeError(`Expected host to be defined for URL ${envUrl}`);
  }

  (request as any).origin = {
    custom: {
      domainName: envUrl,
      port: 80,
      protocol: 'http',
      sslProtocols: ['TLSv1', 'TLSv1.1'],
      path: '',
      readTimeout: 30,
      keepaliveTimeout: 5,
      customHeaders: {},
    },
  };

  request.headers.host = [{ key: 'host', value: envUrl }];

  return request;
});
