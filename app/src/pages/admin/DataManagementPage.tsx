import { useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  Upload,
  FileJson,
  Table,
  RefreshCw,
  Trash2,
  Plus,
  CheckCircle,
  Image,
  X,
  Search,
  Cloud,
  AlertTriangle,
  CloudOff,
  CheckSquare,
  Square,
  FolderOpen,
  ScrollText,
  Zap,
  Tag,
  HardDrive,
} from 'lucide-react'
import { useDataStore } from '@/store/useDataStore'
import { formatDate, hexToRgba } from '@/lib/utils'
import toast from 'react-hot-toast'

type ExportFormat = 'csv' | 'json'
type Tab = 'export' | 'import' | 'icon-library' | 'drive-types' | 'tags'
type DuplicateAction = 'skip' | 'overwrite' | 'keep_both'

interface ImportPreviewItem {
  name: string
  url: string
  extract_code?: string
  description?: string
  keywords?: string | string[]
  category_name?: string
  category_id?: string
  drive_type?: string
  is_featured?: boolean
  is_pinned?: boolean
  visible?: string | boolean
  expires_at?: string
  _duplicateType?: 'url' | 'name' | null
  _duplicateAction?: DuplicateAction
  _matchedLinkId?: string
  _matchedLinkName?: string
}

export default function DataManagementPage() {
  const { links, categories, addCategory, addLink, iconLibrary, addIconToLibrary, deleteIconFromLibrary, cloudSyncError, initialize, tags, addTag, deleteTag, driveTypes, addDriveType, deleteDriveType } = useDataStore()
  const [activeTab, setActiveTab] = useState<Tab>('export')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [exportMode, setExportMode] = useState<'all' | 'selected'>('all')
  const [selectedForExport, setSelectedForExport] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  // Export list filters
  const [exportSearch, setExportSearch] = useState('')
  const [exportCategoryFilter, setExportCategoryFilter] = useState('')
  const [exportListExpanded, setExportListExpanded] = useState(true)

  const [importPreview, setImportPreview] = useState<ImportPreviewItem[] | null>(null)
  const [importStats, setImportStats] = useState<{ createdCategories: string[]; matchedCategories: string[]; duplicatesSkipped: number; duplicatesOverwritten: number; errors: string[] } | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const iconFileInputRef = useRef<HTMLInputElement>(null)
  const [iconSearch, setIconSearch] = useState('')

  const tabs = [
    { id: 'export' as Tab, label: '数据导出', icon: Download, desc: 'CSV / JSON 格式导出' },
    { id: 'import' as Tab, label: '数据导入', icon: Upload, desc: '批量导入链接数据' },
    { id: 'icon-library' as Tab, label: '图标库', icon: Image, desc: '管理自定义图标' },
    { id: 'drive-types' as Tab, label: '网盘类型', icon: HardDrive, desc: '管理网盘类型' },
    { id: 'tags' as Tab, label: '标签管理', icon: Tag, desc: '管理资源标签' },
  ]

  const formatOptions = [
    { id: 'csv' as ExportFormat, label: 'CSV (Excel兼容)', icon: Table, desc: 'UTF-8编码，Excel可直接打开' },
    { id: 'json' as ExportFormat, label: 'JSON', icon: FileJson, desc: '适合程序处理和备份' },
  ]

  // 云端同步状态
  const cloudLinksCount = useMemo(() => links.filter(l => !(l as any)._pendingSync).length, [links])
  const pendingLinksCount = useMemo(() => links.filter(l => (l as any)._pendingSync).length, [links])
  
  // 图标使用计数
  const iconUsageCount = useMemo(() => {
    const map: Record<string, number> = {}
    iconLibrary.forEach(icon => { map[icon.id] = 0 })
    links.forEach(link => {
      if (link.icon) {
        const found = iconLibrary.find(i => i.dataUrl === link.icon)
        if (found) map[found.id] = (map[found.id] || 0) + 1
      }
    })
    return map
  }, [iconLibrary, links])

  // 导出列表筛选
  const filteredExportLinks = useMemo(() => {
    return links.filter(l => {
      if (exportSearch) {
        const q = exportSearch.toLowerCase()
        const matchName = (l.name || l.title || '').toLowerCase().includes(q)
        const matchUrl = (l.url || '').toLowerCase().includes(q)
        if (!matchName && !matchUrl) return false
      }
      if (exportCategoryFilter) {
        if (l.category_id !== exportCategoryFilter) return false
      }
      return true
    })
  }, [links, exportSearch, exportCategoryFilter])

  // 导出选中状态
  const allFilteredSelected = filteredExportLinks.length > 0 && filteredExportLinks.every(l => selectedForExport.includes(l.id))
  const someFilteredSelected = filteredExportLinks.some(l => selectedForExport.includes(l.id))

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedForExport(prev => prev.filter(id => !filteredExportLinks.find(l => l.id === id)))
    } else {
      const newIds = filteredExportLinks.map(l => l.id).filter(id => !selectedForExport.includes(id))
      setSelectedForExport(prev => [...prev, ...newIds])
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    
    await new Promise((resolve) => setTimeout(resolve, 300))

    const dataToExport = exportMode === 'selected' && selectedForExport.length > 0
      ? links.filter((l) => selectedForExport.includes(l.id))
      : links

    let content = ''
    let filename = ''
    let mimeType = ''

    if (exportFormat === 'csv') {
      // BOM for Excel UTF-8 compatibility
      const BOM = '\uFEFF'
      const headers = ['名称', 'Slug', '链接', '提取码', '分类', '描述', '关键词', '网盘类型', '精选', '置顶', '可见', '过期时间', '点击量', '创建时间']
      const rows = dataToExport.map((l) => [
        l.name || l.title || '',
        l.slug || '',
        l.url || '',
        l.extract_code || '',
        l.category_name || categories.find(c => c.id === l.category_id)?.name || '',
        l.description || '',
        (l.keywords || []).join('; '),
        l.drive_type || '',
        l.is_featured ? '是' : '否',
        l.is_pinned ? '是' : '否',
        l.visible !== false ? '是' : '否',
        l.expires_at || '永久',
        String(l.click_count || 0),
        formatDate(l.created_at || ''),
      ])
      content = BOM + [headers, ...rows].map((row) => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      filename = `资源链接_导出_${new Date().toISOString().split('T')[0]}.csv`
      mimeType = 'text/csv;charset=utf-8'
    } else if (exportFormat === 'json') {
      content = JSON.stringify(dataToExport.map((l) => ({
        name: l.name || l.title,
        slug: l.slug,
        url: l.url,
        extract_code: l.extract_code,
        category_id: l.category_id,
        category_name: categories.find(c => c.id === l.category_id)?.name,
        description: l.description,
        keywords: l.keywords,
        drive_type: l.drive_type,
        is_featured: l.is_featured,
        is_pinned: l.is_pinned,
        visible: l.visible,
        expires_at: l.expires_at,
        click_count: l.click_count,
        created_at: l.created_at,
      })), null, 2)
      filename = `资源链接_导出_${new Date().toISOString().split('T')[0]}.json`
      mimeType = 'application/json'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setIsExporting(false)
    toast.success(`已导出 ${dataToExport.length} 条数据`)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const parseCSV = (text: string): any[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length < 2) return []
    
    // 移除 BOM 字符
    const firstLine = lines[0].replace(/^\uFEFF/, '')
    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1)
    
    return rows.map(line => {
      // 正确处理引号内的逗号
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += char
      }
      values.push(current.trim())
      
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^"|"$/g, '') })
      
      return {
        name: row['名称'] || row['name'] || row['title'] || row['资源名称'] || '',
        url: row['链接'] || row['url'] || row['link'] || '',
        extract_code: row['提取码'] || row['extract_code'] || row['code'] || '',
        description: row['描述'] || row['description'] || '',
        keywords: row['关键词'] || row['keywords'] || row['搜索关键词'] || '',
        category_name: row['分类'] || row['category_name'] || row['category'] || '',
        drive_type: row['网盘类型'] || row['drive_type'] || '',
        is_featured: row['精选'] === '是' || row['is_featured'] === 'true',
        is_pinned: row['置顶'] === '是' || row['is_pinned'] === 'true',
        expires_at: row['过期时间'] || row['expires_at'] || '',
      }
    }).filter((item: any) => item.name || item.url)
  }

  const parseJSON = (text: string): any[] => {
    const data = JSON.parse(text)
    const items = Array.isArray(data) ? data : [data]
    return items.map((item: any) => ({
      name: item.name || item.title || '',
      url: item.url || item.link || '',
      extract_code: item.extract_code || item.code || '',
      description: item.description || '',
      keywords: item.keywords || [],
      category_name: item.category_name || '',
      category_id: item.category_id || '',
      drive_type: item.drive_type || 'baidu',
      is_featured: !!item.is_featured,
      is_pinned: !!item.is_pinned,
      expires_at: item.expires_at || '',
    }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsing(true)
    setImportPreview(null)

    try {
      const text = await file.text()
      const ext = file.name.split('.').pop()?.toLowerCase()

      let parsed: any[] = []
      if (ext === 'csv') {
        parsed = parseCSV(text)
      } else if (ext === 'json') {
        parsed = parseJSON(text)
      } else if (ext === 'xlsx' || ext === 'xls') {
        toast.error('Excel 格式暂不支持直接解析，请先转换为 CSV 格式')
        setIsParsing(false)
        return
      } else {
        toast.error('不支持的文件格式，请上传 CSV 或 JSON 文件')
        setIsParsing(false)
        return
      }

      if (parsed.length === 0) {
        toast.error('文件内容为空或格式不正确')
      } else {
        // 检测与网站现有数据的重复情况
        const store = useDataStore.getState()
        const existingUrls = new Map<string, { id: string; name: string }>()
        const existingNames = new Map<string, { id: string; url: string }>()
        store.links.forEach(l => {
          const url = (l.url || '').toLowerCase().trim()
          const name = (l.name || l.title || '').toLowerCase().trim()
          if (url) existingUrls.set(url, { id: l.id, name: l.name || l.title || '' })
          if (name) existingNames.set(name, { id: l.id, url: l.url || '' })
        })

        let dupCount = 0
        const previewWithDup: ImportPreviewItem[] = parsed.map((item: any) => {
          const itemUrl = (item.url || '').toLowerCase().trim()
          const itemName = (item.name || '').toLowerCase().trim()
          const result: ImportPreviewItem = { ...item }

          if (itemUrl && existingUrls.has(itemUrl)) {
            const matched = existingUrls.get(itemUrl)!
            result._duplicateType = 'url'
            result._duplicateAction = 'skip'
            result._matchedLinkId = matched.id
            result._matchedLinkName = matched.name
            dupCount++
          } else if (itemName && existingNames.has(itemName)) {
            const matched = existingNames.get(itemName)!
            result._duplicateType = 'name'
            result._duplicateAction = 'skip'
            result._matchedLinkId = matched.id
            result._matchedLinkName = itemName
            dupCount++
          }

          return result
        })

        setImportPreview(previewWithDup)
        toast.success(`已解析 ${parsed.length} 条数据${dupCount > 0 ? `，检测到 ${dupCount} 条重复` : ''}`)
      }
    } catch (err) {
      toast.error('文件解析失败，请检查文件格式')
      console.error('文件解析错误:', err)
    }

    setIsParsing(false)
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return
    const store = useDataStore.getState()
    let importedCount = 0
    let duplicatesSkipped = 0
    let duplicatesOverwritten = 0
    const createdCategories: string[] = []
    const matchedCategories: string[] = []
    const errors: string[] = []
    const categoryMap = new Map<string, string>()
    const total = importPreview.length
    setImportProgress({ current: 0, total })

    // 构建已有链接的去重集合（动态更新，处理"保留两份"的场景）
    const existingUrls = new Set(store.links.map(l => l.url.toLowerCase().trim()))
    const existingNames = new Set(store.links.map(l => (l.name || l.title || '').toLowerCase().trim()))

    // 先处理分类
    for (const item of importPreview) {
      if (!item.category_name) continue
      const catName = item.category_name.trim()
      if (!catName || categoryMap.has(catName)) continue
      const existing = store.categories.find(
        c => c.name.toLowerCase() === catName.toLowerCase()
      )
      if (existing) {
        categoryMap.set(catName, existing.id)
        matchedCategories.push(catName)
      } else {
        try {
          const newCat = await store.addCategory(catName)
          categoryMap.set(catName, newCat.id)
          createdCategories.push(catName)
        } catch {
          const fallbackId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          categoryMap.set(catName, fallbackId)
          createdCategories.push(catName)
        }
      }
    }

    // 更新 stats
    setImportStats({ createdCategories, matchedCategories, duplicatesSkipped, duplicatesOverwritten, errors })

    const buildLinkData = (item: ImportPreviewItem, categoryId: string) => {
      let keywords: string[] = []
      if (Array.isArray(item.keywords)) {
        keywords = item.keywords
      } else if (typeof item.keywords === 'string' && item.keywords.trim()) {
        keywords = item.keywords.split(/[,;，；]/).map((k: string) => k.trim()).filter(Boolean)
      }
      let visible = true
      if (item.visible === '否' || item.visible === 'false' || item.visible === false || item.visible === '0') {
        visible = false
      }
      return {
        name: item.name || '未命名资源',
        title: item.name || '未命名资源',
        url: item.url || '',
        description: item.description || '',
        category_id: categoryId,
        extract_code: item.extract_code || '',
        keywords,
        is_pinned: !!item.is_pinned,
        is_featured: !!item.is_featured,
        expires_at: item.expires_at && item.expires_at !== '永久' ? item.expires_at : null,
        drive_type: item.drive_type || 'baidu',
        visible,
      }
    }

    for (let i = 0; i < importPreview.length; i++) {
      const item = importPreview[i]
      setImportProgress({ current: i + 1, total })

      try {
        let categoryId = item.category_id || ''
        const catName = item.category_name?.trim()
        if (!categoryId && catName && categoryMap.has(catName)) {
          categoryId = categoryMap.get(catName)!
        }

        const action = item._duplicateAction || 'skip'
        const itemUrl = (item.url || '').toLowerCase().trim()
        const itemName = (item.name || '').toLowerCase().trim()

        if (action === 'skip') {
          // 跳过：如果 URL 或名称已存在则跳过
          if (itemUrl && existingUrls.has(itemUrl)) {
            duplicatesSkipped++
            setImportStats(prev => prev ? { ...prev, duplicatesSkipped } : null)
            continue
          }
          if (itemName && existingNames.has(itemName)) {
            duplicatesSkipped++
            setImportStats(prev => prev ? { ...prev, duplicatesSkipped } : null)
            continue
          }
          // 不重复 → 正常导入
          await store.addLink(buildLinkData(item, categoryId))
          if (itemUrl) existingUrls.add(itemUrl)
          if (itemName) existingNames.add(itemName)
          importedCount++
        } else if (action === 'overwrite') {
          // 覆盖：更新已有链接
          const matchedId = item._matchedLinkId
          if (matchedId) {
            const existing = store.links.find(l => l.id === matchedId)
            if (existing) {
              // 更新已有链接的属性
              await store.updateLink(matchedId, {
                url: item.url || existing.url,
                name: item.name || existing.name,
                title: item.name || existing.title,
                description: item.description || existing.description,
                category_id: categoryId || existing.category_id,
                extract_code: item.extract_code || existing.extract_code,
                drive_type: item.drive_type || existing.drive_type,
                is_featured: item.is_featured ?? existing.is_featured,
                is_pinned: item.is_pinned ?? existing.is_pinned,
                expires_at: item.expires_at && item.expires_at !== '永久' ? item.expires_at : existing.expires_at,
              })
              duplicatesOverwritten++
              setImportStats(prev => prev ? { ...prev, duplicatesOverwritten } : null)
            }
          }
        } else if (action === 'keep_both') {
          // 保留两份：无视去重，直接新增
          await store.addLink(buildLinkData(item, categoryId))
          if (itemUrl) existingUrls.add(itemUrl)
          if (itemName) existingNames.add(itemName)
          importedCount++
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`${item.name || '未知'}: ${errMsg}`)
        console.error('[Import] Failed:', item.name, err)
      }
    }

    let msg = `已成功导入 ${importedCount} 条数据`
    if (duplicatesSkipped > 0) msg += `，跳过 ${duplicatesSkipped} 条重复`
    if (duplicatesOverwritten > 0) msg += `，覆盖 ${duplicatesOverwritten} 条`
    if (createdCategories.length > 0) msg += `，新建 ${createdCategories.length} 个分类`
    if (errors.length > 0) msg += `，${errors.length} 条失败`
    toast.success(msg)
    setImportPreview(null)
    setImportStats(null)
    setImportProgress({ current: 0, total: 0 })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCancelImport = () => {
    setImportPreview(null)
    setImportStats(null)
    setImportProgress({ current: 0, total: 0 })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 批量设置所有重复项的处理方式
  const handleBatchDuplicateAction = (action: DuplicateAction) => {
    if (!importPreview) return
    setImportPreview(prev =>
      prev!.map(item =>
        item._duplicateType ? { ...item, _duplicateAction: action } : item
      )
    )
  }

  // 计算重复统计
  const dupStats = useMemo(() => {
    if (!importPreview) return { total: 0, urlDup: 0, nameDup: 0 }
    let urlDup = 0, nameDup = 0
    importPreview.forEach(item => {
      if (item._duplicateType === 'url') urlDup++
      else if (item._duplicateType === 'name') nameDup++
    })
    return { total: urlDup + nameDup, urlDup, nameDup }
  }, [importPreview])

  // 标签管理状态
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366F1')

  // 网盘类型管理状态
  const [isAddingDrive, setIsAddingDrive] = useState(false)
  const [newDrive, setNewDrive] = useState({
    id: '',
    name: '',
    color: 'bg-gradient-to-br from-gray-500 to-gray-600',
    icon: '网',
    iconImage: '',
  })

  const colorOptions = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6',
  ]

  const driveColors = [
    'bg-gradient-to-br from-blue-500 to-blue-600',
    'bg-gradient-to-br from-purple-500 to-purple-600',
    'bg-gradient-to-br from-red-500 to-orange-500',
    'bg-gradient-to-br from-green-500 to-emerald-500',
    'bg-gradient-to-br from-pink-500 to-rose-500',
    'bg-gradient-to-br from-cyan-500 to-blue-500',
    'bg-gradient-to-br from-amber-500 to-yellow-500',
    'bg-gradient-to-br from-indigo-500 to-violet-500',
  ]

  const presetTypes = driveTypes.filter(d => ['baidu', 'aliyun', 'quark', 'xunlei', 'oneonefive', 'tianyi'].includes(d.id))

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

  const handleAddDrive = () => {
    if (newDrive.name.trim()) {
      addDriveType(newDrive.name.trim(), newDrive.icon, newDrive.color)
      setNewDrive({ id: '', name: '', color: 'bg-gradient-to-br from-gray-500 to-gray-600', icon: '网', iconImage: '' })
      setIsAddingDrive(false)
      toast.success('网盘类型已添加')
    }
  }

  // Export list display helpers
  const getCategoryName = (categoryId: string) => categories.find(c => c.id === categoryId)?.name || '未分类'
  const getDriveTypeName = (dt: string) => {
    const types: Record<string, string> = { baidu: '百度', aliyun: '阿里', quark: '夸克', xunlei: '迅雷', oneonefive: '115', tianyi: '天翼' }
    return types[dt] || dt
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">数据管理</h1>
        <p className="text-gray-500 mt-1">导入导出数据，管理图标、网盘类型和标签</p>
      </div>

      {/* 云端同步状态卡片 */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${cloudSyncError ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cloudSyncError ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
          {cloudSyncError ? <CloudOff className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <p className={`font-semibold text-sm ${cloudSyncError ? 'text-amber-800' : 'text-emerald-800'}`}>
            {cloudSyncError ? '云端同步异常' : '云端数据已同步'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {cloudSyncError 
              ? `${cloudLinksCount} 条云端数据 + ${pendingLinksCount} 条本地待同步数据`
              : `共 ${links.length} 条链接，${categories.length} 个分类已同步至云端`
            }
          </p>
        </div>
        {cloudSyncError && (
          <button
            onClick={() => {
              toast.success('正在重新同步...')
              initialize()
              setTimeout(() => toast.success('同步完成，请刷新查看'), 2000)
            }}
            className="px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            重试同步
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-center gap-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {/* ===== 数据导出 ===== */}
          {activeTab === 'export' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* 格式选择 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">选择导出格式</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {formatOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setExportFormat(option.id)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        exportFormat === option.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <option.icon className={`w-8 h-8 mx-auto mb-2 ${
                        exportFormat === option.id ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <p className="font-medium text-gray-800">{option.label}</p>
                      <p className="text-sm text-gray-500 mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 范围选择 + 链接列表 (始终可见) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">选择导出范围</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">
                      {exportMode === 'selected' ? `已选 ${selectedForExport.length} / ${links.length} 条` : `全部 ${links.length} 条`}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => { setExportMode('all'); setSelectedForExport([]) }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                      exportMode === 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Download className="w-4 h-4 inline mr-1.5" />
                    导出全部
                  </button>
                  <button
                    onClick={() => setExportMode('selected')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                      exportMode === 'selected' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 inline mr-1.5" />
                    导出选中项
                  </button>
                </div>

                {/* 搜索和筛选工具栏 */}
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={exportSearch}
                      onChange={(e) => setExportSearch(e.target.value)}
                      placeholder="搜索链接名称或URL..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <select
                    value={exportCategoryFilter}
                    onChange={(e) => setExportCategoryFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer min-w-[120px]"
                  >
                    <option value="">全部分类</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* 可勾选链接列表 - 始终显示 */}
                <div className="border rounded-lg overflow-hidden">
                  {/* 表头 */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b text-xs font-medium text-gray-500">
                    <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                      <div className="w-4 h-4 flex items-center justify-center">
                        {allFilteredSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" onClick={toggleSelectAllFiltered} />
                        ) : someFilteredSelected ? (
                          <div className="w-4 h-4 border-2 border-blue-400 bg-blue-100 rounded relative cursor-pointer" onClick={toggleSelectAllFiltered}>
                            <div className="absolute inset-0.5 bg-blue-500 rounded-sm" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-gray-300 cursor-pointer" onClick={toggleSelectAllFiltered} />
                        )}
                      </div>
                      <span className="cursor-pointer" onClick={toggleSelectAllFiltered}>全选</span>
                    </label>
                    <span className="flex-1">名称</span>
                    <span className="w-24 hidden sm:block">分类</span>
                    <span className="w-16 hidden sm:block text-center">网盘</span>
                  </div>

                  {/* 列表 */}
                  <div className="max-h-[400px] overflow-y-auto divide-y">
                    {filteredExportLinks.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{links.length === 0 ? '暂无链接数据' : '无匹配结果'}</p>
                      </div>
                    ) : (
                      filteredExportLinks.map(link => (
                        <label key={link.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedForExport.includes(link.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForExport(prev => [...prev, link.id])
                                if (exportMode === 'all') setExportMode('selected')
                              } else {
                                setSelectedForExport(prev => prev.filter(id => id !== link.id))
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 truncate block font-medium">{link.name || link.title}</span>
                            <span className="text-xs text-gray-400 truncate block">{link.url}</span>
                          </div>
                          <span className="text-xs text-gray-500 w-24 hidden sm:block truncate">{getCategoryName(link.category_id)}</span>
                          <span className="text-xs text-gray-400 w-16 hidden sm:block text-center">{getDriveTypeName(link.drive_type)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* 快捷操作 */}
                <div className="flex gap-2 mt-2">
                  <button onClick={toggleSelectAllFiltered} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                    {allFilteredSelected ? '取消全选' : '全选当前'}
                  </button>
                  <button onClick={() => setSelectedForExport([])} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
                    清空选择
                  </button>
                  <span className="text-xs text-gray-300">|</span>
                  <span className="text-xs text-gray-400">
                    {filteredExportLinks.length} 条可见 / 共 {links.length} 条
                  </span>
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={isExporting || (exportMode === 'selected' && selectedForExport.length === 0)}
                className="px-6 py-3 gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-shadow flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> 导出中...</>
                ) : (
                  <><Download className="w-5 h-5" /> 
                  {exportMode === 'all' ? `导出全部 (${links.length} 条)` : `导出选中项 (${selectedForExport.length} 条)`}
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* ===== 数据导入 ===== */}
          {activeTab === 'import' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {!importPreview && !isParsing ? (
                <>
                  <div
                    onClick={handleImportClick}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-700 mb-2">点击上传文件</p>
                    <p className="text-sm text-gray-500">支持 CSV、JSON 格式（Excel 请先转为 CSV）</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-2">导入说明</h4>
                    <ul className="text-sm text-gray-600 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <ScrollText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        CSV 文件需包含以下列：名称、链接、提取码（可选）、分类、描述、关键词、网盘类型、精选、置顶、可见、过期时间
                      </li>
                      <li className="flex items-start gap-2">
                        <FolderOpen className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        若分类不存在，系统会自动创建新分类
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        智能去重：重复链接会标出，您可选择<strong>跳过、覆盖或保留两份</strong>
                      </li>
                      <li className="flex items-start gap-2">
                        <FileJson className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        JSON 文件需为对象数组格式
                      </li>
                    </ul>
                  </div>
                </>
              ) : isParsing ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 mx-auto mb-3 text-brand-500 animate-spin" />
                  <p className="text-gray-500">正在解析文件...</p>
                </div>
              ) : importPreview ? (
                <div className="space-y-4">
                  {/* Import progress bar */}
                  {importProgress.total > 0 && importProgress.current > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">导入进度</span>
                        <span className="text-gray-500">{importProgress.current} / {importProgress.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">文件解析成功，预览如下：</span>
                  </div>

                  {importStats && (
                    <div className="space-y-2">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                        {importStats.createdCategories.length > 0 && (
                          <p className="text-blue-800">
                            <span className="font-medium">将新建分类：</span>
                            {importStats.createdCategories.join('、')}
                          </p>
                        )}
                        {importStats.matchedCategories.length > 0 && (
                          <p className="text-blue-700 mt-1">
                            <span className="font-medium">匹配已有分类：</span>
                            {importStats.matchedCategories.join('、')}
                          </p>
                        )}
                      </div>
                      {importStats.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                          <p className="font-medium text-red-700 mb-1">导入失败 ({importStats.errors.length} 条):</p>
                          <ul className="text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                            {importStats.errors.map((e, i) => <li key={i} className="text-xs">• {e}</li>)}
                          </ul>
                        </div>
                      )}
                      {importStats.duplicatesSkipped > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                          <AlertTriangle className="w-4 h-4 inline mr-1" />
                          已跳过 {importStats.duplicatesSkipped} 条重复数据
                        </div>
                      )}
                      {importStats.duplicatesOverwritten > 0 && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-700">
                          <RefreshCw className="w-4 h-4 inline mr-1" />
                          已覆盖 {importStats.duplicatesOverwritten} 条数据
                        </div>
                      )}
                    </div>
                  )}

                  {/* 重复数据提示和批量操作 */}
                  {dupStats.total > 0 && importProgress.total === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-amber-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          检测到 <strong>{dupStats.total}</strong> 条与网站现有数据重复
                          （URL 重复 {dupStats.urlDup} 条，名称重复 {dupStats.nameDup} 条）
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-amber-600 self-center">批量设置：</span>
                        <button
                          onClick={() => handleBatchDuplicateAction('skip')}
                          className="px-3 py-1 text-xs font-medium rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                        >
                          全部跳过
                        </button>
                        <button
                          onClick={() => handleBatchDuplicateAction('overwrite')}
                          className="px-3 py-1 text-xs font-medium rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                        >
                          全部覆盖
                        </button>
                        <button
                          onClick={() => handleBatchDuplicateAction('keep_both')}
                          className="px-3 py-1 text-xs font-medium rounded-md border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          全部保留两份
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 w-8">#</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">名称</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">链接</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">提取码</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">分类</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">网盘</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 w-24">重复检测</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 w-28">处理方式</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importPreview.map((item, index) => {
                          const isDup = !!item._duplicateType
                          return (
                          <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isDup ? 'bg-amber-50/60' : ''}`}>
                            <td className="px-3 py-2 text-sm text-gray-400">{index + 1}</td>
                            <td className="px-3 py-2 text-sm text-gray-800 max-w-[140px] truncate">
                              {item.name}
                              {isDup && <span className="ml-1 text-[10px] text-amber-600">*</span>}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600 max-w-[160px] truncate">{item.url}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{item.extract_code || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{item.category_name || item.category_id || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500">{item.drive_type || 'baidu'}</td>
                            <td className="px-3 py-2 text-sm">
                              {isDup ? (
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
                                  item._duplicateType === 'url' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {item._duplicateType === 'url' ? 'URL重复' : '名称重复'}
                                </span>
                              ) : (
                                <span className="text-xs text-green-600">新增</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isDup ? (
                                <select
                                  value={item._duplicateAction}
                                  onChange={(e) => {
                                    const action = e.target.value as DuplicateAction
                                    setImportPreview(prev =>
                                      prev!.map((p, i) => i === index ? { ...p, _duplicateAction: action } : p)
                                    )
                                  }}
                                  className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300"
                                >
                                  <option value="skip">跳过</option>
                                  <option value="overwrite">覆盖</option>
                                  <option value="keep_both">保留两份</option>
                                </select>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmImport}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 cursor-pointer disabled:opacity-50"
                      disabled={importProgress.total > 0}
                    >
                      {importProgress.total > 0 ? '导入中...' : `确认导入 (${importPreview.length} 条)`}
                    </button>
                    <button
                      onClick={handleCancelImport}
                      className="px-6 py-2.5 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      disabled={importProgress.total > 0}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

          {/* ===== 图标库 ===== */}
          {activeTab === 'icon-library' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">图标库</h3>
                  <p className="text-sm text-gray-500 mt-1">上传图片到图标库，创建资源时可直接选择使用</p>
                </div>
                <button
                  onClick={() => iconFileInputRef.current?.click()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer min-h-[44px] sm:min-h-[36px]"
                >
                  <Upload className="w-4 h-4" />
                  上传图标
                </button>
                <input
                  ref={iconFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files
                    if (!files) return
                    let count = 0
                    for (const file of Array.from(files)) {
                      if (!file.type.startsWith('image/')) {
                        toast.error(`${file.name} 不是图片文件`)
                        continue
                      }
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error(`${file.name} 超过 2MB 限制`)
                        continue
                      }
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const dataUrl = ev.target?.result as string
                        addIconToLibrary(file.name.replace(/\.[^/.]+$/, ''), dataUrl)
                        count++
                      }
                      reader.readAsDataURL(file)
                    }
                    if (count > 0) {
                      setTimeout(() => toast.success(`已添加 ${count} 个图标`), 300)
                    }
                    e.target.value = ''
                  }}
                />
              </div>

              {/* 搜索 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="搜索图标..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {iconLibrary.length === 0 ? (
                <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>图标库为空，点击上方按钮上传图标</p>
                  <p className="text-xs mt-1">支持 JPG/PNG/SVG，单文件最大 2MB，建议 64x64 或 128x128</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {iconLibrary
                    .filter(icon => !iconSearch || icon.name.toLowerCase().includes(iconSearch.toLowerCase()))
                    .map((icon) => {
                      const usage = iconUsageCount[icon.id] || 0
                      return (
                        <div key={icon.id} className="group relative bg-white border rounded-xl p-3 hover:shadow-md transition-all">
                          <div className="w-full aspect-square flex items-center justify-center mb-2">
                            <img src={icon.dataUrl} alt={icon.name} className="w-12 h-12 object-contain" />
                          </div>
                          <p className="text-xs text-gray-600 text-center truncate">{icon.name}</p>
                          {usage > 0 && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-600 rounded-md font-medium">
                              {usage}次使用
                            </span>
                          )}
                          <button
                            onClick={() => {
                              deleteIconFromLibrary(icon.id)
                              toast.success('图标已删除')
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-50 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 cursor-pointer"
                            title="删除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                </div>
              )}
            </motion.div>
          )}

          {/* ===== 网盘类型 ===== */}
          {activeTab === 'drive-types' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">网盘类型</h3>
                  <p className="text-sm text-gray-500 mt-1">管理网盘图标和类型</p>
                </div>
                <button
                  onClick={() => setIsAddingDrive(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer min-h-[44px] sm:min-h-[36px]"
                >
                  <Plus className="w-4 h-4" /> 添加网盘类型
                </button>
              </div>

              {/* 预设类型 */}
              <div>
                <h4 className="text-base font-semibold text-gray-800 mb-3">预设网盘类型</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {presetTypes.map((drive) => (
                    <div key={drive.id} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                      <div className={`w-12 h-12 mx-auto rounded-xl ${drive.color} flex items-center justify-center text-white font-bold text-lg shadow mb-2`}>
                        {drive.icon}
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{drive.name}</p>
                      <p className="text-xs text-gray-400">预设类型</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 自定义类型 */}
              <div>
                <h4 className="text-base font-semibold text-gray-800 mb-3">自定义网盘类型</h4>
                {!isAddingDrive && driveTypes.filter(d => !presetTypes.includes(d)).length === 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                    <HardDrive className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">暂无自定义网盘类型</p>
                    <button onClick={() => setIsAddingDrive(true)} className="mt-3 px-4 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      + 添加自定义网盘
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {driveTypes.filter(d => !presetTypes.includes(d)).map((drive) => (
                    <div key={drive.id} className="bg-white rounded-xl border border-gray-200 p-3 text-center relative group">
                      <button
                        onClick={() => { deleteDriveType(drive.id); toast.success('网盘类型已删除') }}
                        className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className={`w-12 h-12 mx-auto rounded-xl ${drive.color} flex items-center justify-center text-white font-bold text-lg shadow mb-2`}>
                        {drive.icon}
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{drive.name}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 添加表单 */}
              {isAddingDrive && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">添加自定义网盘</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">图标预览</label>
                      <div className={`w-16 h-16 rounded-xl ${newDrive.color} flex items-center justify-center text-white font-bold text-xl`}>
                        {newDrive.iconImage ? (
                          <img src={newDrive.iconImage} alt="preview" className="w-full h-full rounded-xl object-cover" />
                        ) : (
                          newDrive.icon || '网'
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">名称</label>
                      <input type="text" value={newDrive.name} onChange={(e) => setNewDrive({ ...newDrive, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="网盘名称" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
                      <div className="flex flex-wrap gap-1.5">
                        {driveColors.map((color, i) => (
                          <button key={i} onClick={() => setNewDrive({ ...newDrive, color })}
                            className={`w-7 h-7 rounded-lg ${color} ${newDrive.color === color ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => { setIsAddingDrive(false); setNewDrive({ id: '', name: '', color: 'bg-gradient-to-br from-gray-500 to-gray-600', icon: '网', iconImage: '' }) }}
                      className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm">取消</button>
                    <button onClick={handleAddDrive} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm">保存</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ===== 标签管理 ===== */}
          {activeTab === 'tags' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">标签管理</h3>
                  <p className="text-sm text-gray-500 mt-1">管理资源标签，用于分类和搜索</p>
                </div>
                <button
                  onClick={() => setShowAddTag(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer min-h-[44px] sm:min-h-[36px]"
                >
                  <Plus className="w-4 h-4" /> 添加标签
                </button>
              </div>

              {/* 添加标签表单 */}
              {showAddTag && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="标签名称"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">标签颜色</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${newTagColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleAddTag} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors cursor-pointer">保存</button>
                    <button onClick={() => setShowAddTag(false)} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm transition-colors cursor-pointer">取消</button>
                  </div>
                </div>
              )}

              {/* 标签列表 */}
              {tags.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
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
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm font-medium" style={{ color: tag.color }}>{tag.name}</span>
                      <button
                        onClick={() => { deleteTag(tag.id); toast.success('标签已删除') }}
                        className="ml-1 hover:bg-white/50 rounded-full p-0.5 transition-colors cursor-pointer"
                        title="删除标签"
                      >
                        <X className="w-3 h-3" style={{ color: tag.color }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
