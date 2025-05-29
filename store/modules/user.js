// store/modules/user.js
console.log(uni.getStorageSync('userInfo'))
const state = {
	token: uni.getStorageSync('userToken') || null,
	// uni.getStorageSync 返回的是字符串，需要JSON.parse，且要处理空值情况

	// userInfo: uni.getStorageSync('userInfo') ? JSON.parse(uni.getStorageSync('userInfo')) : {}
	userInfo: uni.getStorageSync('userInfo') ? uni.getStorageSync('userInfo') : {}
};

const mutations = {
	SET_TOKEN(state, token) {
		state.token = token;
		uni.setStorageSync('userToken', token);
	},
	SET_USER_INFO(state, userInfo) {
		state.userInfo = userInfo;
		// 存储时确保是字符串
		uni.setStorageSync('userInfo', JSON.stringify(userInfo));
	},
	CLEAR_AUTH(state) {
		state.token = null;
		state.userInfo = {};
		uni.removeStorageSync('userToken');
		uni.removeStorageSync('userInfo');
	}
};

const actions = {
	// 登录成功后调用
	loginSuccess({
		commit
	}, authData) {
		// authData 应该包含 { token: 'xxx', info: { _id: '...', username: '...', role: '...' } }
		commit('SET_TOKEN', authData.token);
		commit('SET_USER_INFO', authData.info);
	},
	// 退出登录
	logout({
		commit
	}) {
		commit('CLEAR_AUTH');
		// 跳转到登录页
		uni.reLaunch({
			url: '/pages/login/login'
		});
	},
	// 检查登录状态，在需要权限的页面或全局路由守卫中调用
	checkLoginState({
		state,
		dispatch
	}) {
		if (!state.token) {
			console.log('用户未登录或Token失效，执行登出逻辑');
			dispatch('logout'); // 会跳转到登录页
			return false;
		}
		// 可选：未来可在此处添加一个对 account-center 的 checkAuth 调用，以服务器验证 Token 有效性
		console.log('用户已登录，Token:', state.token);
		return true;
	}
};

const getters = {
	isLoggedIn: state => !!state.token,
	currentUser: state => state.userInfo,
	userRole: state => state.userInfo.role || null,
	token: state => state.token
};

export default {
	namespaced: true, // 开启命名空间
	state,
	mutations,
	actions,
	getters
};