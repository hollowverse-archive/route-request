// tslint:disable:no-non-null-assertion no-implicit-dependencies
import {
  TestContext,
  createTestContext,
  testBot,
  testManyTimes,
} from './testHelpers';
import { oneLine } from 'common-tags';
import { countBy, mapValues } from 'lodash';

describe('assignEnvironment', () => {
  it('picks a random environment based on defined weights', async () => {
    const numTests = 1000;
    const results = await testManyTimes(numTests);
    const cookies = mapValues(
      countBy(results.map(result => result.parsedCookies![0]!.env)),
      v => v / numTests,
    );

    expect(cookies.beta).toBeCloseTo(0.25, 1);
    expect(cookies.master).toBeCloseTo(0.75, 1);
  });

  let context: TestContext;

  describe('for requests with an existing `env` cookie', () => {
    beforeEach(async () => {
      context = await createTestContext({
        eventOverrides: {
          Records: [
            {
              cf: {
                request: {
                  headers: {
                    cookie: [
                      {
                        key: 'cookie',
                        value: 'foo=bar; env=whatever; abc=xyz;',
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      });
    });

    it('does not overwrite `env` cookie if it already exists', async () => {
      expect(context.parsedCookies![0]!).toHaveProperty('env');
      expect(context.parsedCookies![0]!.env).toBe('whatever');
    });
  });

  beforeEach(async () => {
    context = await createTestContext();
  });

  describe('for requests without a Cookie header,', () => {
    it('adds a Cookie header', () => {
      expect(context.result.headers.cookie).toBeInstanceOf(Array);
      expect(context.result.headers.cookie).toHaveLength(1);
    });

    it('Cookie header includes `env` cookie', () => {
      expect(context.parsedCookies![0]!).toHaveProperty('env');
      expect(context.parsedCookies![0]!.env).toMatch(/beta|master/);
    });
  });

  describe('for requests with an existing Cookie header, but without an `env` cookie,', () => {
    beforeEach(async () => {
      context = await createTestContext({
        eventOverrides: {
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
        },
      });
    });

    it('adds the `env` cookie to an existing header', async () => {
      expect(context.parsedCookies![0]!).toHaveProperty('env');
      expect(context.parsedCookies![0]!.env).toMatch(/beta|master/);
    });

    it('does not remove other cookies', async () => {
      expect(context.parsedCookies![0]!).toHaveProperty('foo');
      expect(context.parsedCookies![0]!.foo).toBe('bar');

      expect(context.parsedCookies![0]!).toHaveProperty('abc');
      expect(context.parsedCookies![0]!.abc).toBe('xyz');
    });
  });

  describe('for bots', () => {
    it('should always set `env` cookie to master', async () => {
      await testBot();
    });

    it('treats WebPageTest as a bot and always sets `env` to master', async () => {
      // tslint:disable-next-line:no-multiline-string
      await testBot(oneLine`
        Mozilla/5.0 (Linux;
        Android 4.4.2; Nexus 4 Build/KOT49H)
        AppleWebKit/537.36 (KHTML, like Gecko)
        Chrome/65.0.3325.162
        Mobile Safari/537.36
        WebPageTest
      `);
    });
  });
});
