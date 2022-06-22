/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      const current = this.current
      if (!ensureSlash()) {
        return
      }
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          handleScroll(this.router, route, current, true)
        }
        if (!supportsPushState) {
          replaceHash(route.fullPath)
        }
      })
    }

    const eventType = supportsPushState ? 'popstate' : 'hashchange'

    window.addEventListener(
      eventType,
      handleRoutingEvent
    )

    this.listeners.push(() => {
      window.removeEventListener(eventType, handleRoutingEvent)
    })
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    window.history.go(n)
  }

  ensureURL (push?: boolean) {
    // 从 Base 类中获取当前路由的完整路径
    const current = this.current.fullPath
    // 如果浏览器地址栏路径和当前需要跳转的路径不同，则跳转到 current 路由
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  /**
   * @desc 获取当前浏览器地址中的 hash 部分
   * */
  getCurrentLocation () {
    return getHash()
  }
}

function checkFallback (base) {
  const location = getLocation(base)
  if (!/^\/#/.test(location)) {
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

/**
 * @desc 确保 hash 部分一定是以 / 开始的
 * */
function ensureSlash (): boolean {
  // 获取 hash 部分
  const path = getHash()
  if (path.charAt(0) === '/') {
    return true
  }
  replaceHash('/' + path)
  return false
}

/**
 * @desc 获取当前路由 hash 部分
 * */
export function getHash (): string {
  // 这里不使用 window.location.hash 的原因是在不同浏览器下实现不一致，Firefox 会对其预解码

  let href = window.location.href // http://xxx/#/abc/

  const index = href.indexOf('#')

  if (index < 0) return ''

  href = href.slice(index + 1) // -> /abc/

  return href
}

function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

/**
 * @desc 替换路由
 * */
function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
