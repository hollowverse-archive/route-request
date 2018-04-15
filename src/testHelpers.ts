// tslint:disable no-implicit-dependencies no-non-null-assertion

import bluebird from 'bluebird';
import cookie from 'cookie';
import {
  Context,
  CloudFrontResponseEvent,
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontHeaders,
  CloudFrontResponse,
} from 'aws-lambda';
import { merge, times } from 'lodash';
import { createAssignEnvironmentToViewerRequest } from './assignEnvironmentToViewerRequest';
import { createRouteRequestToOrigin } from './routeRequestToOrigin';
import { handler as setHeadersOnOriginResponse } from './setHeadersOnOriginResponse';

const toRequestEvent = (
  request: CloudFrontRequest,
): CloudFrontRequestEvent => ({
  Records: [
    {
      cf: {
        config: {
          distributionId: '',
          requestId: '534c650d-3d7b-4d4e-afce-f71d81b4f25c',
        },
        request,
      },
    },
  ],
});

const toResponseEvent = (request: CloudFrontRequest) => (
  response: CloudFrontResponse,
): CloudFrontResponseEvent => ({
  Records: [
    {
      cf: {
        config: {
          distributionId: 'E7N74P8D0SWLS',
          requestId: '534c650d-3d7b-4d4e-afce-f71d81b4f25c',
        },
        request,
        response,
      },
    },
  ],
});

export const parseAllCookies = (
  headers: CloudFrontHeaders[keyof CloudFrontHeaders],
) =>
  (headers || [])
    .map(header => cookie.parse(header.value))
    .reduce((acc, cookiesInHeader) => ({ ...acc, ...cookiesInHeader }), {});

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export type CreateTestContextOptions = {
  eventOverrides?: DeepPartial<CloudFrontRequestEvent>;
  contextOverrides?: DeepPartial<Context>;
  publicBranches?: Record<string, number>;
  getOriginResponse?(request: CloudFrontRequest): Promise<CloudFrontResponse>;
  findEnvByName?(branch: string): Promise<string | undefined>;
};

type UnPromisify<T> = T extends Promise<infer R> ? R : T;

export type TestResult = Readonly<UnPromisify<ReturnType<typeof runTest>>>;

export const runTest = async ({
  eventOverrides,
  getOriginResponse = async request => ({
    status: '200',
    statusDescription: 'OK',
    headers: {
      ['x-actual-environment']: [
        {
          key: 'x-actual-environment',
          value: request.headers.host[0].value,
        },
      ],
    },
  }),
  publicBranches = { beta: 0.25, master: 0.75 },
  findEnvByName = async (branch: string) => {
    if (branch in publicBranches) {
      return `https://${branch}.example.com`;
    }

    return undefined;
  },
}: CreateTestContextOptions = {}) => {
  const event: CloudFrontRequestEvent = merge(
    {
      Records: [
        {
          cf: {
            config: {
              distributionId: 'E7N74P8D0SWLS',
              requestId: '534c650d-3d7b-4d4e-afce-f71d81b4f25c',
            },
            request: {
              clientIp: '192.168.1.1',
              method: 'GET',
              querystring: '',
              uri: 'https://hollowverse.com',
              headers: {},
            },
          },
        },
      ],
    },
    eventOverrides,
  );

  const assignEnv = createAssignEnvironmentToViewerRequest({
    publicBranches,
  });
  const routeRequestToOrigin = createRouteRequestToOrigin({ findEnvByName });

  const response = await Promise.resolve(event)
    .then(assignEnv)
    .then(toRequestEvent)
    .then(routeRequestToOrigin)
    .then(getOriginResponse)
    .then(toResponseEvent(event.Records[0].cf.request))
    .then(setHeadersOnOriginResponse);

  const responseCookies = parseAllCookies(response.headers['set-cookie']);

  const actualEnvironmentHost =
    response.headers['x-actual-environment'][0].value;

  return {
    response,
    responseCookies,
    actualEnvironmentHost,
  };
};

export const runTestManyTimes = async (
  numTests = 300,
  options?: CreateTestContextOptions,
) => bluebird.map(times(numTests), async () => runTest(options));

export const testBot = async (
  userAgent = 'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
  numTests = 300,
) => {
  const results = await runTestManyTimes(numTests, {
    eventOverrides: {
      Records: [
        {
          cf: {
            request: {
              headers: {
                'user-agent': [
                  {
                    key: 'user-agent',
                    value: userAgent,
                  },
                ],
              },
            },
          },
        },
      ],
    },
  });

  results.forEach(({ responseCookies: { env } }) => {
    expect(env).toEqual('master');
  });
};
