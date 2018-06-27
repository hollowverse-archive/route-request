// tslint:disable no-non-null-assertion
import bluebird from 'bluebird';
import cookie from 'cookie';
import { times, get } from 'lodash';
import { createAssignEnvironmentToViewerRequest } from './assignEnvironmentToViewerRequest';
import { createRouteRequestToOrigin } from './routeRequestToOrigin';
import { createSetHeadersOnOriginResponse } from './setHeadersOnOriginResponse';

const toRequestEvent = (
  request: AWSLambda.CloudFrontRequest,
): AWSLambda.CloudFrontRequestEvent => ({
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

const toResponseEvent = (request: AWSLambda.CloudFrontRequest) => (
  response: AWSLambda.CloudFrontResponse,
): AWSLambda.CloudFrontResponseEvent => ({
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
  /**
   * While the type of this is not explicitly declared as possibly `undefined`,
   * it could actually be `undefined` in real Lambda environments.
   */
  headers:
    | AWSLambda.CloudFrontHeaders[keyof AWSLambda.CloudFrontHeaders]
    | undefined,
) => {
  if (headers) {
    return headers.map(header => cookie.parse(header.value)).reduce(
      (acc, cookiesInHeader) => ({ ...acc, ...cookiesInHeader }),
      // It's important to pass an empty object as a starting value,
      // otherwise it would cause a runtime error
      {},
    );
  }

  return {};
};

/* eslint-disable no-use-before-define */
type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export type CreateTestContextOptions = {
  contextOverrides?: DeepPartial<AWSLambda.Context>;
  publicBranches?: Record<string, number>;
  getOriginResponse?(
    request: AWSLambda.CloudFrontRequest,
  ): Promise<AWSLambda.CloudFrontResponse>;
  findEnvByName?(branch: string): Promise<string | undefined>;
  isSetCookieAllowedForPath?(path: string): boolean;
};

type UnPromisify<T> = T extends Promise<infer R> ? R : T;

const defaultGetOriginResponse = async (
  request: AWSLambda.CloudFrontRequest,
) => ({
  status: '200',
  statusDescription: 'OK',
  headers: {
    'x-actual-environment': [
      {
        key: 'x-actual-environment',
        value: request.headers.host[0].value,
      },
    ],
  },
});

export type GetResponseResult = {
  response: AWSLambda.CloudFrontResponse;
  responseCookies: Record<string, string>;
  actualEnvironmentHost: string | undefined;
};

export const createTestContext = async ({
  getOriginResponse = defaultGetOriginResponse,
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
    const headers: AWSLambda.CloudFrontHeaders = {};

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

    const event: AWSLambda.CloudFrontRequestEvent = {
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
      .then(getOriginResponse)
      .then(toResponseEvent(event.Records[0].cf.request))
      .then(setHeadersOnOriginResponse);

    const responseCookies = parseAllCookies(response.headers['set-cookie']);

    const actualEnvironmentHost: string | undefined = get(response.headers, [
      'x-actual-environment',
      '0',
      'value',
    ]);

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

export type CreateAndRunTestResponseResult = Readonly<
  UnPromisify<ReturnType<typeof createAndRunTestResponse>>
>;

export type TestContext = Readonly<
  UnPromisify<ReturnType<typeof createTestContext>>
>;

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
