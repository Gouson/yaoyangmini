<script>
	// App.vue
	export default {
		onLaunch: function() {
			// 初始化
			wx.cloud.init({
				// env 参数包含一个环境 ID 时，获取指定环境内的资源；
				// 不传（或传null）表示获取当前默认环境的资源（通常是第一个创建的环境）
				// 强烈建议您明确指定您的云环境 ID
				env: 'cloud1-3ggi72rye43633d8', // <--- 请务必替换成您的真实云环境 ID
				traceUser: true, // 是否在将用户访问记录到用户管理中，在控制台中可见
			});
			console.log('App Launch');
			const token = uni.getStorageSync('userToken');
			const userInfoString = uni.getStorageSync('userInfo');

			if (token && userInfoString) {
				try {
					// const userInfo = JSON.parse(userInfoString);
					const userInfo = userInfoString
					if (userInfo && userInfo.role) {
						console.log('用户已登录，角色:', userInfo.role, '准备跳转...');
						// 将用户信息同步到 Vuex store (如果 store 中是空的)
						if (!this.$store.getters['user/isLoggedIn']) {
							this.$store.dispatch('user/loginSuccess', {
								token: token,
								info: userInfo
							});
						}

						// 根据角色跳转
						let url = '/pages/cs/index'; // 默认
						if (userInfo.role === 'admin') {
							url = '/pages/admin/index';
						} else if (userInfo.role === 'supplier') {
							url = '/pages/supplier/index';
						}
						uni.reLaunch({
							url
						});
					} else {
						// 本地存储的用户信息不完整，引导重新登录
						this.$store.dispatch('user/logout');
					}
				} catch (e) {
					console.error("解析本地用户信息失败", e);
					// 解析失败，引导重新登录
					this.$store.dispatch('user/logout');
				}
			} else {
				console.log('用户未登录或Token不存在');
				// 确保如果入口不是登录页，则跳转到登录页
				// 如果 entryPagePath 就是登录页，则无需额外跳转
				const pages = getCurrentPages();
				const currentPage = pages.length ? pages[pages.length - 1].route : null;
				if (currentPage !== 'pages/login/login') {
					uni.reLaunch({
						url: '/pages/login/login'
					});
				}
			}
		},
		onShow: function() {
			console.log('App Show');
		},
		onHide: function() {
			console.log('App Hide');
		}
	}
</script>