/**
 * 认证 Hook - 云API + 本地回退
 * 当云API未配置时，使用本地配置的账号密码
 */
import { useState, useEffect, useCallback } from 'react'
import { isCloudApiConfigured } from '@/services/dataService'
import { AUTH_CONFIG } from '@/config/auth'
import { fastHash, fastVerify } from '@/lib/crypto'

export function useAuth() {
  const [user, setUser] = useState<null>(null)
  const [loading, setLoading] = useState(true)
  const [localAuthed, setLocalAuthed] = useState(() => {
    try { return sessionStorage.getItem('admin_authed') === 'true' } catch { return false }
  })

  useEffect(() => {
    if (!isCloudApiConfigured()) {
      setLoading(false)
      return
    }

    // 云模式：直接标记为已加载（后续可接入云认证）
    setLoading(false)
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    // ========== 本地默认管理员凭证验证（所有模式都支持）==========
    let authUsername = AUTH_CONFIG.username
    let authPasswordHash: string | null = fastHash(AUTH_CONFIG.password)
    
    try {
      const stored = localStorage.getItem('admin_auth_config')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.username) authUsername = parsed.username
        if (parsed.passwordHash) {
          authPasswordHash = parsed.passwordHash
        } else if (parsed.password) {
          authPasswordHash = fastHash(parsed.password)
          try {
            localStorage.setItem('admin_auth_config', JSON.stringify({
              username: authUsername,
              passwordHash: authPasswordHash,
            }))
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    
    // 验证本地管理员账号
    if (username === authUsername && fastVerify(password, authPasswordHash || '')) {
      setLocalAuthed(true)
      sessionStorage.setItem('admin_authed', 'true')
      return true
    }

    // 云模式：可以扩展云认证逻辑
    if (!isCloudApiConfigured()) {
      return false
    }

    // 未来：可接入 Worker API 的认证
    return false
  }, [])

  const logout = useCallback(async () => {
    setLocalAuthed(false)
    sessionStorage.removeItem('admin_authed')
    // 清除云认证状态
  }, [])

  const isAuthenticated = localAuthed || (isCloudApiConfigured() && !!user)

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    isCloudMode: isCloudApiConfigured(),
  }
}
