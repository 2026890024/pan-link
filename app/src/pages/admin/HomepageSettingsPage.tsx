import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GripVertical,
  Eye,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDataStore } from '@/store/useDataStore'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import * as ds from '@/services/dataService'

// 首页分类可见性配置存储在 localStorage（向后兼容），同时同步到云 site_settings
const CAT_VIS_KEY = 'homepage_category_visibility'
const SUB_VIS_KEY = 'homepage_subcategory_visibility'
const FEATURED_KEY = 'homepage_show_featured'
type VisibilityMap = Record<string, boolean>

function loadVisibility(key: string): VisibilityMap {
  // 优从云端缓存读取，回退到 localStorage
  const storeVal = (useSiteSettingsStore.getState().settings as Record<string, unknown>)[key]
  if (typeof storeVal === 'string') {
    try { return JSON.parse(storeVal) } catch { /* fall through */ }
  }
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')
  } catch { return {} }
}

function saveVisibility(key: string, map: VisibilityMap) {
  localStorage.setItem(key, JSON.stringify(map))
}

function syncVisibilityToCloud(key: string, map: VisibilityMap) {
  ds.updateSiteSettings({ [key]: JSON.stringify(map) } as Record<string, string>).catch(err => console.error('可见性云端同步失败:', err))
}

function getShowFeaturedInitial(): boolean {
  const storeVal = (useSiteSettingsStore.getState().settings as Record<string, unknown>)[FEATURED_KEY]
  if (storeVal !== undefined) {return storeVal !== 'false'}
  return localStorage.getItem(FEATURED_KEY) !== 'false'
}

export default function HomepageSettingsPage() {
  const { categories, updateCategory, subCategories } = useDataStore()
  const [catVisibility, setCatVisibility] = useState<VisibilityMap>(() => loadVisibility(CAT_VIS_KEY))
  const [subVisibility, setSubVisibility] = useState<VisibilityMap>(() => loadVisibility(SUB_VIS_KEY))
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showFeatured, setShowFeatured] = useState(getShowFeaturedInitial)

  // 合并 visibility 与 Store 数据，按 sort_order 排序
  const displayCategories = useMemo(() => {
    return [...categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({
        ...c,
        is_visible: catVisibility[c.id] !== false,
        subCategories: subCategories
          .filter(sc => sc.category_id === c.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(sc => ({
            ...sc,
            is_visible: subVisibility[sc.id] !== false,
          })),
      }))
  }, [categories, subCategories, catVisibility, subVisibility])

  const toggleFeatured = () => {
    const newValue = !showFeatured
    setShowFeatured(newValue)
    localStorage.setItem(FEATURED_KEY, String(newValue))
    ds.updateSiteSettings({ [FEATURED_KEY]: String(newValue) } as Record<string, string>).catch(err => console.error('精选推荐设置同步失败:', err))
    toast.success(newValue ? '精选推荐已开启' : '精选推荐已关闭')
  }

  const toggleCatVisibility = (id: string) => {
    const updated = { ...catVisibility, [id]: !catVisibility[id] !== false }
    setCatVisibility(updated)
    saveVisibility(CAT_VIS_KEY, updated)
    syncVisibilityToCloud(CAT_VIS_KEY, updated)
    toast.success(updated[id] ? '分类已设为可见' : '分类已隐藏')
  }

  const toggleSubVisibility = (id: string) => {
    const updated = { ...subVisibility, [id]: !subVisibility[id] !== false }
    setSubVisibility(updated)
    saveVisibility(SUB_VIS_KEY, updated)
    syncVisibilityToCloud(SUB_VIS_KEY, updated)
    toast.success(updated[id] ? '子分类已设为可见' : '子分类已隐藏')
  }

  const toggleSubAllVisibility = (categoryId: string, visible: boolean) => {
    const subs = subCategories.filter(sc => sc.category_id === categoryId)
    const updated = { ...subVisibility }
    subs.forEach(sc => { updated[sc.id] = visible })
    setSubVisibility(updated)
    saveVisibility(SUB_VIS_KEY, updated)
    syncVisibilityToCloud(SUB_VIS_KEY, updated)
    toast.success(visible ? '所有子分类已显示' : '所有子分类已隐藏')
  }

  const updateSortOrder = async (id: string, direction: 'up' | 'down') => {
    const sorted = [...displayCategories]
    const index = sorted.findIndex(c => c.id === id)
    if (index === -1) {return}

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= sorted.length) {return}

    const currentSort = sorted[index].sort_order
    const targetSort = sorted[newIndex].sort_order

    // 如果相邻项 sort_order 相同或存在重复，先规范化所有大分类
    const hasDuplicate = new Set(sorted.map(c => c.sort_order)).size !== sorted.length
    if (hasDuplicate || currentSort === targetSort) {
      const normalized = sorted.map((c, idx) => ({ ...c, sort_order: (idx + 1) * 10 }))
      await Promise.all(normalized.map(c => updateCategory(c.id, { sort_order: c.sort_order })))
      toast.success('排序已规范化')
      return
    }

    await Promise.all([
      updateCategory(id, { sort_order: targetSort }),
      updateCategory(sorted[newIndex].id, { sort_order: currentSort }),
    ])
    toast.success('排序已更新')
  }

  const visibleCatCount = displayCategories.filter(c => c.is_visible).length
  // 计算实际可见数
  let actualVisibleSubs = 0
  displayCategories.forEach(c => {
    if (c.is_visible) {
      actualVisibleSubs += c.subCategories.filter(sc => sc.is_visible).length
    }
  })

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">首页设置</h1>
          <p className="text-gray-500 mt-1">管理首页的快速搜索模块和分类显示</p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <div className="p-1.5 bg-blue-100 rounded-lg flex-shrink-0">
          <Eye className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm text-blue-800 font-medium">配置说明</p>
          <p className="text-sm text-blue-600 mt-1">
            首页将显示 <span className="font-bold">{visibleCatCount}</span> 个大分类和 <span className="font-bold">{actualVisibleSubs}</span> 个子分类。
            点击眼睛图标切换显示/隐藏，展开分类可管理子分类可见性。
          </p>
        </div>
      </div>

      {/* 精选推荐设置 */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">精选推荐</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                控制首页「精选推荐」区域的显示。关闭后已设为精选的资源不会在首页展示，但精选标记仍保留。
              </p>
            </div>
          </div>
          <button
            onClick={toggleFeatured}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer ${
              showFeatured ? 'bg-amber-500' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={showFeatured}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                showFeatured ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 分类 + 子分类管理 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">快速搜索模块管理</h3>
          <span className="text-xs text-gray-400">在「分类管理」中添加/删除分类</span>
        </div>

        {displayCategories.length === 0 ? (
          <p className="px-6 py-8 text-center text-gray-400">暂无分类，请先在「分类管理」中创建分类</p>
        ) : (
          <div className="divide-y">
            {displayCategories.map((cat, index) => {
              const isExpanded = expandedCategories.has(cat.id)
              const hasSubs = cat.subCategories.length > 0
              return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {/* 大分类行 */}
              <div className={`px-6 py-4 flex items-center gap-3 ${cat.is_visible ? 'bg-white' : 'bg-gray-50/50'}`}>
                <GripVertical className="w-5 h-5 text-gray-300" />

                <button
                  onClick={() => toggleCatVisibility(cat.id)}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    cat.is_visible
                      ? 'bg-green-50 text-green-600 hover:bg-green-100'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                  title={cat.is_visible ? '点击隐藏大分类' : '点击显示大分类'}
                >
                  {cat.is_visible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>

                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => updateSortOrder(cat.id, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => updateSortOrder(cat.id, 'down')}
                    disabled={index === displayCategories.length - 1}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                  >
                    ↓
                  </button>
                </div>

                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    cat.is_visible
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {cat.is_visible ? '显示' : '隐藏'}
                  </span>
                  {hasSubs && (
                    <span className="text-xs text-gray-400">
                      {cat.subCategories.filter(sc => sc.is_visible).length}/{cat.subCategories.length} 子分类可见
                    </span>
                  )}
                </div>

                {/* 展开子分类按钮 */}
                {hasSubs && (
                  <button
                    onClick={() => {
                      const updated = new Set(expandedCategories)
                      if (isExpanded) {updated.delete(cat.id)}
                      else {updated.add(cat.id)}
                      setExpandedCategories(updated)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title={isExpanded ? '收起子分类' : '展开子分类'}
                  >
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                  </button>
                )}
              </div>

              {/* 子分类列表 */}
              {isExpanded && hasSubs && (
                <div className="bg-gray-50/30 border-t border-gray-100">
                  {/* 批量操作栏 */}
                  {cat.is_visible && (
                    <div className="px-6 py-2 flex items-center gap-3 border-b border-gray-100">
                      <span className="text-xs text-gray-400">子分类批量：</span>
                      <button
                        onClick={() => toggleSubAllVisibility(cat.id, true)}
                        className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded cursor-pointer"
                      >
                        全部显示
                      </button>
                      <button
                        onClick={() => toggleSubAllVisibility(cat.id, false)}
                        className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded cursor-pointer"
                      >
                        全部隐藏
                      </button>
                    </div>
                  )}
                  {cat.subCategories.map(sc => (
                    <div
                      key={sc.id}
                      className={`px-10 py-3 flex items-center gap-3 ${sc.is_visible ? 'bg-white' : 'bg-gray-100/50'}`}
                    >
                      <button
                        onClick={() => toggleSubVisibility(sc.id)}
                        className={`p-1.5 rounded-lg transition-all duration-200 ${
                          sc.is_visible
                            ? 'bg-green-50 text-green-600 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title={sc.is_visible ? '点击隐藏子分类' : '点击显示子分类'}
                      >
                        {sc.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <span className={`text-sm ${sc.is_visible ? 'text-gray-700' : 'text-gray-400'}`}>
                        {sc.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                        sc.is_visible
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {sc.is_visible ? '可见' : '隐藏'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
            )})}
          </div>
        )}
      </div>

      {/* 预览区域 */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-4">首页预览</h3>
        <div className="space-y-4">
          {/* 大分类预览 */}
          <div>
            <p className="text-xs text-gray-400 mb-2">快速搜索标签</p>
            <div className="flex items-center gap-2 flex-wrap">
              {displayCategories
                .filter(c => c.is_visible)
                .slice(0, 8)
                .map(cat => (
                  <span
                    key={cat.id}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-full font-medium shadow-md shadow-indigo-200/40"
                  >
                    {cat.name}
                  </span>
                ))}
              {visibleCatCount === 0 && (
                <span className="text-xs text-gray-400">无可见大分类</span>
              )}
            </div>
          </div>
          {/* 子分类预览 */}
          <div>
            <p className="text-xs text-gray-400 mb-2">侧边栏子分类</p>
            <div className="flex items-center gap-2 flex-wrap">
              {displayCategories
                .filter(c => c.is_visible)
                .flatMap(c => c.subCategories.filter(sc => sc.is_visible))
                .slice(0, 12)
                .map(sc => (
                  <span
                    key={sc.id}
                    className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-lg font-medium border border-indigo-100"
                  >
                    {sc.name}
                  </span>
                ))}
              {actualVisibleSubs === 0 && (
                <span className="text-xs text-gray-400">无可见子分类</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
