import awsSdk from 'aws-sdk';
import memoizePromise from 'p-memoize';

const apiGateway = new awsSdk.APIGateway({ region: 'us-east-1' });

const createFindEnvByName = (pattern: RegExp) =>
  memoizePromise(
    async (branch: string) => {
      let env;
      let position: string | undefined;

      do {
        const response = await apiGateway.getRestApis({ position }).promise();

        const apis = response.items;
        position = response.position;

        if (!apis) {
          break;
        }

        for (const api of apis) {
          if (!api || !api.id || !api.name || !api.name.match(pattern)) {
            continue;
          }

          const id = api.id;

          const { item: stages } = await apiGateway
            .getStages({
              restApiId: api.id,
            })
            .promise();

          if (!stages) {
            throw new TypeError();
          }

          for (const { stageName } of stages) {
            if (stageName === branch) {
              env = `https://${id}.execute-api.us-east-1.amazonaws.com/${stageName}`;

              break;
            }
          }
        }
      } while (!env && !!position);

      return env || undefined;
    },
    { maxAge: 300_000 }
  );

export const findEnvByName = createFindEnvByName(/-website$/gi);
