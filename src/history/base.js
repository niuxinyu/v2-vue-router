/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, isSameRoute, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation, onComplete?: Function, onAbort?: Function) => void
  +replace: (
    loc: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    // 具体实现的路由实例 e.g hash 下的路由实例
    this.router = router

    // 格式化路由根路径
    this.base = normalizeBase(base)

    // start with a route object that stands for "nowhere"
    this.current = START

    // 等待跳转的路由
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  // 切换路由
  transitionTo (
    location: RawLocation, // 跳转之前的地址
    onComplete?: Function, // 完成之后的回调
    onAbort?: Function // 跳转中止的回调
  ) {
    // 和当前地址匹配的路由信息对象
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    try {
      // 从注册的路由表列找出和当前给定的 location 匹配的路由
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      throw e
    }

    // 跳转之前，将当前路由保存为上次路由
    const prev = this.current

    // 确定跳转
    this.confirmTransition(
      route,
      () => {
        // 全部的钩子执行完毕之后，开始更新路由
        this.updateRoute(route)
        // 如果存在 onComplete 回调，传入 当前路由调用之
        onComplete && onComplete(route)
        // 确定路由 修改路由
        this.ensureURL()
        // 执行 afterHook
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    // 跳转中 将当前路由缓存
    const current = this.current

    // 当前正在处理的路由
    this.pending = route

    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }

    // 最后一个匹配的路由
    const lastRouteIndex = route.matched.length - 1

    // 当前路由的最后一个匹配
    const lastCurrentIndex = current.matched.length - 1

    // 如果是同一个路由
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      // 中止
      return abort(createNavigationDuplicatedError(current, route))
    }

    // 在 route.matched 中找到 将要更新的 updated 路由和 将要激活的路由 activated
    // 在 this.current.matched 也就是上一次的路由 中找到即将失活的路由 deactivated
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    //
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated), // components 注册的组件内部 deactivated 生命周期函数
      // global before hooks
      this.router.beforeHooks, // 全局 beforeEach 函数
      // in-component update hooks
      extractUpdateHooks(updated), // components 注册的组件内部 update 生命周期函数
      // in-config enter guards
      activated.map(m => m.beforeEnter), // 将要跳转的组件内 beforeEnter 守卫函数
      // async components
      resolveAsyncComponents(activated) // 异步组件解析钩子
    )

    // 依次调用各种守卫
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        // to from next
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // 执行各种钩子函数
    runQueue(queue, iterator, () => {
      // wait until async components are resolved before
      // extracting in-component enter guards
      // queue 中的钩子全部执行完毕，执行这个回调函数

      const enterGuards = extractEnterGuards(activated)

      const queue = enterGuards.concat(this.router.resolveHooks)

      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        // 钩子全部执行完毕之后释放 this.pending
        this.pending = null
        // 执行传入的 onComplete，并将 传入的 route 传回
        // onComplete 执行完毕之后页面的路由已经发生了变化
        onComplete(route)

        // 如果 Vue 实例存在
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            handleRouteEntered(route)
          })
        }
      })
    })
  }

  updateRoute (route: Route) {
    // 将当前路由保存到 this.current 上
    this.current = route
    // 如果注册有 cb 函数则执行
    this.cb && this.cb(route)
  }

  setupListeners () {
    // Default implementation is empty
  }

  teardown () {
    // clean up event listeners
    // https://github.com/vuejs/vue-router/issues/2341
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    // reset current history route
    // https://github.com/vuejs/vue-router/issues/3294
    this.current = START
    this.pending = null
  }
}

/**
 * @desc 格式化根路径
 * */
function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>, // 当前路由
  next: Array<RouteRecord> // 将跳转的下一个路由
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  // 找到两个 matched 中不同的路由
  // matched 多个的情况 例如从父路由向子路由跳转
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

// 提取路由守卫
function extractGuards (
  records: Array<RouteRecord>, // 处理过的单个路由
  name: string, // 需要处理的守卫的名字
  bind: Function,
  reverse?: boolean // 是否倒序 默认为 true
): Array<?Function> {
  // 扁平化 components 组件选项，如果没有 components 选项，这里返回一个空数组
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })

  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
