const state = {
	token: uni.getStorageSync('userToken') || null,
	userInfo: uni.getStorageSync('userInfo') ? JSON.parse(uni.getStorageSync('userInfo')) : {}
};

const mutations = {
	SET_TOKEN(state, token) {
		state.token = token;
		uni.setStorageSync('userToken', token);
	},
	SET_USER_INFO(state, userInfo) {
		state.userInfo = userInfo;
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
	loginSuccess({ commit }, authData) {
		commit('SET_TOKEN', authData.token);
		commit('SET_USER_INFO', authData.info);
	},
	logout({ commit }) {
		commit('CLEAR_AUTH');
		uni.reLaunch({
			url: '/pages/login/login'
		});
	},
	checkLoginState({ state, dispatch }) {
		if (!state.token) {
			dispatch('logout');
			return false;
		}
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
	namespaced: true,
	state,
	mutations,
	actions,
	getters
};