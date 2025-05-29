import App from './App'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
import store from './store'; // 引入 store
Vue.config.productionTip = false
App.mpType = 'app'
// 将 store 挂载到 Vue 原型上，方便在各个组件中通过 this.$store 访问
Vue.prototype.$store = store;
const app = new Vue({
	...App,
	store // 将 store 注入到 Vue 实例中
})

app.$mount()
// #endif

// #ifdef VUE3
import {
	createSSRApp
} from 'vue'
export function createApp() {
	const app = createSSRApp(App)
	return {
		app
	}
}
// #endif