import Vue from 'vue'
import VueRouter from '../../dist/vue-router.js'

Vue.use(VueRouter)

const Home = {
    template: `<h1>Home</h1>`
}
const Other = {
    template: `<h1>Other</h1>`
}

const router = new VueRouter({
    // mode: 'history',
    mode: 'hash',
    base: __dirname,
    routes: [
        {
            path: '/',
            redirect: function () {
                console.log(arguments)
                return '/home'
            }
        },
        {
            path: '/home',
            name: 'home',
            component: Home
        },
        {
            path: '/other',
            name: 'other',
            component: Other
        }
    ]
})

// router.beforeEach((from , to, next) => {
//     console.log(666);
//     next()
// })

new Vue({
    el: '#app',
    router,
    template: `
        <div id="app">
        <router-link to="/home">Home</router-link>
        <router-link to="/other">Other</router-link>
        <router-view></router-view>
        </div>
    `,
})
