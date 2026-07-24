import { lazyWithPreload } from '@/utils/lazyWithPreload'

export const DashboardPage = lazyWithPreload(() => import('./DashboardPage'))
export const ResourceManagementPage = lazyWithPreload(() => import('./ResourceManagementPage'))
export const AccountSettingsPage = lazyWithPreload(() => import('./AccountSettingsPage'))
export const DataManagementPage = lazyWithPreload(() => import('./DataManagementPage'))

export const adminRoutePreloadMap: Record<string, (() => void) | undefined> = {
  '/admin/resources': () => ResourceManagementPage.preload(),
  '/admin/dashboard': () => DashboardPage.preload(),
  '/admin/account': () => AccountSettingsPage.preload(),
  '/admin/data': () => DataManagementPage.preload(),
}
