import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 日期格式化
export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// 计算剩余天数
export function getDaysRemaining(expiresAt: string | Date | null): number | null {
  if (!expiresAt) return null
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diff = expiry.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// 格式化有效期
export function formatValidityPeriod(period: string): string {
  const map: Record<string, string> = {
    '1_month': '1个月',
    '3_months': '3个月',
    '6_months': '6个月',
    '1_year': '1年',
    'permanent': '永久',
  }
  return map[period] || period
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 降级方案
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  }
}

// 生成随机提取码
export function generateExtractCode(length = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 数字格式化
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// 链接状态检查
export function checkLinkStatus(expiresAt: string | Date | null): 'active' | 'expired' | 'expiring_soon' {
  if (!expiresAt) return 'active'
  
  const now = new Date()
  const expiry = new Date(expiresAt)
  const daysRemaining = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= 7) return 'expiring_soon'
  return 'active'
}

// 生成分享文本（网盘名称 + 链接 + 提取码）
export function buildShareText(name: string, url: string, extractCode?: string): string {
  const lines = [`【${name}】`, `链接：${url}`]
  if (extractCode) {
    lines.push(`提取码：${extractCode}`)
  }
  return lines.join('\n')
}

// 获取网盘图标
export function getPanIcon(categoryName: string): string {
  const icons: Record<string, string> = {
    '夸克网盘': 'https://img.icons8.com/color/144/quark--v1.png',
    '百度网盘': 'https://img.icons8.com/color/144/baidu.png',
    '阿里云盘': 'https://img.icons8.com/color/144/alibaba.png',
    '迅雷云盘': 'https://img.icons8.com/color/144/thunder.png',
    '腾讯微云': 'https://img.icons8.com/color/144/tencent.png',
    '115网盘': 'https://img.icons8.com/color/144/115.png',
    '移动云盘': 'https://img.icons8.com/color/144/china-mobile.png',
    '天翼云盘': 'https://img.icons8.com/color/144/tianyi.png',
  }
  return icons[categoryName] || 'https://img.icons8.com/color/144/cloud.png'
}
