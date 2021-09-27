/* @flow */

import type VueRouter from './index'
import {resolvePath} from './util/path'
import {assert, warn} from './util/warn'
import {createRoute} from './util/route'
import {fillParams} from './util/params'
import {createRouteMap} from './create-route-map'
import {normalizeLocation} from './util/location'
import {decode} from './util/query'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
  addRoute: (parentNameOrRoute: string | RouteConfig, route?: RouteConfig) => void;
  getRoutes: () => Array<RouteRecord>;
};

export function createMatcher(
  routes: Array<RouteConfig>, // 初始化传入的 options.routes
  router: VueRouter // VueRouter
): Matcher {
  // 创建 path map、name map 路由表 等
  const {pathList, pathMap, nameMap} = createRouteMap(routes)

  function addRoutes(routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  function addRoute(parentOrRoute, route) {
    const parent = (typeof parentOrRoute !== 'object') ? nameMap[parentOrRoute] : undefined
    // $flow-disable-line
    createRouteMap([route || parentOrRoute], pathList, pathMap, nameMap, parent)

    // add aliases of parent
    if (parent && parent.alias.length) {
      createRouteMap(
        // $flow-disable-line route is defined if parent is
        parent.alias.map(alias => ({path: alias, children: [route]})),
        pathList,
        pathMap,
        nameMap,
        parent
      )
    }
  }

  function getRoutes() {
    return pathList.map(path => pathMap[path])
  }

  function match(
    raw: RawLocation, // 路径 或者 ？？？
    currentRoute?: Route, // 当前路由
    redirectedFrom?: Location // 重定向自
  ): Route {
    // 规范化浏览第地址栏内的路径
    const location = normalizeLocation(raw, currentRoute, false, router)

    // 解构出 name 属性
    const {name} = location

    if (name) {
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location)
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      // 如果 path 存在
      // 设置 params 为空对象
      location.params = {}
      // 遍历用户定义的 routes 生成的 pathList
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        // 判断 浏览第地址栏内的 path 和 用户定义的路由是否能够匹配
        if (matchRoute(record.regex, location.path, location.params)) {
          // 如果能够匹配
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }

  function redirect(
    record: RouteRecord,
    location: Location
  ): Route {

    // 缓存重定向的路径名/路由名
    const originalRedirect = record.redirect

    // 判断重定向是否为一个函数
    // 如果是一个函数的话，将 createRoute 函数的返回作为其参数调用
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    // 如果 redirect 是一个字符串的话，设置其为 对象格式
    if (typeof redirect === 'string') {
      redirect = {path: redirect}
    }

    // 如果 redirect 为 falsy 值 或者 redirect 不是对象
    if (!redirect || typeof redirect !== 'object') {
      // 开发环境洗提示不合法的 redirect 值
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    // 判断 redirect 是否有这些属性，如果有的话，覆盖从 window.location 中提取出来的对应属性
    const re: Object = redirect
    const {name, path} = re
    let {query, hash, params} = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    // 是否有 name 属性 或者是否有 path 属性
    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    }
    else if (path) {
      // 1. resolve relative redirect
      // 解析处理过的单一路由的路径
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      // 处理 params 参数
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      //
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias(
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  function _createRoute(
    record: ?RouteRecord, // 处理过的单个路由 或者 null
    location: Location, // 浏览器地址栏内路径
    redirectedFrom?: Location // 重定向自
  ): Route {
    // 如果 单个路由存在 并且 单个路由内有重定向标志
    if (record && record.redirect) {
      // 处理重定向
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      // 如果有路由别名
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoute,
    getRoutes,
    addRoutes
  }
}

/**
 * @desc 匹配路由
 * */
function matchRoute(
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = typeof m[i] === 'string' ? decode(m[i]) : m[i]
    }
  }

  return true
}

function resolveRecordPath(path: string /** 重定向路径 **/, record: RouteRecord /* 处理后的单一路由 */): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
