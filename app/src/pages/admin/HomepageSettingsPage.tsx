import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GripVertical,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDataStore } from '@/store/useDataStore'

// 首页分类可见性配置存储在 localStorage
const STORAGE_KEY = 'homepage_category_visibility'
type VisibilityMap = Record<string, boolean>

function loadVisibility(): VisibilityMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function saveVisibility(map: VisibilityMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export default function HomepageSettingsPage() {
  const { categories, updateCategory } = useDataStore()
  const [visibility, setVisibility] = useState<VisibilityMap>(loadVisibility)
  const [showFeatured, setShowFeatured] = useState(
    localStorage.getItem('homepage_show_featured') !== 'false'
  )

  // 合并 visibility 与 Store 数据，按 sort_order 排序
  const displayCategories = useMemo(() => {
    return [...categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({
        ...c,
        is_visible: visibility[c.id] !== false, // 默认可见
      }))
  }, [categories, visibility])

  const toggleFeatured = () => {
    const newValue = !showFeatured
    setShowFeatured(newValue)
    localStorage.setItem('homepage_show_featured', String(newValue))
    toast.success(newValue ? '精选推荐已开启' : '精选推荐已关闭')
  }

  const toggleVisibility = (id: string) => {
    const updated = { ...visibility, [id]: !visibility[id] !== false }
    setVisibility(updated)
    saveVisibility(updated)
    toast.success(updated[id] ? '分类已设为可见' : '分类已隐藏')
  }

  const updateSortOrder = async (id: string, direction: 'up' | 'down') => {
    const sorted = [...displayCategories]
    const index = sorted.findIndex(c => c.id === id)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= sorted.length) return

    const currentSort = sorted[index].sort_order
    const targetSort = sorted[newIndex].sort_order

    // 交换 sort_order
    await Promise.all([
      updateCategory(id, { sort_order: targetSort }),
      updateCategory(sorted[newIndex].id, { sort_order: currentSort }),
    ])
    toast.success('排序已更新')
  }

  const updateName = async (id: string, name: string) => {
    if (!name.trim()) return
    await updateCategory(id, { name: name.trim() })
  }

  const removeCategory = (id: string) => {
    // 隐藏该分类（不删除，仅从首页隐藏）
    const updated = { ...visibility, [id]: false }
    setVisibility(updated)
    saveVisibility(updated)
    toast.success('分类已从首页隐藏（可在分类管理中彻底删除）')
  }

  const visibleCount = displayCategories.filter(c => c.is_visible).length

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">首页设置</h1>
          <p className="text-gray-500 mt-1">管理首页显示的分类按钮</p>
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
            首页将显示 <span className="font-bold">{visibleCount}</span> 个分类按钮（最多建议 6-8 个）。
            上下移动调整显示顺序，点击眼睛切换显示/隐藏。
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

      {/* 分类列表 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">分类按钮管理</h3>
          <span className="text-xs text-gray-400">在「分类管理」中添加/删除分类</span>
        </div>

        {displayCategories.length === 0 ? (
          <p className="px-6 py-8 text-center text-gray-400">暂无分类，请先在「分类管理」中创建分类</p>
        ) : (
          <div className="divide-y">
            {displayCategories.map((cat, index) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`px-6 py-4 flex items-center gap-4 ${
                cat.is_visible ? 'bg-white' : 'bg-gray-50/50'
              }`}
            >
              <GripVertical className="w-5 h-5 text-gray-300" />

              <button
                onClick={() => toggleVisibility(cat.id)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  cat.is_visible
                    ? 'bg-green-50 text-green-600 hover:bg-green-100'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                title={cat.is_visible ? '点击隐藏' : '点击显示'}
              >
                {cat.is_visible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>

              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => updateSortOrder(cat.id, 'up')}
                  disabled={index === 0}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  onClick={() => updateSortOrder(cat.id, 'down')}
                  disabled={index === displayCategories.length - 1}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↓
                </button>
              </div>

              <input
                type="text"
                value={cat.name}
                onChange={(e) => updateName(cat.id, e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all text-sm"
              />

              <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                cat.is_visible
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {cat.is_visible ? '显示中' : '已隐藏'}
              </span>

              <button
                onClick={() => removeCategory(cat.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                title="从首页隐藏"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </motion.div>
          ))}
        </div>
        )}
      </div>

      {/* 预览区域 */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-4">首页预览</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {displayCategories
            .filter(c => c.is_visible)
            .slice(0, 8)
            .map(cat => (
              <span
                key={cat.id}
                className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-full font-medium shadow-md shadow-indigo-200/40"
              >
                {cat.name}
              </span>
            ))}
        </div>
        {visibleCount === 0 && (
          <p className="text-center text-gray-400 py-4">暂无显示的分类</p>
        )}
      </div>
    </div>
  )
}
