import * as index from '../index';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createProbot, Probot } from 'probot';
import { createLambdaFunction } from '@probot/adapter-aws-lambda-serverless';
import settingsApp from '@repository-settings/app';
import getConfig from 'probot-config';
import { Handler, Context } from 'aws-lambda';

// Mock dependencies
jest.mock('@aws-sdk/client-ssm');
jest.mock('probot');
jest.mock('@probot/adapter-aws-lambda-serverless');
jest.mock('@repository-settings/app', () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock('probot-config');
// Mock getPrivateKey for all tests
jest.mock('../index', () => {
  const actual = jest.requireActual('../index');
  return {
    ...actual,
    getPrivateKey: jest.fn()
  };
});

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
    (index.getPrivateKey as jest.Mock).mockImplementation(index.getPrivateKey);
    await expect(index.getPrivateKey()).rejects.toThrow('PRIVATE_KEY_PARAM environment variable is not set');
  });

  test('throws if AWS_REGION is not set', async () => {
    delete process.env.AWS_REGION;
    (index.getPrivateKey as jest.Mock).mockImplementation(index.getPrivateKey);
    await expect(index.getPrivateKey()).rejects.toThrow('AWS_REGION environment variable is not set');
  });

  test('fetches private key from SSM', async () => {
    (index.getPrivateKey as jest.Mock).mockImplementation(index.getPrivateKey);
    const mockResponse = { Parameter: { Value: 'fake-private-key' } };
    (SSMClient.prototype.send as jest.Mock).mockResolvedValue(mockResponse);

    const result = await index.getPrivateKey();
    expect(result).toBe('fake-private-key');
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(GetParameterCommand).toHaveBeenCalledWith({
      Name: '/probot/private-key',
      WithDecryption: true
    });
  });

  test('throws if SSM parameter is not found', async () => {
    (index.getPrivateKey as jest.Mock).mockImplementation(index.getPrivateKey);
    (SSMClient.prototype.send as jest.Mock).mockResolvedValue({});
    await expect(index.getPrivateKey()).rejects.toThrow('No value found for SSM parameter: /probot/private-key');
  });

  test('throws on SSM error', async () => {
    (index.getPrivateKey as jest.Mock).mockImplementation(index.getPrivateKey);
    (SSMClient.prototype.send as jest.Mock).mockRejectedValue(new Error('SSM failed'));
    await expect(index.getPrivateKey()).rejects.toThrow('Failed to fetch private key: SSM failed');
  });
});

describe('handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ID = '12345';
    process.env.WEBHOOK_SECRET = 'secret';
    process.env.PRIVATE_KEY_PARAM = '/probot/private-key';
    process.env.AWS_REGION = 'us-east-1';

    // Mock getPrivateKey for handler tests
    (index.getPrivateKey as jest.Mock).mockResolvedValue('fake-private-key');

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
  });

  test('throws if APP_ID is not set', async () => {
    delete process.env.APP_ID;
    await expect(index.handler({}, {} as Context, () => {})).rejects.toThrow('APP_ID environment variable is not set');
  });

  test('throws if WEBHOOK_SECRET is not set', async () => {
    delete process.env.WEBHOOK_SECRET;
    await expect(index.handler({}, {} as Context, () => {})).rejects.toThrow('WEBHOOK_SECRET environment variable is not set');
  });

  test('initializes Probot and calls createLambdaFunction', async () => {
    const event = { body: '{"action": "push"}' };
    const context = {} as Context;

    const result = await index.handler(event, context, () => {});

    expect(index.getPrivateKey).toHaveBeenCalled();
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

    await index.handler(event, context, () => {});

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

    await expect(index.handler({}, {} as Context, () => {})).rejects.toThrow('createLambdaFunction failed: Lambda failed');
  });
});