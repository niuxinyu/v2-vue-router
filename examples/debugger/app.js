
import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const Home = {
    template: `<div>
<h1>Home</h1>
<router-view></router-view>    
</div>`
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
            redirect: '/home',
        },
        {
            path: '/home',
            name: 'home',
            component: Home,
            children: [
                {
                    path: 'home1',
                    component: Home1,
                }
            ],
        },
        {
            path: '/other',
            name: 'other',
            component: Other
        }
    ]
})

window.vm = new Vue({
    el: '#app',
    router,
    template: `
        <div id="app">
        <router-link to="/home">Home</router-link>
        <router-link to="/home/home1">Home1</router-link>
        <router-link to="/other">Other</router-link>
        <router-view></router-view>
        </div>
    `,
    created() {
        // console.log(this._router);
    }
})
