// tslint:disable:no-non-null-assertion
import { TestContext, createTestContext, testBot } from './testHelpers';

describe('assignEnvironment', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestContext();
  });

  describe('for requests with an existing `env` cookie', () => {
    beforeEach(async () => {
      context = await createTestContext({
        Records: [
          {
            cf: {
              request: {
                headers: {
                  cookie: [
                    { key: 'cookie', value: 'foo=bar; env=whatever; abc=xyz;' },
                  ],
                },
              },
            },
          },
        ],
      });
    });

    it('does not overwrite `env` cookie if it already exists', async () => {
      expect(context.parsedCookies![0]!).toHaveProperty('env');
      expect(context.parsedCookies![0]!.env).toBe('whatever');
    });
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
      await testBot();
    });
  });
});
