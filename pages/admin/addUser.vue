<template>
	<view class="add-user-container">
		<view class="form-title">添加新用户</view>
		<form @submit.prevent="handleAddUser">
			<view class="form-item">
				<text class="form-label">用户名:</text>
				<input type="text" v-model.trim="newUser.username" placeholder="请输入用户名 (登录账号)" class="input-field" />
			</view>
			<view class="form-item">
				<text class="form-label">昵称:</text>
				<input type="text" v-model.trim="newUser.nickname" placeholder="请输入用户昵称 (显示名称)" class="input-field" />
			</view>
			<view class="form-item">
				<text class="form-label">初始密码:</text>
				<input type="password" v-model="newUser.password" placeholder="请输入初始密码 (至少6位)" class="input-field" />
			</view>
			<view class="form-item">
				<text class="form-label">确认密码:</text>
				<input type="password" v-model="confirmPassword" placeholder="请再次输入初始密码" class="input-field" />
			</view>
			<view class="form-item">
				<text class="form-label">用户角色:</text>
				<picker mode="selector" class="role-picker" :range="assignableRoleOptions" range-key="text" 
                        @change="handleRoleSelectionChange">
					<view class="picker-display-value">{{ selectedRoleText }}</view>
				</picker>
			</view>

			<view class="form-item" v-if="newUser.role === 'cs' || newUser.role === 'supplier'">
				<text class="form-label">所属游戏:</text>
				<picker mode="selector" class="role-picker" :range="gameList" range-key="name" @change="handleGameSelectionChange">
					<view class="picker-display-value">
						{{ selectedGameText }}
					</view>
				</picker>
			</view>

			<view v-if="errorMsg" class="error-message">{{ errorMsg }}</view>
			<button type="primary" class="submit-button" @click="handleAddUser" :loading="submitting" :disabled="submitting">
				确认添加
			</button>
		</form>
	</view>
</template>

<script>
	import { mapState } from 'vuex';
	export default {
		data() {
			return {
				newUser: { username: '', nickname: '', password: '', role: 'cs', game_id: null },
				confirmPassword: '',
				submitting: false,
				errorMsg: '',
				assignableRoleOptions: [{ value: 'cs', text: '客服' }, { value: 'supplier', text: '供货商' }],
				selectedRoleText: '客服',
				gameList: [],
				selectedGameText: '请选择游戏',
			};
		},
		computed: {
			...mapState('user', ['token'])
		},
		onLoad() {
			if (this.$store.getters['user/userRole'] !== 'admin') {
				uni.showToast({ title: '无权限访问', icon: 'none' });
				uni.navigateBack();
			}
			this.fetchGames();
		},
		methods: {
			async fetchGames() {
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getGames', token: this.token } });
					if (res.result.code === 200) {
						this.gameList = res.result.data;
						if (this.gameList.length > 0) {
						    this.newUser.game_id = this.gameList[0]._id;
						    this.selectedGameText = this.gameList[0].name;
						}
					} else {
						this.errorMsg = '游戏列表加载失败';
					}
				} catch (e) {
					this.errorMsg = '请求游戏列表失败';
				}
			},
			handleRoleSelectionChange(e) {
				const selectedIndex = e.detail.value;
				this.newUser.role = this.assignableRoleOptions[selectedIndex].value;
				this.selectedRoleText = this.assignableRoleOptions[selectedIndex].text;
			},
			handleGameSelectionChange(e) {
				const selectedIndex = e.detail.value;
				this.newUser.game_id = this.gameList[selectedIndex]._id;
				this.selectedGameText = this.gameList[selectedIndex].name;
			},
			async handleAddUser() {
				this.errorMsg = '';
				if (!this.newUser.username || !this.newUser.nickname || !this.newUser.password || !this.confirmPassword) {
					this.errorMsg = '请填写所有必填项';
					uni.showToast({ title: this.errorMsg, icon: 'none' });
					return;
				}
				if (this.newUser.password.length < 6) {
					this.errorMsg = '密码长度不能少于6位';
					uni.showToast({ title: this.errorMsg, icon: 'none' });
					return;
				}
				if (this.newUser.password !== this.confirmPassword) {
					this.errorMsg = '两次输入的密码不一致';
					uni.showToast({ title: this.errorMsg, icon: 'none' });
					return;
				}
				if ((this.newUser.role === 'cs' || this.newUser.role === 'supplier') && !this.newUser.game_id) {
					this.errorMsg = '请为用户选择所属游戏';
					uni.showToast({ title: this.errorMsg, icon: 'none' });
					return;
				}

				this.submitting = true;
				uni.showLoading({ title: '添加中...' });

				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminAddUser',
							token: this.token,
							newUserDetails: this.newUser
						}
					});
					if (res.result.code === 200) {
						uni.showToast({ title: '用户添加成功!', icon: 'success' });
						setTimeout(() => uni.navigateBack(), 1500);
					} else {
						uni.showToast({ title: res.result.message || '添加失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '请求异常', icon: 'error' });
				} finally {
					this.submitting = false;
					uni.hideLoading();
				}
			}
		}
	}
</script>

<style scoped>
	.add-user-container { padding: 30rpx 40rpx; background-color: #f8f9fa; min-height: 100vh; }
	.form-title { font-size: 40rpx; font-weight: bold; text-align: center; margin-bottom: 40rpx; color: #333; }
	.form-item { margin-bottom: 30rpx; }
	.form-label { display: block; font-size: 28rpx; color: #555; margin-bottom: 10rpx; }
	.input-field, .role-picker { width: 100%; height: 80rpx; padding: 0 20rpx; box-sizing: border-box; font-size: 28rpx; border: 1rpx solid #ddd; border-radius: 8rpx; background-color: #fff; }
	.picker-display-value { line-height: 80rpx; }
	.error-message { color: #dc3545; font-size: 26rpx; text-align: center; margin-bottom: 20rpx; padding: 15rpx; background-color: #f8d7da; border: 1rpx solid #f5c6cb; border-radius: 8rpx; }
	.submit-button { width: 100%; height: 90rpx; line-height: 90rpx; font-size: 32rpx; margin-top: 30rpx; border-radius: 45rpx; background-color: #007bff; color: white; }
</style>