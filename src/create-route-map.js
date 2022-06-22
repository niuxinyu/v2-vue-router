/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

/**
 * @desc 根据 routes 构建 route 映射对象 设置和初始化其他属性
 * */
export function createRouteMap (
  routes: Array<RouteConfig>, // routes 信息对象 e.g 初始化时用户传入的 routes
  oldPathList?: Array<string>, // 初始化时为 undefined
  oldPathMap?: Dictionary<RouteRecord>, // 初始化时为 undefined
  oldNameMap?: Dictionary<RouteRecord>, // 初始化时为 undefined
  parentRoute?: RouteRecord // 初始化时为 undefined
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {

  // 路径列表 e.g ['/hone', '/other']
  const pathList: Array<string> = oldPathList || []

  // 以 path 为键的 路由对象 e.g { '/home': {} }
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)

  // 以 name 为键的 路由对象 e.g { home: {} }
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 遍历 options.routes 生成路由对象
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })


  // 确保通配符的总是放在最后边
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // 检查是否路由是否缺少 /
    // e.g 比如 redirect / -> /other 在处理的时候， / 会被处理为 ''
    const found = pathList
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}

function addRouteRecord (
  pathList: Array<string>, // 路由路径数组 初始化为 []
  pathMap: Dictionary<RouteRecord>, // path 为键的 map 初始化为 {}
  nameMap: Dictionary<RouteRecord>, // name 为键的 map 初始化为 {}
  route: RouteConfig, // 单个路由配置
  parent?: RouteRecord, // 初始化为 undefined
  matchAs?: string // 用在路由别名中 初始化为 undefined
) {

  const { path, name } = route

  // 一些警告信息
  // component 不能为组件名称或者组件id，必须是组件对象本身或者是一个异步函数
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    // 非 ASCII 字符，比如空格 %等
    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }

  // 用户自定义路径的正则选项
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}

  // 规范化 path
  // 非严格模式去除路径最后的 /
  // 总体的作用就是去除路径中多余的 /
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  // 匹配规则是否大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 定义每个路由的基本结构，用户没有传入的值在这里进行初始化
  const record: RouteRecord = {
    path: normalizedPath, // 规范化后的 path
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // 根据路径创建一个正则
    components: route.components || { default: route.component }, // 设置组件
    alias: route.alias // 路径别名
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name, // 路由名字
    parent,
    matchAs,
    redirect: route.redirect, // 重定向路由
    beforeEnter: route.beforeEnter, // 路由内的钩子函数
    meta: route.meta || {}, // 元信息
    props: // props
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  if (route.children) {
    // 这里判断
    // 如果路由被命名了且不包含重定向且子路由有默认路径 类似 \
    // 那么在通过 name 导航到副路由的时候，子路由将不会被渲染

    // TODO 带有 redirect 的路由的 children 不会被处理
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${
              route.name
            }'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }
    // 递归处理 route.children
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 如果 path 在 pathMap 中不存在
  // 分别在 pathList 和 pathMap 中保存一次
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  // 如果路由别名存在
  if (route.alias !== undefined) {
    // 规范化别名，最终规范化为一个数组
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]

    // 遍历这个别名数组
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]
      // 开发环境下，别名和路径一样会抛出警告
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      // 定义一个别名路由
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      // 添加一个新的路由记录
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // 如果 name 属性存在
  if (name) {
    // 存储到 name map 中
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      // 开发环境下，重名路由
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}
/**
 * @desc 生成路由的正则表达式
 * */
function compileRouteRegex (
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)

  if (process.env.NODE_ENV !== 'production') {
    // 这里不允许路由路径重复
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

/**
 * @desc 如果是非严格模式的路由 去除路径末尾的 / ,eg: /home/ -> /home
 * */
function normalizePath (
  path: string,
  parent?: RouteRecord, // 父级
  strict?: boolean // 默认为 undefined
): string {
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path // 如果 / 开头 为父路由
  if (parent == null) return path
  return cleanPath(`${parent.path}/${path}`)
}
