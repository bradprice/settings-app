declare module '@repository-settings/app' {
  import { Probot, Context } from 'probot';
  type ConfigGetter = <T>(context: Context, fileName: string, defaultConfig?: T, deepMergeOptions?: any) => Promise<T>;
  const app: (probot: Probot, config: { getConfig: ConfigGetter }) => void;
  export default app;
}