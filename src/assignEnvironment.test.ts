// tslint:disable no-implicit-dependencies

import bluebird from 'bluebird';
import { assignEnvironment } from './assignEnvironment';
import { Context, CloudFrontRequestEvent, CloudFrontRequest } from 'aws-lambda';
import { merge, times } from 'lodash';
import cookie from 'cookie';

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

type TestContext = Readonly<{
  event: CloudFrontRequestEvent;
  response: CloudFrontRequest;
  context: Context;
}>;

const createTestContext = async (
  eventOverrides: DeepPartial<CloudFrontRequestEvent> = {},
  contextOverrides: DeepPartial<Context> = {},
): Promise<TestContext> => {
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

  const response = (await bluebird.fromCallback(cb => {
    assignEnvironment(event, context, cb);
  })) as CloudFrontRequest;

  return { context, response, event };
};

describe('assignEnvironment', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestContext();
  });

  describe('for requests without a Cookie header,', () => {
    it('adds a Cookie header', () => {
      expect(context.response.headers.cookie).toBeInstanceOf(Array);
      expect(context.response.headers.cookie).toHaveLength(1);
    });

    it('Cookie header includes `env` cookie', () => {
      const parsedCookie = cookie.parse(
        context.response.headers.cookie[0].value,
      );

      expect(parsedCookie).toHaveProperty('env');
      expect(parsedCookie.env).toMatch(/beta|master/);
    });
  });

  describe('for requests with an existing Cookie header,', () => {
    beforeEach(async () => {
      context = await createTestContext({
        Records: [
          {
            cf: {
              request: {
                headers: {
                  cookie: [{ key: 'cookie', value: 'foo=bar; abc=xyz;' }],
                },
              },
            },
          },
        ],
      });
    });

    it('adds the `env` cookie to an existing header', async () => {
      const parsedCookie = cookie.parse(
        context.response.headers.cookie[0].value,
      );

      expect(parsedCookie).toHaveProperty('env');
      expect(parsedCookie.env).toMatch(/beta|master/);
    });

    it('does not remove other cookies', async () => {
      const parsedCookie = cookie.parse(
        context.response.headers.cookie[0].value,
      );

      expect(parsedCookie).toHaveProperty('foo');
      expect(parsedCookie.foo).toBe('bar');

      expect(parsedCookie).toHaveProperty('abc');
      expect(parsedCookie.abc).toBe('xyz');
    });
  });

  describe('for bots', () => {
    it('should always set `env` cookie to master', async () => {
      await bluebird.map(
        times(10000),
        async () => {
          context = await createTestContext({
            Records: [
              {
                cf: {
                  request: {
                    headers: {
                      'user-agent': [
                        {
                          key: 'user-agent',
                          value:
                            'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
                        },
                      ],
                    },
                  },
                },
              },
            ],
          });

          const parsedCookie = cookie.parse(
            context.response.headers.cookie[0].value,
          );

          expect(parsedCookie).toHaveProperty('env');
          expect(parsedCookie.env).toMatch('master');
        },
        { concurrency: 500 },
      );
    });
  });
});
