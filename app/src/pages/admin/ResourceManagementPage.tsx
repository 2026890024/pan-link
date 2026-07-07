import { useState, useRef } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Star,
  Pin,
  Copy,
  Check,
  ExternalLink,
  Search,
  FolderOpen,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  List,
  Grid,
  HardDrive,
  Upload,
  EyeOff,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'
import ConfirmDialog from '@/components/ConfirmDialog'
import toast from 'react-hot-toast'

export default function ResourceManagementPage() {
  // 使用持久化 store
  const {
    categories,
    links,
    subCategories,
    driveTypes,
    cloudSyncError,
    lastSyncErrorDetail,
    addCategory,
    updateCategory,
    deleteCategory,
    addLink,
    updateLink,
    deleteLink,
    togglePin,
    toggleFeatured,
    toggleLinkVisibility,
    moveLinkSortOrder,
    addSubCategory,
    updateSubCategory,
    deleteSubCategory,
    moveSubCategorySortOrder,
  } = useDataStore()

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 确认对话框
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string; message: string; variant: 'danger' | 'warning' | 'info'; onConfirm: () => void
  }>({ title: '', message: '', variant: 'danger', onConfirm: () => {} })

  // 分类编辑
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // 子分类编辑
  const [editingSubCategoryId, setEditingSubCategoryId] = useState<string | null>(null)
  const [editSubCategoryName, setEditSubCategoryName] = useState('')
  const [isAddingSubCategory, setIsAddingSubCategory] = useState(false)
  const [newSubCategoryName, setNewSubCategoryName] = useState('')
  const [newSubCategoryParentId, setNewSubCategoryParentId] = useState<string>('')

  // 链接表单弹窗
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkModalMode, setLinkModalMode] = useState<'add' | 'edit'>('add')
  const [formLink, setFormLink] = useState({
    id: '', title: '', url: '', description: '', category_id: '', subcategory_id: '',
    drive_type: 'baidu', slug: '', icon: '', extract_code: '', expires_at: '',
    keywords: '', is_pinned: false, is_featured: false,
  })
  const [formLinkIcon, setFormLinkIcon] = useState('')
  const formFileInputRef = useRef<HTMLInputElement>(null)

  const openAddModal = () => {
    setFormLink({ id: '', title: '', url: '', description: '', category_id: selectedCategoryId || categories[0]?.id || '', subcategory_id: '', drive_type: 'baidu', slug: '', icon: '', extract_code: '', expires_at: '', keywords: '', is_pinned: false, is_featured: false })
    setFormLinkIcon('')
    setLinkModalMode('add')
    setLinkModalOpen(true)
  }

  const openEditModal = (link: LinkItem) => {
    setFormLink({
      id: link.id, title: link.title, url: link.url,
      description: link.description || '', category_id: link.category_id,
      subcategory_id: link.subcategory_id || '', drive_type: link.drive_type,
      slug: link.slug || '', icon: link.icon || '',
      extract_code: link.extract_code || '', expires_at: link.expires_at || '',
      keywords: link.keywords?.join(', ') || '',
      is_pinned: link.is_pinned || false,
      is_featured: link.is_featured || false,
    })
    setFormLinkIcon(link.icon || '')
    setLinkModalMode('edit')
    setLinkModalOpen(true)
  }

  // 切换分类展开/收起
  const toggleExpand = (id: string) => {
    setExpandedCategories((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  // 获取当前分类的链接数量
  const getCategoryLinkCount = (categoryId: string) => {
    return links.filter((l) => l.category_id === categoryId).length
  }

  // 获取过滤后的链接（按 sort_order 排序）
  const getFilteredLinks = () => {
    return links
      .filter((link) => {
        const matchesCategory = !selectedCategoryId || link.category_id === selectedCategoryId
        const matchesSearch =
          !searchQuery ||
          link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.keywords?.some(kw => kw.toLowerCase().includes(searchQuery.toLowerCase()))
        return matchesCategory && matchesSearch
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  // 获取分类的子分类
  const getCategorySubCategories = (categoryId: string) => {
    return subCategories.filter((sc) => sc.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  // 获取链接的显示图标
  const getLinkDisplayIcon = (link: LinkItem) => <LinkIcon link={link} size="md" />

  // 图标上传（弹窗用）
  const handleFormIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('请上传图片文件'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('图片大小不能超过 2MB'); return }
    const reader = new FileReader()
    reader.onload = (e) => setFormLinkIcon(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const removeFormIcon = () => {
    setFormLinkIcon('')
    if (formFileInputRef.current) formFileInputRef.current.value = ''
  }

  // 复制
  const copyToClipboard = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // fallback
    }
  }

  // ===== 分类操作 =====
  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim())
      setNewCategoryName('')
      setIsAddingCategory(false)
      toast.success('分类已添加')
    }
  }

  const handleSaveCategory = () => {
    if (editingCategoryId && editCategoryName.trim()) {
      updateCategory(editingCategoryId, { name: editCategoryName.trim() })
      setEditingCategoryId(null)
      toast.success('分类已更新')
    }
  }

  const handleDeleteCategory = (id: string) => {
    if (confirm('确定删除该分类吗？该分类下的链接将变为未分类状态，不会被删除。')) {
      deleteCategory(id)
      if (selectedCategoryId === id) setSelectedCategoryId(null)
      toast.success('分类已删除，关联链接已移至未分类')
    }
  }

  // ===== 子分类操作 =====
  const handleAddSubCategory = () => {
    if (newSubCategoryName.trim() && newSubCategoryParentId) {
      addSubCategory(newSubCategoryParentId, newSubCategoryName.trim())
      setNewSubCategoryName('')
      setIsAddingSubCategory(false)
      setNewSubCategoryParentId('')
      toast.success('子分类已添加')
    }
  }

  const handleSaveSubCategory = () => {
    if (editingSubCategoryId && editSubCategoryName.trim()) {
      updateSubCategory(editingSubCategoryId, { name: editSubCategoryName.trim() })
      setEditingSubCategoryId(null)
      toast.success('子分类已更新')
    }
  }

  const handleDeleteSubCategory = (id: string) => {
    setConfirmConfig({
      title: '删除子分类',
      message: '确定删除该子分类吗？',
      variant: 'danger',
      onConfirm: () => {
        deleteSubCategory(id)
        toast.success('子分类已删除')
      },
    })
    setConfirmOpen(true)
  }

  const handleAddLink = () => {
    if (formLink.title.trim() && formLink.url.trim()) {
      const targetCategoryId = formLink.category_id || categories[0]?.id || ''
      addLink({
        name: formLink.title.trim(),
        title: formLink.title.trim(),
        description: formLink.description,
        url: formLink.url.trim(),
        drive_type: formLink.drive_type,
        category_id: targetCategoryId,
        category_name: categories.find(c => c.id === targetCategoryId)?.name,
        subcategory_id: formLink.subcategory_id || '',
        icon: formLinkIcon || '',
        slug: formLink.slug || formLink.title.slice(0, 10).replace(/\s/g, '-').toLowerCase(),
        extract_code: formLink.extract_code,
        expires_at: formLink.expires_at || null,
        is_pinned: formLink.is_pinned,
        is_featured: formLink.is_featured,
        tags: [],
        keywords: formLink.keywords ? formLink.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
        category_logo: '',
      })
      setLinkModalOpen(false)
      toast.success('链接已添加')
    }
  }

  const handleEdit = () => {
    if (formLink.id && formLink.title.trim() && formLink.url.trim()) {
      updateLink(formLink.id, {
        name: formLink.title.trim(),
        title: formLink.title.trim(),
        description: formLink.description,
        url: formLink.url.trim(),
        category_id: formLink.category_id,
        category_name: categories.find(c => c.id === formLink.category_id)?.name,
        subcategory_id: formLink.subcategory_id,
        drive_type: formLink.drive_type,
        slug: formLink.slug,
        icon: formLinkIcon || '',
        extract_code: formLink.extract_code,
        expires_at: formLink.expires_at || null,
        keywords: formLink.keywords ? formLink.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
        is_pinned: formLink.is_pinned,
        is_featured: formLink.is_featured,
      })
      setLinkModalOpen(false)
      toast.success('链接已更新')
    }
  }

  const handleToggleVisibility = (link: LinkItem) => {
    const action = link.visible !== false ? '隐藏' : '显示'
    setConfirmConfig({
      title: `${action}链接`,
      message: link.visible !== false
        ? `确定隐藏「${link.title}」吗？隐藏后用户在前台将看不到该链接。`
        : `确定显示「${link.title}」吗？`,
      variant: 'warning',
      onConfirm: () => {
        toggleLinkVisibility(link.id)
        toast.success(`链接已${action}`)
      },
    })
    setConfirmOpen(true)
  }

  const handleDeleteLink = (id: string) => {
    setConfirmConfig({
      title: '删除链接',
      message: '确定删除该链接吗？此操作不可撤销。',
      variant: 'danger',
      onConfirm: () => {
        deleteLink(id)
        toast.success('链接已删除')
      },
    })
    setConfirmOpen(true)
  }

  const filteredLinks = getFilteredLinks()

  return (
    <div className="p-4 sm:p-6">
      {/* 云同步警告 */}
      {cloudSyncError && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-800">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">云同步不可用</p>
            <p className="text-amber-700 mt-1">
              数据当前仅保存在本地浏览器中，换设备后可能丢失。
              <a href="https://supabase.com/dashboard/project/kcucxrunwzcxxwxwnpojoc/sql/new" target="_blank" className="underline text-blue-600 ml-1">打开 Supabase 修复</a>
            </p>
            {/* 精确错误详情 - 帮助诊断 */}
            {lastSyncErrorDetail && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-red-700 hover:text-red-800">🔍 查看错误详情（点击展开）</summary>
                <pre className="mt-1 text-xs bg-red-50 border border-red-200 p-2 rounded overflow-x-auto text-red-900 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {lastSyncErrorDetail}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">资源管理</h1>
          <p className="text-gray-500 mt-1">统一管理分类与链接</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium">
            <Plus className="w-5 h-5" /> 添加链接
          </button>
          <button onClick={() => setIsAddingCategory(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
            <FolderOpen className="w-5 h-5" /> 添加分类
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧分类列表 */}
        <div className="w-full lg:w-72 flex-shrink-0">
          {isAddingCategory && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center gap-2">
                <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="分类名称" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
                <button onClick={handleAddCategory} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Save className="w-4 h-4" /></button>
                <button onClick={() => { setIsAddingCategory(false); setNewCategoryName('') }} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-medium text-gray-700 text-sm">分类列表</h3>
            </div>
            <button onClick={() => setSelectedCategoryId(null)}
              className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100 ${!selectedCategoryId ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}>
              <span className="font-medium">全部资源</span>
              <span className="text-sm opacity-60">{links.length}</span>
            </button>

            {categories.map((category) => {
              const isExpanded = expandedCategories.includes(category.id)
              const isSelected = selectedCategoryId === category.id
              const linkCount = getCategoryLinkCount(category.id)
              const categorySubCategories = getCategorySubCategories(category.id)

              return (
                <div key={category.id} className="border-b border-gray-100 last:border-0">
                  <div className={`flex items-center px-4 py-2 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                    <button onClick={() => toggleExpand(category.id)} className="p-1 hover:bg-gray-100 rounded">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {editingCategoryId === category.id ? (
                      <div className="flex-1 flex items-center gap-2 ml-1">
                        <input type="text" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-200 text-sm" autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCategory()} />
                        <button onClick={handleSaveCategory} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingCategoryId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { setSelectedCategoryId(category.id); toggleExpand(category.id) }}
                          className={`flex-1 flex items-center gap-2 ml-1 text-left ${isSelected ? 'text-blue-600' : 'text-gray-700'}`}>
                          <FolderOpen className="w-4 h-4" />
                          <span className="text-sm font-medium truncate">{category.name}</span>
                        </button>
                        <span className="text-xs text-gray-400 mx-2">{linkCount}</span>
                        <button onClick={() => { setEditingCategoryId(category.id); setEditCategoryName(category.name) }}
                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteCategory(category.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="pl-8 pr-4 pb-2">
                      {categorySubCategories.map((sc) => (
                        <div key={sc.id} className="flex items-center py-1 group/sc">
                          {editingSubCategoryId === sc.id ? (
                            <div className="flex-1 flex items-center gap-1">
                              <input type="text" value={editSubCategoryName} onChange={(e) => setEditSubCategoryName(e.target.value)}
                                className="flex-1 px-2 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-200" autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveSubCategory()} />
                              <button onClick={handleSaveSubCategory} className="p-0.5 text-green-600 hover:bg-green-50 rounded"><Save className="w-3 h-3" /></button>
                              <button onClick={() => setEditingSubCategoryId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col mr-1 opacity-0 group-hover/sc:opacity-100">
                                <button onClick={() => moveSubCategorySortOrder(sc.id, 'up', sc.category_id)}
                                  className="p-0 text-gray-400 hover:text-indigo-600 leading-none"><ChevronUp className="w-3 h-3" /></button>
                                <button onClick={() => moveSubCategorySortOrder(sc.id, 'down', sc.category_id)}
                                  className="p-0 text-gray-400 hover:text-indigo-600 leading-none"><ChevronDownIcon className="w-3 h-3" /></button>
                              </div>
                              <button onClick={() => setSelectedCategoryId(category.id)}
                                className="flex-1 text-left text-xs text-gray-600 hover:text-indigo-600 py-0.5">{sc.name}</button>
                              <button onClick={() => { setEditingSubCategoryId(sc.id); setEditSubCategoryName(sc.name) }}
                                className="p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover/sc:opacity-100"><Edit2 className="w-3 h-3" /></button>
                              <button onClick={() => handleDeleteSubCategory(sc.id)}
                                className="p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover/sc:opacity-100"><Trash2 className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>
                      ))}
                      {isAddingSubCategory && newSubCategoryParentId === category.id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input type="text" value={newSubCategoryName} onChange={(e) => setNewSubCategoryName(e.target.value)}
                            placeholder="子分类名称" className="flex-1 px-2 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-200" autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSubCategory()} />
                          <button onClick={handleAddSubCategory} className="p-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"><Save className="w-3 h-3" /></button>
                          <button onClick={() => { setIsAddingSubCategory(false); setNewSubCategoryName(''); setNewSubCategoryParentId('') }}
                            className="p-0.5 border border-gray-200 rounded hover:bg-gray-50"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setIsAddingSubCategory(true); setNewSubCategoryParentId(category.id) }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 py-1 mt-1">+ 添加子分类</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧链接列表 */}
        <div className="flex-1">
          {/* 搜索和视图切换 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索链接..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setViewMode('list')} className={`p-2.5 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><List className="w-5 h-5" /></button>
                <button onClick={() => setViewMode('grid')} className={`p-2.5 ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><Grid className="w-5 h-5" /></button>
              </div>
            </div>
          </div>

          {/* 链接列表/网格 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            {viewMode === 'list' && (
              <div className="grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500 items-center min-w-[900px]">
                <div className="col-span-5">链接信息</div>
                <div className="col-span-2">分类</div>
                <div className="col-span-2">网盘</div>
                <div className="col-span-1 text-center">排序</div>
                <div className="col-span-2">操作</div>
              </div>
            )}

            {filteredLinks.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无链接</p>
              </div>
            ) : viewMode === 'list' ? (
              filteredLinks.map((link) => (
                <div key={link.id} className={`grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center min-w-[900px] ${!link.visible ? 'opacity-60 bg-gray-50/50' : ''}`}>
                  <div className="col-span-5">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => openEditModal(link)}>
                      {getLinkDisplayIcon(link)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 truncate">{link.title}</h3>
                          {link.is_pinned && <Pin className="w-4 h-4 text-amber-500" />}
                          {link.is_featured && <Star className="w-4 h-4 text-amber-500" />}
                          {!link.visible && <EyeOff className="w-4 h-4 text-gray-400" />}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{link.description || '暂无描述'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">{categories.find((c) => c.id === link.category_id)?.name || '未分类'}</span>
                    {link.subcategory_id && <span className="ml-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded">{subCategories.find((sc) => sc.id === link.subcategory_id)?.name}</span>}
                  </div>
                  <div className="col-span-2"><span className="text-sm text-gray-600">{driveTypes.find((d) => d.id === link.drive_type)?.name || link.drive_type}</span></div>
                  <div className="col-span-1">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLinkSortOrder(link.id, 'up', selectedCategoryId || undefined) }}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="上移"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLinkSortOrder(link.id, 'down', selectedCategoryId || undefined) }}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="下移"
                      >
                        <ChevronDownIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(link.url, link.id) }}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      {copiedId === link.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex" onClick={(e) => e.stopPropagation()}><ExternalLink className="w-4 h-4" /></a>
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(link) }} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); togglePin(link.id) }}
                      className={`p-2 rounded-lg transition-colors ${link.is_pinned ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}><Pin className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); toggleFeatured(link.id) }}
                      className={`p-2 rounded-lg transition-colors ${link.is_featured ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}><Star className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleToggleVisibility(link) }}
                      className={`p-2 rounded-lg transition-colors ${!link.visible ? 'text-red-400 bg-red-50' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                      title={link.visible ? '隐藏' : '显示'}
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteLink(link.id) }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLinks.map((link) => (
                  <div key={link.id} className={`border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer ${!link.visible ? 'opacity-60 bg-gray-50/50' : ''}`} onClick={() => openEditModal(link)}>
                    <div className="flex items-start gap-3 mb-3">
                      {getLinkDisplayIcon(link)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <h3 className="font-medium text-gray-900 truncate text-sm">{link.title}</h3>
                          {link.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          {link.is_featured && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          {!link.visible && <EyeOff className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{link.description || '暂无描述'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{categories.find((c) => c.id === link.category_id)?.name || '未分类'}</span>
                      {link.subcategory_id && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded">{subCategories.find((sc) => sc.id === link.subcategory_id)?.name}</span>}
                    </div>
                      <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); moveLinkSortOrder(link.id, 'up', selectedCategoryId || undefined) }}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="上移">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveLinkSortOrder(link.id, 'down', selectedCategoryId || undefined) }}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="下移">
                          <ChevronDownIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(link.url, link.id) }}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                          {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(link) }} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); togglePin(link.id) }}
                          className={`p-1.5 rounded transition-colors ${link.is_pinned ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-amber-500'}`}><Pin className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleToggleVisibility(link) }}
                          className={`p-1.5 rounded transition-colors ${!link.visible ? 'text-red-400 bg-red-50' : 'text-gray-400 hover:text-orange-500'}`}
                          title={link.visible ? '隐藏' : '显示'}>
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteLink(link.id) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant={confirmConfig.variant}
        onConfirm={() => {
          confirmConfig.onConfirm()
          setConfirmOpen(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* 链接添加/编辑弹窗 */}
      {linkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLinkModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{linkModalMode === 'add' ? '添加链接' : '编辑链接'}</h2>
              <button onClick={() => setLinkModalOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
                  <input type="text" value={formLink.title} onChange={(e) => setFormLink({ ...formLink, title: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="资源名称" autoFocus={linkModalMode === 'add'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">链接 *</label>
                  <input type="url" value={formLink.url} onChange={(e) => setFormLink({ ...formLink, url: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <input type="text" value={formLink.description} onChange={(e) => setFormLink({ ...formLink, description: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="简短描述" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                  <select value={formLink.category_id} onChange={(e) => setFormLink({ ...formLink, category_id: e.target.value, subcategory_id: '' })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm">
                    <option value="">请选择分类</option>
                    {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">子分类</label>
                  <select value={formLink.subcategory_id} onChange={(e) => setFormLink({ ...formLink, subcategory_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" disabled={!formLink.category_id}>
                    <option value="">无</option>
                    {formLink.category_id && getCategorySubCategories(formLink.category_id).map((sc) => (<option key={sc.id} value={sc.id}>{sc.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">网盘类型</label>
                  <select value={formLink.drive_type} onChange={(e) => setFormLink({ ...formLink, drive_type: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm">
                    {driveTypes.map((dt) => (<option key={dt.id} value={dt.id}>{dt.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">提取码</label>
                  <input type="text" value={formLink.extract_code} onChange={(e) => setFormLink({ ...formLink, extract_code: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="选填" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">过期时间</label>
                  <select value={formLink.expires_at ? (() => {
                    if (formLink.expires_at === 'permanent') return 'permanent'
                    const now = new Date(); const exp = new Date(formLink.expires_at)
                    const months = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
                    if (months <= 1) return '1m'; if (months <= 3) return '3m'; if (months <= 6) return '6m'; return ''
                  })() : ''}
                    onChange={(e) => {
                      const val = e.target.value; let expiresAt = ''
                      if (val === 'permanent') expiresAt = 'permanent'
                      else if (val) { const d = new Date(); d.setMonth(d.getMonth() + parseInt(val.replace('m', ''))); expiresAt = d.toISOString().split('T')[0] }
                      setFormLink({ ...formLink, expires_at: expiresAt })
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm">
                    <option value="">不设置</option><option value="1m">1个月</option><option value="3m">3个月</option><option value="6m">6个月</option><option value="permanent">永久</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug <span className="text-xs text-gray-400 font-normal ml-1">（URL标识符）</span></label>
                  <input type="text" value={formLink.slug} onChange={(e) => setFormLink({ ...formLink, slug: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="自定义链接标识" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">搜索关键词 <span className="text-xs text-gray-400 font-normal ml-1">（逗号分隔）</span></label>
                  <input type="text" value={formLink.keywords} onChange={(e) => setFormLink({ ...formLink, keywords: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 text-sm" placeholder="别名、缩写、常用搜索词" />
                </div>
              </div>
              {/* 精选/置顶开关 */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formLink.is_featured}
                    onChange={(e) => setFormLink({ ...formLink, is_featured: e.target.checked })}
                    className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500" /> 精选推荐
                  </span>
                  <span className="text-xs text-gray-400">在首页精选区域展示</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formLink.is_pinned}
                    onChange={(e) => setFormLink({ ...formLink, is_pinned: e.target.checked })}
                    className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Pin className="w-4 h-4 text-amber-500" /> 置顶
                  </span>
                  <span className="text-xs text-gray-400">在列表顶部显示</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">软件图标</label>
                <div className="flex items-center gap-4">
                  {formLinkIcon && <img src={formLinkIcon} alt="预览" className="w-14 h-14 rounded-lg object-cover border-2 border-gray-200" />}
                  <div className="flex-1">
                    <input type="file" ref={formFileInputRef} onChange={handleFormIconUpload} accept="image/*" className="hidden" id="modal-icon-upload" />
                    <label htmlFor="modal-icon-upload" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer text-sm text-gray-600 transition-colors">
                      <Upload className="w-4 h-4" />{formLinkIcon ? '更换图标' : '上传图标'}
                    </label>
                    {formLinkIcon && <button onClick={removeFormIcon} className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X className="w-4 h-4" /></button>}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG 格式，大小不超过 2MB</p>
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50/80 backdrop-blur-sm border-t border-gray-100 px-6 py-4 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setLinkModalOpen(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-100 font-medium transition-colors">取消</button>
              {linkModalMode === 'add' ? (
                <button onClick={handleAddLink} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors">添加</button>
              ) : (
                <button onClick={handleEdit} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors">保存修改</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
