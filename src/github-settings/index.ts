import { createProbot, Probot } from 'probot';
import { createLambdaFunction } from '@probot/adapter-aws-lambda-serverless';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Handler } from 'aws-lambda';
import settingsApp from '@repository-settings/app';
import getConfig from 'probot-config';

// Validate app import
if (typeof settingsApp !== 'function') {
  throw new Error('Settings app is not a valid Probot app function. Check @repository-settings/app export.');
}

// Wrap settings app to match Probot's expected signature
const app: import('probot').ApplicationFunction = (probot: Probot) => {
  settingsApp(probot, { getConfig });
};

async function getPrivateKey(): Promise<string> {
  const privateKeyParam = process.env.PRIVATE_KEY_PARAM;
  if (!privateKeyParam) {
    throw new Error('PRIVATE_KEY_PARAM environment variable is not set');
  }

  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION environment variable is not set');
  }

  try {
    const ssmClient = new SSMClient({ region });
    const command = new GetParameterCommand({
      Name: privateKeyParam,
      WithDecryption: true
    });
    const response = await ssmClient.send(command);
    if (!response.Parameter || response.Parameter.Value === undefined) {
      throw new Error(`No value found for SSM parameter: ${privateKeyParam}`);
    }
    return response.Parameter.Value;
  } catch (error) {
    throw new Error(`Failed to fetch private key: ${(error as Error).message}`);
  }
}

const lambdaHandler: Handler = async (event, context) => {
  const privateKey = await getPrivateKey();

  const appId = process.env.APP_ID;
  if (!appId) {
    throw new Error('APP_ID environment variable is not set');
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('WEBHOOK_SECRET environment variable is not set');
  }

  const probot = createProbot({
    env: {
      APP_ID: appId,
      PRIVATE_KEY: privateKey,
      WEBHOOK_SECRET: webhookSecret,
      GITHUB_BASE_URL: process.env.GH_API || 'https://api.github.com'
    }
  });

  try {
    const lambdaFn = createLambdaFunction(app, { probot });
    return await lambdaFn(event, context);
  } catch (error) {
    throw new Error(`createLambdaFunction failed: ${(error as Error).message}`);
  }
};

export const handler = lambdaHandler;