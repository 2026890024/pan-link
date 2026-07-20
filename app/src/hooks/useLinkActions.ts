import { useCallback } from 'react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { checkLinkStatus, copyToClipboard, buildShareText } from '@/lib/utils'
import toast from 'react-hot-toast'

export interface UseLinkActionsOptions {
  /** 自定义分享链接生成（默认使用详情页 /s/:slug） */
  shareUrlFn?: (link: LinkItem) => string
  /** 复制成功后的回调（如设置 copiedId） */
  onCopied?: (linkId: string) => void
  /** 清除复制状态的回调 */
  onCopyClear?: () => void
}

/**
 * 跨页面共享的链接操作 hook
 * - isExpired: 判断链接是否过期
 * - shareLink: 统一分享行为（系统分享 or 复制到剪贴板）
 * - handleLinkClick: 点击链接（增加点击统计 + 新窗口打开）
 */
export function useLinkActions(options: UseLinkActionsOptions = {}) {
  const { incrementClicks } = useDataStore()
  const { shareUrlFn, onCopied, onCopyClear } = options

  const isExpired = useCallback((link: LinkItem) => {
    return checkLinkStatus(link.expires_at || null) === 'expired'
  }, [])

  const handleLinkClick = useCallback((link: LinkItem) => {
    incrementClicks(link.id)
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }, [incrementClicks])

  const shareLink = useCallback(async (link: LinkItem) => {
    const shareUrl = shareUrlFn
      ? shareUrlFn(link)
      : `${window.location.origin}/s/${link.slug}`
    const shareText = buildShareText(link.name, shareUrl, link.extract_code || undefined)

    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: shareText,
          url: shareUrl,
        })
      } catch {
        // 用户取消分享
      }
    } else {
      const success = await copyToClipboard(shareText)
      if (success) {
        toast.success('已复制分享内容')
        onCopied?.(link.id)
        setTimeout(() => onCopyClear?.(), 2000)
      } else {
        toast.error('复制失败')
      }
    }
  }, [shareUrlFn, onCopied, onCopyClear])

  return { isExpired, shareLink, handleLinkClick }
}
