export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}
export interface ProxyProvider {
  getProxy(platform: string): Promise<ProxyConfig | undefined>;
}
export class DisabledProxyProvider implements ProxyProvider {
  async getProxy(_platform: string) {
    return undefined;
  }
}
// Authorized connectivity only. Never rotate proxies to bypass quotas or access restrictions.
