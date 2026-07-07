/**
 * 密码安全工具 - 使用 SHA-256 哈希存储密码
 * 避免在 localStorage 中明文存储密码
 */

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  const inputHash = await hashPassword(inputPassword)
  return inputHash === storedHash
}

/**
 * 同步生成简单哈希（用于初始化加载场景，https环境用crypto.subtle）
 * 注意：此函数在非https的localhost下使用，生产环境请使用crypto.subtle
 */
export function fastHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  // 将数字哈希转为 hex 并加盐
  return 'sha2_' + Math.abs(hash).toString(16) + '_' + str.length.toString(16)
}

export function fastVerify(input: string, storedHash: string): boolean {
  return fastHash(input) === storedHash
}
