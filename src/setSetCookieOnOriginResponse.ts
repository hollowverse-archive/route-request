import { Handler, CloudFrontResponseEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import cookie from 'cookie';
import get from 'lodash/get';
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';

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

export const setSetCookieOnOriginResponse: Handler<
  CloudFrontResponseEvent
> = createLambdaHandler(async event => {
  const { request, response } = event.Records[0].cf;

  if (
    request.uri.toLowerCase().startsWith('/static') ||
    request.uri.toLowerCase().startsWith('/log')
  ) {
    return response;
  }

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
        value: 'no-store, no-cache, must-revalidate',
      },
    ];
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
});
