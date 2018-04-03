import { Handler, CloudFrontRequestEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import cookie from 'cookie';
import weighted from 'weighted';
import isBot from 'is-bot';
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';

const environments = {
  master: 0.75,
  beta: 0.25,
};

export const assignEnvironment: Handler<
  CloudFrontRequestEvent
> = createLambdaHandler(async event => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const cookieHeaders = headers.cookie;
  let parsedCookie: Record<string, string>;

  if (cookieHeaders) {
    for (const { value } of cookieHeaders) {
      parsedCookie = cookie.parse(value);
      if (parsedCookie.env) {
        // Request already has an environment, doing nothing
        return request;
      }
    }
  }

  const userAgent =
    request.headers['user-agent'] &&
    request.headers['user-agent'][0] &&
    request.headers['user-agent'][0].value;

  const environmentToAssign =
    userAgent && (isBot(userAgent) || /webpagetest/i.test(userAgent))
      ? 'master'
      : weighted.select<string>(environments);

  const serializedCookie = cookie.serialize('env', environmentToAssign, {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,
  });

  request.headers.cookie = request.headers.cookie || [];

  if (request.headers.cookie[0]) {
    request.headers.cookie[0].value += `; ${serializedCookie}`;
  } else {
    request.headers.cookie[0] = {
      value: serializedCookie,
      key: 'cookie',
    };
  }

  return request;
});
