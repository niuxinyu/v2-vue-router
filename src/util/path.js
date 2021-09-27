/* @flow */

export function resolvePath (
  relative: string, // 处理后的绝对路径
  base: string, // 路由 base
  append?: boolean // 是否为添加 ??
): string {
  // 取路径的第一个字符
  const firstChar = relative.charAt(0)
  // 如果是 / 直接返回
  if (firstChar === '/') {
    return relative
  }

  // 如果 第一个字符是 ? 或者 #，拼接上基础路径 base 后返回
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  // 将路径按照 / 分割
  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  // 如果不是添加 或者 路径的后边为空 则删除掉 / 后的
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  // 解析绝对路径 暂时没遇到 case
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

export function parsePath (path: string): {
  path: string; // 路径
  query: string;
  hash: string;
} {

  let hash = ''

  let query = ''

  // hash 路由开始位置
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  // 传参标识 ? 开始位置
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    // 如果 ? 存在 将问号后的数据保存到 query 上
    query = path.slice(queryIndex + 1)
    // ? 后的从原 path 中截掉
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}

/**
 * @desc 去除路径中多余的 /
 * */
export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
