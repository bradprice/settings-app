import { handler, getPrivateKey } from '../index';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createProbot, Probot } from 'probot';
import { createLambdaFunction } from '@probot/adapter-aws-lambda-serverless';
import settingsApp from '@repository-settings/app';
import getConfig from 'probot-config';
import { Handler, Context } from 'aws-lambda';
import * as getPrivateKeyModule from '../getPrivateKey.js';

// Mock dependencies
jest.mock('@aws-sdk/client-ssm');
jest.mock('probot');
jest.mock('@probot/adapter-aws-lambda-serverless');
jest.mock('@repository-settings/app', () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock('probot-config');

describe('getPrivateKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRIVATE_KEY_PARAM = '/probot/private-key';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.PRIVATE_KEY_PARAM;
    delete process.env.AWS_REGION;
  });

  test('throws if PRIVATE_KEY_PARAM is not set', async () => {
    delete process.env.PRIVATE_KEY_PARAM;
    await expect(getPrivateKey()).rejects.toThrow('PRIVATE_KEY_PARAM environment variable is not set');
  });

  test('throws if AWS_REGION is not set', async () => {
    delete process.env.AWS_REGION;
    await expect(getPrivateKey()).rejects.toThrow('AWS_REGION environment variable is not set');
  });

  test('fetches private key from SSM', async () => {
    const mockResponse = { Parameter: { Value: 'fake-private-key' } };
    (SSMClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getPrivateKey();
    expect(result).toBe('fake-private-key');
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(GetParameterCommand).toHaveBeenCalledWith({
      Name: '/probot/private-key',
      WithDecryption: true
    });
  });

  test('throws if SSM parameter is not found', async () => {
    (SSMClient.prototype.send as jest.Mock).mockResolvedValue({});
    await expect(getPrivateKey()).rejects.toThrow('No value found for SSM parameter: /probot/private-key');
  });

  test('throws on SSM error', async () => {
    (SSMClient.prototype.send as jest.Mock).mockRejectedValue(new Error('SSM failed'));
    await expect(getPrivateKey()).rejects.toThrow('Failed to fetch private key: SSM failed');
  });
});

describe('handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ID = '12345';
    process.env.WEBHOOK_SECRET = 'secret';
    process.env.PRIVATE_KEY_PARAM = '/probot/private-key';
    process.env.AWS_REGION = 'us-east-1';

    // Mock getPrivateKey
    jest.spyOn(getPrivateKeyModule, 'getPrivateKey').mockResolvedValue('fake-private-key');

    // Mock createProbot
    (createProbot as jest.Mock).mockReturnValue({} as Probot);

    // Mock createLambdaFunction
    (createLambdaFunction as jest.Mock).mockImplementation((appFn, options) => {
      appFn(options.probot); // Simulate app initialization
      return jest.fn().mockResolvedValue({ statusCode: 200 });
    });

    // Mock settingsApp
    (settingsApp as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.APP_ID;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.PRIVATE_KEY_PARAM;
    delete process.env.AWS_REGION;
    jest.restoreAllMocks();
  });

  test('throws if APP_ID is not set', async () => {
    delete process.env.APP_ID;
    await expect(handler({}, {} as Context, () => {})).rejects.toThrow('APP_ID environment variable is not set');
  });

  test('throws if WEBHOOK_SECRET is not set', async () => {
    delete process.env.WEBHOOK_SECRET;
    await expect(handler({}, {} as Context, () => {})).rejects.toThrow('WEBHOOK_SECRET environment variable is not set');
  });

  test('initializes Probot and calls createLambdaFunction', async () => {
    const event = { body: '{"action": "push"}' };
    const context = {} as Context;

    const result = await handler(event, context, () => {});

    expect(getPrivateKeyModule.getPrivateKey).toHaveBeenCalled();
    expect(createProbot).toHaveBeenCalledWith({
      env: {
        APP_ID: '12345',
        PRIVATE_KEY: 'fake-private-key',
        WEBHOOK_SECRET: 'secret',
        GITHUB_BASE_URL: 'https://api.github.com'
      }
    });
    expect(createLambdaFunction).toHaveBeenCalledWith(expect.any(Function), { probot: expect.any(Object) });
    expect(settingsApp).toHaveBeenCalledWith(expect.any(Object), { getConfig });
    expect(result).toEqual({ statusCode: 200 });
  });

  test('uses GH_API if set', async () => {
    process.env.GH_API = 'https://custom.github.api';
    const event = { body: '{"action": "push"}' };
    const context = {} as Context;

    await handler(event, context, () => {});

    expect(createProbot).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        GITHUB_BASE_URL: 'https://custom.github.api'
      })
    }));
  });

  test('throws on createLambdaFunction error', async () => {
    (createLambdaFunction as jest.Mock).mockImplementation(() => {
      throw new Error('Lambda failed');
    });

    await expect(handler({}, {} as Context, () => {})).rejects.toThrow('createLambdaFunction failed: Lambda failed');
  });
});