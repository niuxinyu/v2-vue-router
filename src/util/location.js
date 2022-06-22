/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

export function normalizeLocation (
  raw: RawLocation, // 路径 或者 ？？？
  current: ?Route, // 当前路由
  append: ?boolean, // 是否为添加 ？？？
  router: ?VueRouter // VueRouter
): Location {

  // 格式化字符串路径为对象格式
  let next: Location = typeof raw === 'string' ? { path: raw } : raw

  // named target
  if (next._normalized) {
    return next
  } else if (next.name) {
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // 处理原始路径 分离 出 path、hash、query
  const parsedPath = parsePath(next.path || '')

  //
  const basePath = (current && current.path) || '/'


  // 处理一些边界情况并返回 path
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // 解析 query 参数
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true, // 是否已经经过格式化处理的标识
    path,
    query,
    hash
  }
}
