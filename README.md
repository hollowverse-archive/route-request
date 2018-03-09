# `lambda-assign-env` [![Build Status](https://travis-ci.org/hollowverse/lambda-assign-env.svg?branch=master)](https://travis-ci.org/hollowverse/lambda-assign-env)

An [AWS Lambda@Edge](https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html) function, i.e. a function that runs on [CloudFront](https://aws.amazon.com/cloudfront/) edge servers to route new visitors of Hollowverse.com to different versions of the website for testing purposes.

This function works in conjunction with [Release Manager](https://github.com/hollowverse/release-manager). Release Manager implements all the logic for [traffic splitting](https://github.com/hollowverse/release-manager#traffic-splitting), and can work completely independently from this function.

However, putting CloudFront in front of Release Manager means that we can no longer do traffic splitting because Release Manger does not see new visitors, as CloudFront serves a cached version of the website to all users.

This function puts the environment assignment logic from Release Manager back on top of CloudFront. It picks one of the environments and sets the `env` cookie accordingly at the "viewer request" stage of request processing (see the image below), before CloudFront checks the cache.

![](https://docs.aws.amazon.com/lambda/latest/dg/images/cloudfront-events-that-trigger-lambda-functions.png 'The different stages of request processing a Lambda@Edge can be executed at. Source: https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html')

For the first time a specific page is requested, and provided that [CloudFront is configured to cache different versions of a page based on the `env` cookie](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/header-caching.html), CloudFront will forward the request to Release Manager with the assigned `env` cookie and Release Manager will read that cookie and respond with the correct version. CloudFront gets the response and caches it at the edge location.

If later requests get assigned to the same environment, CloudFront will find the requested page in the cache, and serve it without hitting the live Release Manager server.
