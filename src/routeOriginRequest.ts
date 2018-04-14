import { CloudFrontRequestEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';
import bluebird from 'bluebird';
import find from 'lodash/find';
import get from 'lodash/get';
import { findEnvByName as findEbEnvByName } from './eb/findEnvByName';

type CreateRouteOriginRequestOptions = {
  findEnvByName(branch: string): Promise<string | undefined>;
};

export const createRouteOriginRequest = ({
  findEnvByName,
}: CreateRouteOriginRequestOptions) => async (
  event: CloudFrontRequestEvent,
) => {
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

  const possibleEnvironments = await bluebird.map(
    [branch, env],
    async (envName, i) =>
      envName
        ? {
            envName,
            envUrl: await findEnvByName(envName),
            isInternal: i === 0,
          }
        : undefined,
  );
  const resolvedEnvironment = find(possibleEnvironments, v => v !== undefined);

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
};

export const routeOriginRequest = createLambdaHandler(
  createRouteOriginRequest({
    findEnvByName: findEbEnvByName,
  }),
);
