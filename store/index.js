import Vue from 'vue';
import Vuex from 'vuex';
import user from './modules/user'; // 引入用户模块

Vue.use(Vuex);

const store = new Vuex.Store({
    modules: {
        user // 注册用户模块
    }
});

export default store;