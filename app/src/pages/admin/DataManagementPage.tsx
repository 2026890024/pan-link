import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  Upload,
  FileJson,
  Table,
  Eye,
  Calendar,
  RefreshCw,
  Trash2,
  Share2,
  Link2,
  Plus,
  CheckCircle,
  Image,
  X,
  Search,
} from 'lucide-react'
import { useDataStore } from '@/store/useDataStore'
import { formatNumber, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

type ExportFormat = 'csv' | 'json'
type Tab = 'export' | 'import' | 'share' | 'icon-library'

const SHARE_STORAGE_KEY = 'admin_share_links'

interface ShareLink {
  id: string
  name: string
  slug: string
  visits: number
  createdAt: string
  linkIds: string[]
  linkNames: string[]
}

function loadShareLinks(): ShareLink[] {
  try {
    const raw = localStorage.getItem(SHARE_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveShareLinks(links: ShareLink[]) {
  localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(links))
}

export default function DataManagementPage() {
  const { links, categories, addCategory, addLink, iconLibrary, addIconToLibrary, deleteIconFromLibrary } = useDataStore()
  const [activeTab, setActiveTab] = useState<Tab>('export')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [selectedForExport, setSelectedForExport] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [importPreview, setImportPreview] = useState<any[] | null>(null)
  const [importStats, setImportStats] = useState<{ createdCategories: string[]; matchedCategories: string[] } | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const iconFileInputRef = useRef<HTMLInputElement>(null)
  const [iconSearch, setIconSearch] = useState('')

  const tabs = [
    { id: 'export' as Tab, label: '数据导出', icon: Download },
    { id: 'import' as Tab, label: '数据导入', icon: Upload },
    { id: 'icon-library' as Tab, label: '图标库', icon: Image },
    { id: 'share' as Tab, label: '分享管理', icon: Share2 },
  ]

  const formatOptions = [
    { id: 'csv' as ExportFormat, label: 'CSV (Excel兼容)', icon: Table, desc: 'UTF-8编码，Excel可直接打开' },
    { id: 'json' as ExportFormat, label: 'JSON', icon: FileJson, desc: '适合程序处理和备份' },
  ]

  const handleExport = async () => {
    setIsExporting(true)
    
    await new Promise((resolve) => setTimeout(resolve, 500))

    const dataToExport = selectedForExport.length > 0
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
        setImportPreview(parsed)
        toast.success(`已解析 ${parsed.length} 条数据，请预览确认`)
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
    const createdCategories: string[] = []
    const matchedCategories: string[] = []
    const categoryMap = new Map<string, string>() // name -> id

    // 先处理所有分类：创建不存在的分类
    for (const item of importPreview) {
      if (!item.category_name) continue
      const catName = item.category_name.trim()
      if (!catName) continue
      if (categoryMap.has(catName)) continue

      const existing = store.categories.find(
        c => c.name.toLowerCase() === catName.toLowerCase()
      )
      if (existing) {
        categoryMap.set(catName, existing.id)
        matchedCategories.push(catName)
      } else {
        // 自动创建分类
        try {
          const newCat = await store.addCategory(catName)
          categoryMap.set(catName, newCat.id)
          createdCategories.push(catName)
        } catch {
          // fallback: 创建本地分类
          const fallbackId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          categoryMap.set(catName, fallbackId)
          createdCategories.push(catName)
        }
      }
    }

    setImportStats({ createdCategories, matchedCategories })

    for (const item of importPreview) {
      try {
        let categoryId = item.category_id || ''
        const catName = item.category_name?.trim()
        if (!categoryId && catName && categoryMap.has(catName)) {
          categoryId = categoryMap.get(catName)!
        }
        let keywords: string[] = []
        if (Array.isArray(item.keywords)) {
          keywords = item.keywords
        } else if (typeof item.keywords === 'string' && item.keywords.trim()) {
          keywords = item.keywords.split(/[,;，；]/).map((k: string) => k.trim()).filter(Boolean)
        }
        // 处理 visible 字段
        let visible = true
        if (item.visible === '否' || item.visible === 'false' || item.visible === false || item.visible === '0') {
          visible = false
        }
        await store.addLink({
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
        })
        importedCount++
      } catch (err) {
        console.error('[Import] Failed to import item:', item.name, err)
      }
    }
    let msg = `已成功导入 ${importedCount} 条数据`
    if (createdCategories.length > 0) msg += `，新建 ${createdCategories.length} 个分类`
    toast.success(msg)
    setImportPreview(null)
    setImportStats(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCancelImport = () => {
    setImportPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 分享链接管理（持久化）
  const [shareLinks, setShareLinks] = useState<ShareLink[]>(loadShareLinks)
  const [showCreateShare, setShowCreateShare] = useState(false)
  const [newShareName, setNewShareName] = useState('')
  const [newShareSlug, setNewShareSlug] = useState('')
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([])

  useEffect(() => {
    saveShareLinks(shareLinks)
  }, [shareLinks])

  const handleCreateShare = () => {
    if (!newShareName || !newShareSlug) {
      toast.error('请填写完整信息')
      return
    }
    const selectedLinks = links.filter(l => selectedLinkIds.includes(l.id))
    const newShare: ShareLink = {
      id: Date.now().toString(),
      name: newShareName,
      slug: newShareSlug,
      visits: 0,
      createdAt: new Date().toISOString().split('T')[0],
      linkIds: selectedLinkIds,
      linkNames: selectedLinks.map(l => l.name || l.title),
    }
    setShareLinks(prev => [...prev, newShare])
    setShowCreateShare(false)
    setNewShareName('')
    setNewShareSlug('')
    setSelectedLinkIds([])
    toast.success('分享创建成功')
  }

  const handleDeleteShare = (id: string) => {
    setShareLinks(prev => prev.filter(s => s.id !== id))
    toast.success('分享已删除')
  }

  const handleCopyShareLink = (slug: string) => {
    const link = `${window.location.origin}/s/${slug}`
    navigator.clipboard.writeText(link).then(() => {
      toast.success('分享链接已复制')
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">数据管理</h1>
        <p className="text-gray-500 mt-1">导入导出数据，管理分享链接</p>
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
          {/* 数据导出 */}
          {activeTab === 'export' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">选择导出格式</h3>
                <div className="grid md:grid-cols-3 gap-4">
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

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">选择导出范围</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 rounded-lg border cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="exportRange"
                      checked={selectedForExport.length === 0}
                      onChange={() => setSelectedForExport([])}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <p className="font-medium text-gray-800">导出全部</p>
                      <p className="text-sm text-gray-500">共 {links.length} 条数据</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 rounded-lg border cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="exportRange"
                      checked={selectedForExport.length > 0}
                      onChange={() => setSelectedForExport(links.length > 0 ? [links[0].id] : [])}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <p className="font-medium text-gray-800">导出选中项</p>
                      <p className="text-sm text-gray-500">
                        {selectedForExport.length > 0
                          ? `已选择 ${selectedForExport.length} 条数据`
                          : '请先选择要导出的链接'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-6 py-3 gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-shadow flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> 导出中...</>
                ) : (
                  <><Download className="w-5 h-5" /> 开始导出</>
                )}
              </button>
            </motion.div>
          )}

          {/* 数据导入 */}
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
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• CSV 文件需包含以下列：名称、链接、提取码（可选）、分类、描述、关键词、网盘类型、精选、置顶、可见、过期时间</li>
                      <li>• 若分类不存在，系统会自动创建新分类</li>
                      <li>• JSON 文件需为对象数组格式</li>
                      <li>• 支持的最大文件大小为 10MB</li>
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
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">文件解析成功，预览如下：</span>
                  </div>
                  {importStats && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      {importStats.createdCategories.length > 0 && (
                        <p className="text-amber-800">
                          <span className="font-medium">将新建分类：</span>
                          {importStats.createdCategories.join('、')}
                        </p>
                      )}
                      {importStats.matchedCategories.length > 0 && (
                        <p className="text-green-700 mt-1">
                          <span className="font-medium">匹配已有分类：</span>
                          {importStats.matchedCategories.join('、')}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">#</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">名称</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">链接</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">提取码</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">描述</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">分类</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importPreview.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-400">{index + 1}</td>
                            <td className="px-4 py-2 text-sm text-gray-800 max-w-[150px] truncate">{item.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 max-w-[180px] truncate">{item.url}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{item.extract_code || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500 max-w-[120px] truncate">{item.description || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{item.category_name || item.category_id || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmImport}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 cursor-pointer"
                    >
                      确认导入 ({importPreview.length} 条)
                    </button>
                    <button
                      onClick={handleCancelImport}
                      className="px-6 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

          {/* 图标库 */}
          {activeTab === 'icon-library' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">图标库</h3>
                  <p className="text-sm text-gray-500 mt-1">上传图片到图标库，创建资源时可直接选择使用</p>
                </div>
                <button
                  onClick={() => iconFileInputRef.current?.click()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer"
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
                        toast.success(`${file.name} 已添加到图标库`)
                      }
                      reader.readAsDataURL(file)
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
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {iconLibrary.length === 0 ? (
                <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>图标库为空，点击上方按钮上传图标</p>
                  <p className="text-xs mt-1">建议上传 64x64 或 128x128 的 PNG 图标</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {iconLibrary
                    .filter(icon => !iconSearch || icon.name.toLowerCase().includes(iconSearch.toLowerCase()))
                    .map((icon) => (
                    <div key={icon.id} className="group relative bg-white border rounded-xl p-3 hover:shadow-md transition-all">
                      <div className="w-full aspect-square flex items-center justify-center mb-2">
                        <img src={icon.dataUrl} alt={icon.name} className="w-12 h-12 object-contain" />
                      </div>
                      <p className="text-xs text-gray-600 text-center truncate">{icon.name}</p>
                      <button
                        onClick={() => {
                          deleteIconFromLibrary(icon.id)
                          toast.success('图标已删除')
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-50 text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                        title="删除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* 分享管理 */}
          {activeTab === 'share' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">分享短链接</h3>
                <button 
                  onClick={() => setShowCreateShare(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  创建分享
                </button>
              </div>

              {shareLinks.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <Share2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">暂无分享链接，点击上方按钮创建</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shareLinks.map((link) => (
                    <div
                      key={link.id}
                      className="p-4 rounded-xl border hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-800">{link.name}</h4>
                          <p className="text-sm text-blue-600 mt-1">
                            {window.location.origin}/s/{link.slug}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyShareLink(link.slug)}
                            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
                            title="复制链接"
                          >
                            <Link2 className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteShare(link.id)}
                            className="p-2 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          {formatNumber(link.visits)} 次访问
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {link.createdAt}
                        </span>
                        <span className="flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5" />
                          {(link.linkIds || []).length} 个链接
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* 创建分享弹窗 */}
      {showCreateShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowCreateShare(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">创建分享</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分享名称</label>
                <input
                  type="text"
                  value={newShareName}
                  onChange={(e) => setNewShareName(e.target.value)}
                  placeholder="例如：热门资源合集"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">短链接后缀</label>
                <input
                  type="text"
                  value={newShareSlug}
                  onChange={(e) => setNewShareSlug(e.target.value)}
                  placeholder="例如：hot-2024"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                />
                <p className="text-xs text-gray-400 mt-1">分享链接：{window.location.origin}/s/{newShareSlug || 'xxx'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择要分享的链接 ({selectedLinkIds.length} 个)
                </label>
                <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {links.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">暂无链接可选</p>
                  )}
                  {links.map(link => (
                    <label key={link.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLinkIds.includes(link.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLinkIds(prev => [...prev, link.id])
                          } else {
                            setSelectedLinkIds(prev => prev.filter(id => id !== link.id))
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 truncate block">{link.name || link.title}</span>
                        <span className="text-xs text-gray-400 truncate block">{link.url}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLinkIds(links.map(l => l.id))}
                    className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLinkIds([])}
                    className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    取消全选
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateShare}
                disabled={selectedLinkIds.length === 0}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
              <button
                onClick={() => setShowCreateShare(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium cursor-pointer"
              >
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
