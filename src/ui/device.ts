export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod|iPad/.test(ua)) return true
  // iPadOS 13+ reports as Macintosh
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isMobileUi(): boolean {
  if (typeof window === 'undefined') return false
  if (isIos()) return true
  if (window.matchMedia('(max-width: 900px)').matches) return true
  return window.matchMedia('(pointer: coarse) and (max-width: 1100px)').matches
}

/** Toggle `.is-mobile` and track keyboard occlusion via the visual viewport. */
export function syncMobileChrome(): () => void {
  const root = document.documentElement

  const apply = () => {
    root.classList.toggle('is-mobile', isMobileUi())
    const vv = window.visualViewport
    if (!vv) {
      root.style.setProperty('--keyboard', '0px')
      return
    }
    const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    root.style.setProperty('--keyboard', `${Math.round(occluded)}px`)
  }

  apply()
  const mq = window.matchMedia('(pointer: coarse), (max-width: 1100px)')
  mq.addEventListener('change', apply)
  window.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)
  return () => {
    mq.removeEventListener('change', apply)
    window.removeEventListener('resize', apply)
    window.visualViewport?.removeEventListener('resize', apply)
    window.visualViewport?.removeEventListener('scroll', apply)
  }
}
