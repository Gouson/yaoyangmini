<template>
	<view class="login-container">
		<view class="title">系统登录</view>
		<input class="input-field" v-model="username" placeholder="请输入账号" />
		<input class="input-field" v-model="password" type="password" password="true" placeholder="请输入密码" />
		<button class="login-button" @click="handleLogin" :loading="loading">登 录</button>
	</view>
</template>

<script>
	// 从 Vuex 中按需导入 mapActions 和 mapGetters (如果需要在 template 中直接使用 getter)
	// import { mapActions, mapGetters } from 'vuex';

	export default {
		data() {
			return {
				username: '',
				password: '',
				loading: false,
			};
		},
		computed: {
			// ...mapGetters('user', ['isLoggedIn']) // 示例：获取登录状态
		},
		methods: {
			// ...mapActions('user', ['loginSuccess', 'logout']), // 映射 Vuex actions

			async handleLogin() {
				if (!this.username || !this.password) {
					uni.showToast({
						title: '请输入账号和密码',
						icon: 'none'
					});
					return;
				}

				this.loading = true;
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'login',
							username: this.username,
							password: this.password
						}
					});

					if (res.result.code === 200) {
						const userData = res.result.data;
						uni.showToast({
							title: '登录成功!',
							icon: 'success'
						});

						// 调用 Vuex action 来保存 Token 和用户信息
						this.$store.dispatch('user/loginSuccess', {
							token: userData.token,
							info: { // 只保存必要且非敏感的信息到前端
								_id: userData._id,
								username: userData.username,
								nickname: userData.nickname,
								role: userData.role
							}
						});

						this.navigateToHomePage(userData.role);

					} else {
						uni.showToast({
							title: res.result.message || '登录失败',
							icon: 'error'
						});
					}

				} catch (err) {
					console.error('登录请求失败:', err);
					uni.showToast({
						title: '登录请求异常',
						icon: 'error'
					});
				} finally {
					this.loading = false;
				}
			},
			navigateToHomePage(role) {
				let url = '/pages/cs/index'; // 默认客服页
				if (role === 'admin') {
					url = '/pages/admin/index';
				} else if (role === 'supplier') {
					url = '/pages/supplier/index';
				}
				// 使用 reLaunch，因为登录后通常不希望用户能返回到登录页
				uni.reLaunch({
					url
				});
			}
		}
	}
</script>

<style scoped>
	.login-container {
		padding: 80rpx 50rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.title {
		font-size: 48rpx;
		font-weight: bold;
		margin-bottom: 80rpx;
	}

	.input-field {
		width: 100%;
		height: 90rpx;
		border: 1px solid #e0e0e0;
		border-radius: 10rpx;
		padding-left: 30rpx;
		margin-bottom: 40rpx;
		box-sizing: border-box;
	}

	.login-button {
		width: 100%;
		height: 90rpx;
		line-height: 90rpx;
		background-color: #007aff;
		color: white;
		border-radius: 10rpx;
		font-size: 32rpx;
	}

	.login-button[loading] {
		background-color: #a0cfff;
	}
</style>