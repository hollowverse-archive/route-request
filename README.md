# `route-request` [![Build Status](https://travis-ci.org/hollowverse/route-request.svg?branch=master)](https://travis-ci.org/hollowverse/route-request)

A set of [AWS Lambda@Edge](https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html) functions, i.e. functions that run on [CloudFront](https://aws.amazon.com/cloudfront/) edge servers to route new visitors of Hollowverse.com to different versions of the website for testing purposes.

The functions work at different stages of CloudFront request processing (see the image below).

![](https://docs.aws.amazon.com/lambda/latest/dg/images/cloudfront-events-that-trigger-lambda-functions.png 'The different stages of request processing a Lambda@Edge can be executed at. Source: https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html')

## Traffic Splitting

- [`assignEnvironmentToViewerRequest`](./src/assignEnvironmentToViewerRequest.ts) picks one of the public environments and stores the assigned environment in a header, this happens before CloudFront checks the cache. That header must be white-listed in the CloudFront distribution so that different versions of the same URL can be cached based on the environment assigned.
- [`routeRequestToOrigin`](./src/routeRequestToOrigin.ts) looks at the header assigned in the previous stage, fetches the corresponding environment URL and instructs CloudFront to fetch the response from that URL. CloudFront either fetches the response from the specified origin or from its cache.
- [`setHeadersOnOriginResponse`](./src/setHeadersOnOriginResponse.ts) adds a cookie (named `env`) to the response that CloudFront got from the environment URL to keep the user on the same session for subsequent requests. CloudFront now stores the response in its edge caches. The cookie set on the response must be white-listed in CloudFront settings so that in the subsequent requests, `assignEnvironmentToViewerRequest` can read that cookie, and instead of picking a random environment, picks the environment that is stored in that cookie. This way the user can stay on the same environment for the lifetime of that cookie.

## Branch Previewing

`route-request` can also be used to preview internal branches before they are ready for production. This works similarly to traffic splitting, except that it reads the target branch name from a cookie called `branch` or from a query string parameter with the same name (i.e. `/?branch=internal`). These are always checked before checking the `env` cookie so branch previewing can works even if the user has been assigned an environment.

For branch previewing, `setHeadersOnOriginResponse` modifies the cache control headers such that the responses are not cached in CloudFront, because we usually need to see changes to internal branches as quickly as possible.

## Architecture

You can [read about our architecture](https://github.com/hollowverse/architecture#readme).
to find out more about the roles these functions play in our overall architecture.

---

[If you'd like to tell us something, or need help with anything...](https://github.com/hollowverse/hollowverse/wiki/Help)
