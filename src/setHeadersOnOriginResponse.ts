import { CloudFrontResponseEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';
import cookie from 'cookie';
import get from 'lodash/get';

const envCookieOptions: cookie.CookieSerializeOptions = {
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

const branchCookieOptions: cookie.CookieSerializeOptions = {
  maxAge: 2 * 60 * 60 * 1000,
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

const expireCookie = (cookieName: string) =>
  cookie.serialize(cookieName, '', {
    expires: new Date('1970-01-01'),
    httpOnly: true,
    secure: true,
  });

type CreateSetHeadersOnOriginResponseOptions = {
  isSetCookieAllowedForPath(path: string): boolean;
};

export const createSetHeadersOnOriginResponse = ({
  isSetCookieAllowedForPath,
}: CreateSetHeadersOnOriginResponseOptions) => async (
  event: CloudFrontResponseEvent,
) => {
  const { request, response } = event.Records[0].cf;

  const env: string | undefined = get(request.headers, [
    'x-hollowverse-assigned-environment',
    '0',
    'value',
  ]);

  const branch: string | undefined = get(request.headers, [
    'x-hollowverse-requested-branch',
    '0',
    'value',
  ]);

  if (branch) {
    response.headers['cache-control'] = [
      {
        key: 'Cache-Control',
        value: 'no-store, no-cache, proxy-revalidate',
      },
    ];
  }

  if (!isSetCookieAllowedForPath(request.uri)) {
    return response;
  }

  const envCookie =
    !branch && env
      ? cookie.serialize('env', env, envCookieOptions)
      : expireCookie('env');

  const branchCookie = branch
    ? cookie.serialize('branch', branch, branchCookieOptions)
    : expireCookie('branch');

  response.headers['set-cookie'] = [
    ...(response.headers['set-cookie'] || []),
    {
      key: 'set-cookie',
      value: envCookie,
    },
    {
      key: 'set-cookie',
      value: branchCookie,
    },
  ];

  return response;
};

export const setHeadersOnOriginResponse = createLambdaHandler(
  createSetHeadersOnOriginResponse({
    isSetCookieAllowedForPath: path => {
      if (
        path.toLowerCase().startsWith('/static') ||
        path.toLowerCase().startsWith('/log')
      ) {
        return false;
      }

      return true;
    },
  }),
);
