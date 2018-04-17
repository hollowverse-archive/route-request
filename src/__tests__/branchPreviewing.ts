// tslint:disable:no-non-null-assertion no-implicit-dependencies
import {
  runTestManyTimes,
  createAndRunTestResponse,
  CreateAndRunTestResponseResult,
} from '../testHelpers';

describe('Branch previewing', () => {
  let testResult: CreateAndRunTestResponseResult;

  beforeEach(async () => {
    testResult = await createAndRunTestResponse({
      publicBranches: {
        master: 1,
        beta: 1,
      },
      cookies: {
        env: 'master',
        branch: 'existingInternalBranch',
      },
      findEnvByName: jest.fn(async (branch: string) => {
        if (['beta', 'master', 'existingInternalBranch'].includes(branch)) {
          return `https://${branch}.example.com`;
        }

        return undefined;
      }),
    });
  });

  it('passes the requested branch name to `findEnvByName`', async () => {
    expect(testResult.findEnvByName).toHaveBeenCalledWith(
      'existingInternalBranch',
    );
  });

  describe('Caching', () => {
    it('tells CDN not to cache the response', async () => {
      const cacheHeader = testResult.response.headers['cache-control'][0].value;
      expect(cacheHeader).toMatch(
        /no-store|proxy-revalidate|must-revalidate|s-maxage=0/,
      );
    });
  });

  describe('If the requested branch actually exists', () => {
    it('`branch` cookie always takes precedence over `env` cookie', async () => {
      const responses = await runTestManyTimes(100, {
        cookies: {
          env: 'master',
          branch: 'beta',
        },
      });

      responses.forEach(response => {
        expect(response.actualEnvironmentHost).toMatch(/beta/);
      });
    });

    it('`branch` query string parameter works like the `branch` cookie', async () => {
      const responses = await runTestManyTimes(100, {
        cookies: {
          env: 'master',
        },
        querystring: 'branch=beta',
      });

      responses.forEach(response => {
        expect(response.actualEnvironmentHost).toMatch(/beta/);
      });
    });
  });

  describe('If the requested branch does not exist', () => {
    it('fails loudly', async () => {
      expect.hasAssertions();

      try {
        await testResult.getResponse({
          cookies: {
            branch: 'nonExistingBranch',
          },
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/find/i);
      }
    });
  });
});
