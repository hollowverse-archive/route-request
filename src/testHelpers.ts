// tslint:disable no-implicit-dependencies no-non-null-assertion

import bluebird from 'bluebird';
import cookie from 'cookie';
import {
  Context,
  CloudFrontResponseEvent,
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontHeaders,
} from 'aws-lambda';
import { merge, times, uniq } from 'lodash';
import {
  createAssignEnvironmentToViewerRequest as assignEnvironmentToViewerRequest,
  createAssignEnvironmentToViewerRequest,
} from './assignEnvironmentToViewerRequest';
import {
  createRouteOriginRequest as routeOriginRequest,
  createRouteOriginRequest,
} from './routeOriginRequest';
import { handler as setHeadersOnOriginResponse } from './setHeadersOnOriginResponse';

const requestToEvent = (
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

const requestToResponseEvent = (
  response = {
    headers: {},
    status: '200',
    statusDescription: 'OK',
  },
) => (request: CloudFrontRequest): CloudFrontResponseEvent => ({
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
  publicEnvironments?: Record<string, number>;
  findEnvByName?: typeof mockFindEnvByName;
};

type UnPromisify<T> = T extends Promise<infer R> ? R : T;

export type TestResult = Readonly<UnPromisify<ReturnType<typeof runTest>>>;

export const runTest = async ({
  eventOverrides,
  contextOverrides,
  publicEnvironments = { beta: 0.25, master: 0.75 },
  findEnvByName = async (branch: string) => {
    if (branch in publicEnvironments) {
      return `https://${branch}.example.com`;
    }

    return undefined;
  },
}: CreateTestContextOptions = {}) => {
  const context: Context = merge(
    {
      functionName: 'assignEnvironmentToViewerRequest',
      memoryLimitInMB: 128,
      callbackWaitsForEmptyEventLoop: false,
      invokedFunctionArn: 'any',
      functionVersion: '13',
      logGroupName: 'any',
      awsRequestId: '534c650d-3d7b-4d4e-afce-f71d81b4f25c',
      logStreamName: 'any',
      getRemainingTimeInMillis: jest.fn(() => 1000),
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    },
    contextOverrides,
  );

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

  const endToEndResponse = await createAssignEnvironmentToViewerRequest({
    publicEnvironments,
  })(event)
    .then(requestToEvent)
    .then(createRouteOriginRequest({ findEnvByName }))
    .then(requestToResponseEvent())
    .then(setHeadersOnOriginResponse);

  const parsedResponseCookies = parseAllCookies(
    endToEndResponse.headers['set-cookie'],
  );

  return { context, endToEndResponse, event, parsedResponseCookies };
};

export const runTestManyTimes = async (
  numTests = 300,
  options?: CreateTestContextOptions,
) => bluebird.map(times(numTests), async () => runTest(options));

export const testBot = async (
  userAgent = 'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
  numTests = 300,
) => {
  const results = await bluebird.map(
    runTestManyTimes(numTests, {
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
    }),
    ({ parsedResponseCookies }) => parsedResponseCookies.env,
  );

  expect(results).not.toContain('beta');
  expect(uniq(results)).toEqual(['master']);
};
