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
import { createSetHeadersOnOriginResponse } from './setHeadersOnOriginResponse';

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
  contextOverrides?: DeepPartial<Context>;
  publicBranches?: Record<string, number>;
  getOriginResponseOverrides?(
    request: CloudFrontRequest,
  ): Promise<Partial<CloudFrontResponse>>;
  findEnvByName?(branch: string): Promise<string | undefined>;
  isSetCookieAllowedForPath?(path: string): boolean;
};

type UnPromisify<T> = T extends Promise<infer R> ? R : T;

export type CreateAndRunTestResponseResult = Readonly<
  UnPromisify<ReturnType<typeof createAndRunTestResponse>>
>;

export type TestContext = Readonly<
  UnPromisify<ReturnType<typeof createTestContext>>
>;

const defaultGetOriginResponse = async (request: CloudFrontRequest) => ({
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
});

export type GetResponseResult = {
  response: CloudFrontResponse;
  responseCookies: Record<string, string>;
  actualEnvironmentHost: string;
};

export const createTestContext = async ({
  getOriginResponseOverrides = defaultGetOriginResponse,
  publicBranches = { beta: 0.25, master: 0.75 },
  findEnvByName = jest.fn(async (branch: string) => {
    if (branch in publicBranches) {
      return `https://${branch}.example.com`;
    }

    return undefined;
  }),
  isSetCookieAllowedForPath = jest.fn(() => true),
}: CreateTestContextOptions = {}) => {
  const assignEnv = createAssignEnvironmentToViewerRequest({
    publicBranches,
  });
  const routeRequestToOrigin = createRouteRequestToOrigin({ findEnvByName });
  const setHeadersOnOriginResponse = createSetHeadersOnOriginResponse({
    isSetCookieAllowedForPath,
  });

  const getResponse = async ({
    uri = '/',
    querystring = '',
    cookies,
    userAgent,
  }: GetTestResponseOptions = {}): Promise<GetResponseResult> => {
    const headers: CloudFrontHeaders = {};

    if (cookies) {
      headers.cookie = [
        {
          key: 'cookie',
          value: Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join(';'),
        },
      ];
    }

    if (userAgent) {
      headers['user-agent'] = [
        {
          key: 'user-agent',
          value: userAgent,
        },
      ];
    }

    const event: CloudFrontRequestEvent = {
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
              querystring,
              uri,
              headers,
            },
          },
        },
      ],
    };

    const response = await Promise.resolve(event)
      .then(assignEnv)
      .then(toRequestEvent)
      .then(routeRequestToOrigin)
      .then(async e =>
        merge(
          await defaultGetOriginResponse(e),
          await getOriginResponseOverrides(e),
        ),
      )
      .then(toResponseEvent(event.Records[0].cf.request))
      .then(setHeadersOnOriginResponse);

    const responseCookies = parseAllCookies(response.headers['set-cookie']);

    const actualEnvironmentHost =
      response.headers['x-actual-environment'][0].value;

    return {
      actualEnvironmentHost,
      response,
      responseCookies,
    };
  };

  return {
    getResponse,
    findEnvByName,
    isSetCookieAllowedForPath,
  };
};

type GetTestResponseOptions = {
  cookies?: Record<string, string>;
  uri?: string;
  querystring?: string;
  userAgent?: string;
};

type CreateAndRunTestOptions = CreateTestContextOptions &
  GetTestResponseOptions;

export const createAndRunTestResponse = async (
  options?: CreateAndRunTestOptions,
) => {
  const context = await createTestContext(options);

  const responseReturn = await context.getResponse(options);

  return {
    ...responseReturn,
    ...context,
  };
};

export const runTestManyTimes = async (
  numTests = 300,
  options?: CreateAndRunTestOptions,
) =>
  bluebird.map(times(numTests), async () => createAndRunTestResponse(options));

export const testBot = async (
  userAgent = 'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
  numTests = 300,
) => {
  const results = await runTestManyTimes(numTests, {
    userAgent,
  });

  results.forEach(({ responseCookies: { env } }) => {
    expect(env).toEqual('master');
  });
};
