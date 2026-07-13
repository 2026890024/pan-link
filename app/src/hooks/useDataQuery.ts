/**
 * React Query Hooks - 数据查询与缓存
 * 提供统一的 hooks 接口，内部自动判断使用 D1 API 还是 localStorage
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as ds from '@/services/dataService'

// ============ Query Keys ============
export const queryKeys = {
  categories: ['categories'] as const,
  links: ['links'] as const,
  publicLinks: ['links', 'public'] as const,
  tags: ['tags'] as const,
  subCategories: ['subCategories'] as const,
  driveTypes: ['driveTypes'] as const,
  dashboardStats: ['dashboardStats'] as const,
}

// ============ Categories ============

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ds.fetchCategories,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => ds.createCategory(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories })
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.deleteCategoryApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories })
      qc.invalidateQueries({ queryKey: queryKeys.links })
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { name?: string; sort_order?: number } }) =>
      ds.updateCategoryApi(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories })
    },
  })
}

// ============ Links ============

export function useLinks() {
  return useQuery({
    queryKey: queryKeys.links,
    queryFn: ds.fetchLinks,
    staleTime: 30 * 1000,
  })
}

export function usePublicLinks() {
  return useQuery({
    queryKey: queryKeys.publicLinks,
    queryFn: ds.fetchPublicLinks,
    staleTime: 60 * 1000,
  })
}

export function useCreateLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ds.createLinkApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.links })
      qc.invalidateQueries({ queryKey: queryKeys.publicLinks })
      qc.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}

export function useUpdateLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      ds.updateLinkApi(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.links })
      qc.invalidateQueries({ queryKey: queryKeys.publicLinks })
    },
  })
}

export function useDeleteLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.deleteLinkApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.links })
      qc.invalidateQueries({ queryKey: queryKeys.publicLinks })
      qc.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
  })
}

export function useIncrementClicks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.incrementLinkClicks(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.links })
      qc.invalidateQueries({ queryKey: queryKeys.publicLinks })
    },
  })
}

// ============ Tags ============

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => ds.fetchTags(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => ds.createTagApi(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags })
    },
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.deleteTagApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags })
      qc.invalidateQueries({ queryKey: queryKeys.links })
    },
  })
}

// ============ SubCategories ============

export function useSubCategories() {
  return useQuery({
    queryKey: queryKeys.subCategories,
    queryFn: ds.fetchSubCategories,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddSubCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      ds.addSubCategoryApi(categoryId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.subCategories })
    },
  })
}

export function useDeleteSubCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.deleteSubCategoryApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.subCategories })
      qc.invalidateQueries({ queryKey: queryKeys.links })
    },
  })
}

// ============ DriveTypes ============

export function useDriveTypes() {
  return useQuery({
    queryKey: queryKeys.driveTypes,
    queryFn: ds.fetchDriveTypes,
    staleTime: Infinity,
  })
}

export function useAddDriveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, icon, color }: { name: string; icon: string; color: string }) =>
      ds.addDriveTypeApi(name, icon, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driveTypes }),
  })
}

export function useDeleteDriveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ds.deleteDriveTypeApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driveTypes }),
  })
}

// ============ Dashboard ============

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => ds.fetchDashboardStats(),
    staleTime: 30 * 1000,
  })
}
