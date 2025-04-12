declare module '@repository-settings/app' {
    import { Probot } from 'probot';
    const app: (probot: Probot) => void;
    export default app;
}