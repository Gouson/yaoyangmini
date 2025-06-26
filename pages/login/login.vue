<template>
	<view class="login-container">
		<view class="title">系统登录</view>
		<input class="input-field" v-model="username" placeholder="请输入账号" />
		<input class="input-field" v-model="password" type="password" password="true" placeholder="请输入密码" />
		<button class="login-button" @click="handleLogin" :loading="loading">登 录</button>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				username: '',
				password: '',
				loading: false,
			};
		},
		methods: {
			async handleLogin() {
				if (!this.username || !this.password) {
					uni.showToast({ title: '请输入账号和密码', icon: 'none' });
					return;
				}
				this.loading = true;
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: { action: 'login', username: this.username, password: this.password }
					});

					if (res.result.code === 200) {
						const userData = res.result.data;
						uni.showToast({ title: '登录成功!', icon: 'success' });
						this.$store.dispatch('user/loginSuccess', {
							token: userData.token,
							info: {
								_id: userData._id,
								username: userData.username,
								nickname: userData.nickname,
								role: userData.role,
								game_id: userData.game_id // 保存 game_id
							}
						});
						this.navigateToHomePage(userData.role);
					} else {
						uni.showToast({ title: res.result.message || '登录失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '登录请求异常', icon: 'error' });
				} finally {
					this.loading = false;
				}
			},
			navigateToHomePage(role) {
				let url = '/pages/cs/index';
				if (role === 'admin') url = '/pages/admin/index';
				else if (role === 'supplier') url = '/pages/supplier/index';
				uni.reLaunch({ url });
			}
		}
	}
</script>

<style scoped>
	.login-container { padding: 80rpx 50rpx; display: flex; flex-direction: column; align-items: center; }
	.title { font-size: 48rpx; font-weight: bold; margin-bottom: 80rpx; }
	.input-field { width: 100%; height: 90rpx; border: 1px solid #e0e0e0; border-radius: 10rpx; padding-left: 30rpx; margin-bottom: 40rpx; box-sizing: border-box; }
	.login-button { width: 100%; height: 90rpx; line-height: 90rpx; background-color: #007aff; color: white; border-radius: 10rpx; font-size: 32rpx; }
	.login-button[loading] { background-color: #a0cfff; }
</style>