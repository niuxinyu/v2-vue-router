// 将 b 对象内的值拓展到 a 对象上
export function extend (a, b) {
  for (const key in b) {
    a[key] = b[key]
  }
  return a
}
