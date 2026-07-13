/**
 * 认证 Hook - 云API + 本地回退
 * 优先通过 Pages Functions API 登录，失败时回退到本地 SHA-256 校验
 */
import { useState, useEffect, useCallback } from 'react'
import { isCloudApiConfigured, API_BASE } from '@/services/dataService'
import { AUTH_CONFIG } from '@/config/auth'
import { hashPassword, verifyPassword } from '@/lib/crypto'

export function useAuth() {
  const [loading, setLoading] = useState(true)
  const [localAuthed, setLocalAuthed] = useState(() => {
    try { return sessionStorage.getItem('admin_authed') === 'true' } catch { return false }
  })
  const [cloudToken, setCloudToken] = useState(() => {
    try { return sessionStorage.getItem('admin_token') } catch { return null }
  })

  useEffect(() => { setLoading(false) }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    // ========== 先尝试云端 API 登录 ==========
    if (isCloudApiConfigured()) {
      try {
        const resp = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (resp.ok) {
          const data = await resp.json()
          if (data.token) {
            setCloudToken(data.token)
            sessionStorage.setItem('admin_token', data.token)
            setLocalAuthed(true)
            sessionStorage.setItem('admin_authed', 'true')
            return true
          }
        }
        // 401 = 凭证错误，返回 false 让用户看到错误提示
        if (resp.status === 401) return false
        // 其他错误（如 API 未配置环境变量）回退到本地
      } catch {
        // 网络错误，回退到本地
      }
    }

    // ========== 本地回退：SHA-256 校验 ==========
    let authUsername = AUTH_CONFIG.username
    let authPasswordHash: string | null = null

    if (!authUsername) {
      // 默认凭证未配置，检查 localStorage 自定义配置
      try {
        const stored = localStorage.getItem('admin_auth_config')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.username) authUsername = parsed.username
          if (parsed.passwordHash) {
            authPasswordHash = parsed.passwordHash
          } else if (parsed.password) {
            authPasswordHash = await hashPassword(parsed.password)
            localStorage.setItem('admin_auth_config', JSON.stringify({
              username: authUsername,
              passwordHash: authPasswordHash,
            }))
          }
        }
      } catch { /* ignore */ }
    }

    if (!authUsername || !authPasswordHash) {
      // 完全没有配置任何凭证
      return false
    }

    if (username === authUsername && await verifyPassword(password, authPasswordHash)) {
      setLocalAuthed(true)
      sessionStorage.setItem('admin_authed', 'true')
      return true
    }

    return false
  }, [])

  const logout = useCallback(() => {
    setLocalAuthed(false)
    setCloudToken(null)
    sessionStorage.removeItem('admin_authed')
    sessionStorage.removeItem('admin_token')
  }, [])

  const isAuthenticated = localAuthed

  return {
    loading,
    isAuthenticated,
    login,
    logout,
    isCloudMode: isCloudApiConfigured() && !!cloudToken,
  }
}
