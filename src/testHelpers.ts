// tslint:disable no-implicit-dependencies no-non-null-assertion

import bluebird from 'bluebird';
import cookie from 'cookie';
import { assignEnvironment } from './assignEnvironment';
import { Context, CloudFrontRequestEvent, CloudFrontRequest } from 'aws-lambda';
import { merge, times, uniq } from 'lodash';

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export type CreateTestContextOptions = {
  eventOverrides?: DeepPartial<CloudFrontRequestEvent>;
  contextOverrides?: DeepPartial<Context>;
};

export type TestResult = Readonly<{
  event: CloudFrontRequestEvent;
  modifiedRequest: CloudFrontRequest;
  context: Context;
  parsedCookies?: Array<Record<string, string> | undefined>;
}>;

export const runTest = async ({
  eventOverrides,
  contextOverrides,
}: CreateTestContextOptions = {}): Promise<TestResult> => {
  const context: Context = merge(
    {
      functionName: 'assignEnvironment',
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

  const modifiedRequest = await assignEnvironment(event, context);

  const parsedCookies = modifiedRequest.headers.cookie
    ? modifiedRequest.headers.cookie.map(({ value }) => {
        return value ? cookie.parse(value) : undefined;
      })
    : undefined;

  return { context, modifiedRequest, event, parsedCookies };
};

export const testManyTimes = async (
  numTests = 1000,
  options?: CreateTestContextOptions,
) => bluebird.map(times(numTests), async () => runTest(options));

export const testBot = async (
  userAgent = 'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
  numTests = 1000,
) => {
  const results = await bluebird.map(
    testManyTimes(numTests, {
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
    ({ parsedCookies }) => parsedCookies![0]!.env,
  );

  expect(results).not.toContain('beta');
  expect(uniq(results)).toEqual(['master']);
};
