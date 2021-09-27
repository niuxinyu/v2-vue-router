
import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const Home = {
    template: `<h1>Home</h1>`
}
const Home1 = {
    template: `<p>Home1</p>`
}
const Other = Vue.extend({
    template: `<h1>Other</h1>`,
})

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
            path: '/home/:id?',
            name: 'home',
            component: Home
            // components: {
            //     default: Home,
            //     Home1
            // }
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

window.vm = new Vue({
    el: '#app',
    router,
    template: `
        <div id="app">
        <router-link to="/home">Home</router-link>
        <router-link to="/other">Other</router-link>
        <router-view></router-view>
        <router-view name="Home1"></router-view>
        </div>
    `,
})
