/**
 * 动态配色工具
 * 根据主色自动生成完整的 brand 色阶，注入 CSS 自定义属性
 */

// 将 hex 颜色转为 HSL
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0
  hex = hex.replace(/^#/, '')
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255
    g = parseInt(hex[1] + hex[1], 16) / 255
    b = parseInt(hex[2] + hex[2], 16) / 255
  } else {
    r = parseInt(hex.substring(0, 2), 16) / 255
    g = parseInt(hex.substring(2, 4), 16) / 255
    b = parseInt(hex.substring(4, 6), 16) / 255
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// HSL 转 hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// 从主色生成完整色阶
function generateShades(primaryHex: string): Record<string, string> {
  const hsl = hexToHSL(primaryHex)
  return {
    '50': hslToHex(hsl.h, Math.max(20, hsl.s - 60), Math.min(98, hsl.l + 30)),
    '100': hslToHex(hsl.h, Math.max(15, hsl.s - 50), Math.min(96, hsl.l + 22)),
    '200': hslToHex(hsl.h, Math.max(10, hsl.s - 35), Math.min(93, hsl.l + 15)),
    '300': hslToHex(hsl.h, Math.max(5, hsl.s - 15), Math.min(88, hsl.l + 8)),
    '400': hslToHex(hsl.h, hsl.s, Math.min(82, hsl.l + 3)),
    '500': hslToHex(hsl.h, hsl.s, hsl.l),
    '600': primaryHex,
    '700': hslToHex(hsl.h, hsl.s, Math.max(15, hsl.l - 12)),
    '800': hslToHex(hsl.h, hsl.s, Math.max(8, hsl.l - 22)),
    '900': hslToHex(hsl.h, hsl.s, Math.max(5, hsl.l - 32)),
    '950': hslToHex(hsl.h, hsl.s, Math.max(3, hsl.l - 42)),
  }
}

// 将配色注入到 CSS 自定义属性
let styleEl: HTMLStyleElement | null = null

export function applyBrandColors(primary: string): void {
  const shades = generateShades(primary)

  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'dynamic-brand-colors'
    document.head.appendChild(styleEl)
  }

  let css = ':root {\n'
  for (const [key, value] of Object.entries(shades)) {
    css += `  --brand-${key}: ${value};\n`
  }
  css += '}\n'

  // 覆盖 Tailwind brand 颜色类
  css += `
.bg-brand-50 { background-color: ${shades['50']} !important; }
.bg-brand-100 { background-color: ${shades['100']} !important; }
.bg-brand-200 { background-color: ${shades['200']} !important; }
.bg-brand-300 { background-color: ${shades['300']} !important; }
.bg-brand-400 { background-color: ${shades['400']} !important; }
.bg-brand-500 { background-color: ${shades['500']} !important; }
.bg-brand-600 { background-color: ${shades['600']} !important; }
.bg-brand-700 { background-color: ${shades['700']} !important; }
.bg-brand-800 { background-color: ${shades['800']} !important; }
.bg-brand-900 { background-color: ${shades['900']} !important; }

.text-brand-50 { color: ${shades['50']} !important; }
.text-brand-100 { color: ${shades['100']} !important; }
.text-brand-200 { color: ${shades['200']} !important; }
.text-brand-300 { color: ${shades['300']} !important; }
.text-brand-400 { color: ${shades['400']} !important; }
.text-brand-500 { color: ${shades['500']} !important; }
.text-brand-600 { color: ${shades['600']} !important; }
.text-brand-700 { color: ${shades['700']} !important; }
.text-brand-800 { color: ${shades['800']} !important; }
.text-brand-900 { color: ${shades['900']} !important; }

.border-brand-50 { border-color: ${shades['50']} !important; }
.border-brand-100 { border-color: ${shades['100']} !important; }
.border-brand-200 { border-color: ${shades['200']} !important; }
.border-brand-300 { border-color: ${shades['300']} !important; }
.border-brand-400 { border-color: ${shades['400']} !important; }
.border-brand-500 { border-color: ${shades['500']} !important; }
.border-brand-600 { border-color: ${shades['600']} !important; }
.border-brand-700 { border-color: ${shades['700']} !important; }
.border-brand-800 { border-color: ${shades['800']} !important; }
.border-brand-900 { border-color: ${shades['900']} !important; }

.hover\\:bg-brand-50:hover { background-color: ${shades['50']} !important; }
.hover\\:bg-brand-100:hover { background-color: ${shades['100']} !important; }
.hover\\:text-brand-600:hover { color: ${shades['600']} !important; }
.hover\\:text-brand-700:hover { color: ${shades['700']} !important; }
.hover\\:bg-brand-600:hover { background-color: ${shades['600']} !important; }
.hover\\:bg-brand-700:hover { background-color: ${shades['700']} !important; }

.focus\\:ring-brand-300:focus { --tw-ring-color: ${shades['300']} !important; }
.focus\\:border-brand-300:focus { border-color: ${shades['300']} !important; }
`

  styleEl.textContent = css
}

// 获取品牌色梯度值
export { generateShades, hexToHSL, hslToHex }

// 从主色自动生成完整配色方案（辅色/强调色/最浅色/最深色）
export function generatePaletteFromPrimary(primaryHex: string): {
  secondary: string
  accent: string
  lightest: string
  darkest: string
} {
  const hsl = hexToHSL(primaryHex)
  const { h, s, l } = hsl

  // 辅色：同色相，亮度+15，饱和度×0.75
  const secondary = hslToHex(h, Math.round(s * 0.75), Math.min(92, l + 15))

  // 强调色：更浅，亮度+28，饱和度×0.55
  const accent = hslToHex(h, Math.round(s * 0.55), Math.min(95, l + 28))

  // 最浅色：接近白色，带色相色调，亮度+40，饱和度极低
  const lightest = hslToHex(h, Math.round(s * 0.12), Math.min(97, l + 40))

  // 最深色：更深更浓，亮度-30，饱和度×1.1（上限95）
  const darkest = hslToHex(h, Math.min(95, Math.round(s * 1.1)), Math.max(12, l - 30))

  return { secondary, accent, lightest, darkest }
}
