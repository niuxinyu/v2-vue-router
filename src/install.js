import View from './components/view'
import Link from './components/link'

// 保存 Vue 实例
export let _Vue

export function install(Vue) {
  // 检查是否已经注册过 VueRouter 如果注册过直接返回
  if (install.installed && _Vue === Vue) return
  // 设置静态属性 installed
  install.installed = true

  _Vue = Vue

  // 工具函数 判断值是否为 unfettered
  const isDef = v => v !== undefined

  // 暂时未知
  const registerInstance = (vm, callVal) => {
    // 这里我们知道只有非 根实例 才会有 _parentVnode 属性
    let i = vm.$options._parentVnode
    // 所以这里的条件是
    // 如果 是子组件； 如果 组件的 data 选项存在，我们知道组件的 data 选项内定义了组件的 attrs 和一些 hook； 如果 data 内定义了 registerRouteInstance
    // 函数，则调用它，并且传入的参数都是 Vue实例
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 全局混入
  // 我们知道 全局混入将会混入到之后创建的所有的 Vue 实例
  Vue.mixin({
    beforeCreate() {
      // 如果 this.$options.router 存在
      if (isDef(this.$options.router)) {
        // 将当前Vue实例保存到 _routerRoot 属性上
        this._routerRoot = this
        // 将 this.$options.router 保存到 this._router 属性上
        this._router = this.$options.router
        // 调用 router 的 init 方法
        this._router.init(this)
        // 通过 Vue 暴露出来的 defineReactive 方法，将当前路由定义到 this._route 属性上，并且使其成为响应式的
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 如果 this.$options.router 不存在，依旧将当前Vue实例保存到 this._routerRoot 上
        // 当用户调用了 Vue.use(VueRouter) 但是没有传入 router 选项的时候会走这个分支
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }

      registerInstance(this, this)
    },
    destroyed() {
      registerInstance(this)
    }
  })


  Object.defineProperty(Vue.prototype, '$router', {
    get() {
      return this._routerRoot._router
    }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get() {
      return this._routerRoot._route
    }
  })

  // 注册全局组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 自定义合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // 为 beforeRouteEnter、beforeRouteLeave、beforeRouteUpdate 这三个钩子使用 create 选项的合并策略
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
