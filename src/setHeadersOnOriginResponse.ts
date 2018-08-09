import cookie from 'cookie';
import get from 'lodash/get';

const expireCookie = (cookieName: string) =>
  cookie.serialize(cookieName, '', {
    expires: new Date('1970-01-01'),
    httpOnly: true,
    secure: true,
  });

type CreateSetHeadersOnOriginResponseOptions = {
  branchCookieOptions?: Partial<cookie.CookieSerializeOptions>;
  envCookieOptions?: Partial<cookie.CookieSerializeOptions>;
  isSetCookieAllowedForPath(path: string): boolean;
};

export const createSetHeadersOnOriginResponse = ({
  isSetCookieAllowedForPath,
  envCookieOptions,
  branchCookieOptions,
}: CreateSetHeadersOnOriginResponseOptions) => async (
  event: AWSLambda.CloudFrontResponseEvent,
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
        value: 'max-age=3600, s-maxage=0, proxy-revalidate',
      },
    ];
  }

  if (!isSetCookieAllowedForPath(request.uri)) {
    return response;
  }

  const envCookie =
    !branch && env
      ? cookie.serialize('env', env, {
          maxAge: 24 * 60 * 60,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          ...envCookieOptions,
        })
      : expireCookie('env');

  const branchCookie = branch
    ? cookie.serialize('branch', branch, {
        maxAge: 2 * 60 * 60,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        ...branchCookieOptions,
      })
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

export const setHeadersOnOriginResponse = createSetHeadersOnOriginResponse({
  isSetCookieAllowedForPath: path => {
    if (
      path.toLowerCase().startsWith('/static') ||
      path.toLowerCase().startsWith('/log')
    ) {
      return false;
    }

    return true;
  },
});
