import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  Tag,
  Plus,
  X,
  Settings,
  Shield,
} from 'lucide-react'
import { useDataStore } from '@/store/useDataStore'
import { hexToRgba } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { tags, addTag, deleteTag } = useDataStore()

  const savedProfile = (() => {
    try {
      const raw = localStorage.getItem('admin_profile')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { username: 'Admin', email: 'admin@example.com', avatar: null }
  })()

  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366F1')

  const colorOptions = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'
  ]

  const handleAddTag = () => {
    if (!newTagName.trim()) {
      toast.error('请输入标签名称')
      return
    }
    addTag(newTagName, newTagColor)
    setNewTagName('')
    setNewTagColor('#6366F1')
    setShowAddTag(false)
    toast.success('标签已添加')
  }

  const handleDeleteTag = (id: string) => {
    deleteTag(id)
    toast.success('标签已删除')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>
        <p className="text-gray-500 mt-1">管理标签和账号设置入口</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 侧边栏 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:w-64 flex-shrink-0"
        >
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* 用户信息卡片 */}
            <div className="p-6 text-center border-b">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold mb-3 overflow-hidden">
                {savedProfile.avatar ? (
                  <img src={savedProfile.avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  savedProfile.username.charAt(0).toUpperCase()
                )}
              </div>
              <h3 className="font-semibold text-gray-800">{savedProfile.username}</h3>
              <p className="text-sm text-gray-500 mt-1">{savedProfile.email}</p>
            </div>

            {/* 快捷链接 */}
            <div className="p-3 space-y-1">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">快捷入口</div>
              <Link
                to="/admin/account"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <User className="w-5 h-5" />
                <span className="text-sm">账户设置</span>
              </Link>
              <Link
                to="/admin/account"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Shield className="w-5 h-5" />
                <span className="text-sm">修改密码</span>
              </Link>
              <Link
                to="/admin/resources"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-5 h-5" />
                <span className="text-sm">分类管理</span>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 内容区 - 标签管理 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1"
        >
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-500" />
                标签管理
              </h2>
              <button
                onClick={() => setShowAddTag(true)}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center gap-2 text-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                添加标签
              </button>
            </div>

            {/* 添加标签表单 */}
            {showAddTag && (
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                <div className="space-y-4">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="标签名称"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      标签颜色
                    </label>
                    <div className="flex items-center gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            newTagColor === color ? 'border-gray-800 scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm transition-colors cursor-pointer"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setShowAddTag(false)}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 标签列表 */}
            {tags.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无标签，点击上方按钮添加</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-full transition-transform hover:scale-105"
                    style={{ backgroundColor: hexToRgba(tag.color, 0.12) }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm font-medium" style={{ color: tag.color }}>{tag.name}</span>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="ml-1 hover:bg-white/50 rounded-full p-0.5 transition-colors cursor-pointer"
                      title="删除标签"
                    >
                      <X className="w-3 h-3" style={{ color: tag.color }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
