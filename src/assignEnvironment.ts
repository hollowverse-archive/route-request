import { Handler, CloudFrontRequestEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import cookie from 'cookie';
import weighted from 'weighted';

const environments = {
  master: 0.75,
  beta: 0.25,
};

export const assignEnvironment: Handler<CloudFrontRequestEvent> = (
  event,
  _context,
  done,
) => {
  try {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const cookieHeaders = headers.cookie;
    let parsedCookie: Record<string, string>;

    if (cookieHeaders) {
      for (const { value } of cookieHeaders) {
        parsedCookie = cookie.parse(value);
        if (parsedCookie.env) {
          // Request already has an environment, doing nothing;
          done(null, request);

          return;
        }
      }
    }

    const randomEnv = weighted.select<string>(environments);

    const serializedCookie = cookie.serialize('env', randomEnv, {
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

    done(null, request);
  } catch (error) {
    console.error(error);
    done(error);
  }
};
