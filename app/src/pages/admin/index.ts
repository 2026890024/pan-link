import { lazyWithPreload } from '@/utils/lazyWithPreload'

export const DashboardPage = lazyWithPreload(() => import('./DashboardPage'))
export const ResourceManagementPage = lazyWithPreload(() => import('./ResourceManagementPage'))
export const AccountSettingsPage = lazyWithPreload(() => import('./AccountSettingsPage'))
export const DataManagementPage = lazyWithPreload(() => import('./DataManagementPage'))
export const HomepageSettingsPage = lazyWithPreload(() => import('./HomepageSettingsPage'))
export const SiteSettingsPage = lazyWithPreload(() => import('./SiteSettingsPage'))

export const adminRoutePreloadMap: Record<string, (() => void) | undefined> = {
  '/admin': () => ResourceManagementPage.preload(),
  '/admin/resources': () => ResourceManagementPage.preload(),
  '/admin/dashboard': () => DashboardPage.preload(),
  '/admin/account': () => AccountSettingsPage.preload(),
  '/admin/data': () => DataManagementPage.preload(),
  '/admin/homepage-settings': () => HomepageSettingsPage.preload(),
  '/admin/site-settings': () => SiteSettingsPage.preload(),
}
