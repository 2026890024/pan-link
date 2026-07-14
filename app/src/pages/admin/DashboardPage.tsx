import { motion } from 'framer-motion'
import {
  Link2,
  Eye,
  Clock,
  AlertTriangle,
  Pin,
  ArrowUpRight,
  Download,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'

function getLinkIcon(link: LinkItem) {
  return <LinkIcon link={link} size={link.icon_size || 'sm'} />
}

export default function DashboardPage() {
  const { links, categories } = useDataStore()

  const totalClicks = links.reduce((sum, link) => sum + (link.click_count || 0), 0)
  const expiringCount = links.filter(l => l.expires_at && new Date(l.expires_at) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length

  const kpiCards = [
    { title: '总链接数', value: links.length, icon: Link2, bgColor: 'bg-brand-600', color: 'text-brand-600' },
    { title: '总点击量', value: totalClicks, icon: Eye, bgColor: 'bg-violet-500', color: 'text-violet-500' },
    { title: '即将过期', value: expiringCount, icon: Clock, bgColor: 'bg-amber-500', color: 'text-amber-500' },
    { title: '分类数量', value: categories.length, icon: Pin, bgColor: 'bg-emerald-500', color: 'text-emerald-500' },
  ]

  const topLinks = [...links].sort((a, b) => b.click_count - a.click_count).slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">数据仪表盘</h1>
        <p className="text-gray-500 text-sm mt-1">实时监控链接数据和分析指标</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="glass rounded-2xl p-5 card-hover"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value.toLocaleString()}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center shadow-md`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>


        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">热门链接 Top 5</h3>
            <a href="/admin/resources" className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1 font-medium transition-colors cursor-pointer">
              查看全部 <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="space-y-2">
            {topLinks.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">暂无链接数据</p>
            ) : (
              topLinks.map((link, index) => (
                <a key={link.id} href={`/s/${link.slug}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-brand-50/50 transition-colors group cursor-pointer">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                    {index + 1}
                  </div>
                  {getLinkIcon(link)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate group-hover:text-brand-600 transition-colors text-sm">{link.title}</p>
                    <p className="text-xs text-gray-400">{link.category_name || categories.find(c => c.id === link.category_id)?.name || '未分类'}</p>
                  </div>
                </a>
              ))
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4">快捷操作</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <a href="/admin/resources" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white/50 hover:border-brand-200 hover:bg-brand-50/50 transition-all duration-200 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center"><Link2 className="w-5 h-5 text-brand-600" /></div>
            <div><p className="font-semibold text-gray-800 text-sm">添加链接</p><p className="text-xs text-gray-400">创建新分享</p></div>
          </a>
          <a href="/admin/data" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white/50 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all duration-200 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Download className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="font-semibold text-gray-800 text-sm">导出数据</p><p className="text-xs text-gray-400">CSV/Excel</p></div>
          </a>
          <a href="/admin/resources" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white/50 hover:border-violet-200 hover:bg-violet-50/50 transition-all duration-200 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Pin className="w-5 h-5 text-violet-600" /></div>
            <div><p className="font-semibold text-gray-800 text-sm">管理分类</p><p className="text-xs text-gray-400">自定义分类</p></div>
          </a>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white/50 hover:border-amber-200 hover:bg-amber-50/50 transition-all duration-200 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
            <div><p className="font-semibold text-gray-800 text-sm">过期提醒</p>
              <p className="text-xs text-gray-400">{expiringCount > 0 ? `${expiringCount} 个即将过期` : '无过期'}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
