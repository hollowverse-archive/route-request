import bluebird from 'bluebird';
import find from 'lodash/find';
import get from 'lodash/get';
import { findEnvByName as findApiGatewayEnvByName } from './apiGateway/findEnvByName';
import { parse as parseUrl } from 'url';

type CreateRouteRequestToOriginOptions = {
  findEnvByName(branch: string): Promise<string | undefined>;
};

export const createRouteRequestToOrigin = ({
  findEnvByName,
}: CreateRouteRequestToOriginOptions) => async (
  event: AWSLambda.CloudFrontRequestEvent,
) => {
  const { request } = event.Records[0].cf;

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

  const { host: domainName, path = '' } = parseUrl(envUrl, undefined);

  if (!domainName) {
    throw new TypeError(`Expected host to be defined for URL: ${envUrl}`);
  }

  (request as any).origin = {
    custom: {
      domainName,
      port: 443,
      protocol: 'https',
      sslProtocols: ['TLSv1', 'TLSv1.1'],
      path,
      readTimeout: 30,
      keepaliveTimeout: 5,
      customHeaders: {},
    },
  };

  request.headers.host = [{ key: 'host', value: domainName }];

  return request;
};

export const routeRequestToOrigin = createRouteRequestToOrigin({
  findEnvByName: findApiGatewayEnvByName,
});
