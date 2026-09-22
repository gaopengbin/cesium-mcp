import english from './messages-en.json'

export type Locale = 'zh-CN' | 'en'
export function resolveLocale(query: string | null, saved: string | null, browser = 'zh-CN'): Locale {
  const candidate = query ?? saved ?? browser
  return candidate.toLowerCase().startsWith('en') ? 'en' : 'zh-CN'
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN'
  let saved: string | null = null
  try { saved = localStorage.getItem('cesium-jev-language') } catch { /* Storage may be disabled. */ }
  return resolveLocale(new URLSearchParams(location.search).get('lang'), saved, navigator.language)
}

export const locale = initialLocale()
export function translate(message: string, language: Locale, ...values: unknown[]): string {
  const template = language === 'en' ? (english as Record<string, string>)[message] ?? message : message
  return template.replace(/\{(\d+)\}/g, (placeholder, index) => Number(index) < values.length ? String(values[Number(index)]) : placeholder)
}
export function t(message: string, ...values: unknown[]): string {
  return translate(message, locale, ...values)
}

export function localizeError(message: string): string {
  if (locale === 'en') return t(message)
  const errors: Record<string, string> = {
    'The public demo has reached its daily model quota. Please try tomorrow.': '今日在线体验额度已用完，请明天再试。',
    'This connection has reached the hourly demo limit. Please try later.': '当前网络已达到每小时体验额度，请稍后再试。',
    'The public demo is busy. Please try later.': '当前体验人数较多，请稍后再试。',
    'A Jev decision is already running': '当前模型请求较多，请稍后重新开始。',
    'Jev request timed out or was cancelled': 'Jev 请求超时或已取消。',
    'Jev request failed or returned an invalid decision': 'Jev 请求失败或返回了无效决策。',
    'Invalid or stale world observation': '场景观测无效或已过期，请重新开始。',
  }
  if (/^Jev upstream returned HTTP \d+$/.test(message)) return 'Jev 服务暂时不可用，请稍后重新开始。'
  return errors[message] ?? message
}

/** Translate the authored markup once; dynamic text uses t() at its source. */
export function initializeLanguage(): void {
  document.documentElement.lang = locale
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script, style')) continue
    const text = node.textContent ?? ''
    const key = text.trim()
    if (key in english) node.textContent = text.replace(key, t(key))
  }
  for (const element of document.querySelectorAll('[label], [summary], [hint], [placeholder], [aria-label]')) {
    for (const name of ['label', 'summary', 'hint', 'placeholder', 'aria-label']) {
      const value = element.getAttribute(name)
      if (value && value in english) element.setAttribute(name, t(value))
    }
  }
  document.title = t('Cesium × Jev · 城市漫游')
  const switcher = document.getElementById('languageSwitch')!
  switcher.textContent = locale === 'en' ? '中文' : 'English'
  switcher.setAttribute('aria-label', locale === 'en' ? '切换到中文' : 'Switch to English')
  switcher.addEventListener('click', () => {
    const next: Locale = locale === 'en' ? 'zh-CN' : 'en'
    try { localStorage.setItem('cesium-jev-language', next) } catch { /* URL remains shareable. */ }
    const url = new URL(location.href)
    url.searchParams.set('lang', next)
    location.assign(url.href)
  })
}
