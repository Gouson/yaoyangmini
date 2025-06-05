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
			newUser: {
				username: '',
				nickname: '',
				password: '',
				role: 'cs', 
			},
			confirmPassword: '',
			submitting: false,
			errorMsg: '',
			assignableRoleOptions: [
				{ value: 'cs', text: '客服' },
				{ value: 'supplier', text: '供货商' }
			],
			selectedRoleText: '客服', 
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
        this.selectedRoleText = this.assignableRoleOptions.find(opt => opt.value === this.newUser.role)?.text || '请选择';
	},
	methods: {
		handleRoleSelectionChange(e) {
			const selectedIndex = e.detail.value;
			this.newUser.role = this.assignableRoleOptions[selectedIndex].value;
			this.selectedRoleText = this.assignableRoleOptions[selectedIndex].text;
		},
		async handleAddUser() {
			this.errorMsg = ''; 

			if (!this.newUser.username) {
				this.errorMsg = '用户名称不能为空';
				uni.showToast({ title: this.errorMsg, icon: 'none' });
				return;
			}
			if (!this.newUser.nickname) {
				this.errorMsg = '用户昵称不能为空';
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
			if (!this.newUser.role) {
				this.errorMsg = '请选择用户角色';
				uni.showToast({ title: this.errorMsg, icon: 'none' });
				return;
			}

			this.submitting = true;
			uni.showLoading({ title: '添加中...' });

			try {
				// *** CORRECTED HERE ***
				const res = await uni.cloud.callFunction({
					name: 'account-center',
					data: {
						action: 'adminAddUser',
						token: this.token,
						newUserDetails: {
							username: this.newUser.username,
							password: this.newUser.password,
							role: this.newUser.role,
							nickname: this.newUser.nickname,
						}
					}
				});
				uni.hideLoading();
				if (res.result.code === 200) {
					uni.showToast({ title: '用户添加成功!', icon: 'success', duration: 2000 });
					this.newUser = { username: '', nickname: '', password: '', role: 'cs' };
					this.confirmPassword = '';
                    this.selectedRoleText = this.assignableRoleOptions.find(opt => opt.value === this.newUser.role)?.text || '请选择';
					setTimeout(() => {
						uni.navigateBack();
					}, 2000);
				} else if (res.result.code === 401) {
                    uni.showToast({ title: res.result.message || '登录失效,请重新登录', icon: 'error' });
                    this.$store.dispatch('user/logout');
                }
                else {
					this.errorMsg = res.result.message || '添加用户失败';
					uni.showToast({ title: this.errorMsg, icon: 'none', duration: 3000 });
				}
			} catch (err) {
				uni.hideLoading();
				this.submitting = false;
				this.errorMsg = err.message || '请求失败，请检查网络';
				uni.showToast({ title: this.errorMsg, icon: 'none', duration: 3000 });
				console.error("handleAddUser error: ", err);
			} finally {
				this.submitting = false;
			}
		}
	}
}
</script>

<style scoped>
	/* 样式部分保持不变，与您之前提供的样式一致 */
.add-user-container {
	padding: 30rpx 40rpx;
	background-color: #f8f9fa;
	min-height: 100vh;
}

.form-title {
	font-size: 40rpx;
	font-weight: bold;
	text-align: center;
	margin-bottom: 40rpx;
	color: #333;
}

.form-item {
	margin-bottom: 30rpx;
	background-color: #fff;
	padding: 20rpx;
	border-radius: 10rpx;
	box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.05);
}
.form-label {
    display: block;
    font-size: 28rpx;
    color: #555;
    margin-bottom: 10rpx;
}

.input-field {
	width: 100%;
	height: 80rpx;
	padding: 0 20rpx;
	box-sizing: border-box;
	font-size: 28rpx;
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
}
.input-field:focus {
    border-color: #007bff;
}

.role-picker {
    height: 80rpx;
    line-height: 80rpx; 
    border: 1rpx solid #ddd;
    border-radius: 8rpx;
    padding: 0 20rpx;
    background-color: #fff;
    font-size: 28rpx;
}
.picker-display-value {
    color: #333; 
}


.error-message {
	color: #dc3545;
	font-size: 26rpx;
	text-align: center;
	margin-bottom: 20rpx;
	padding: 15rpx;
	background-color: #f8d7da;
	border: 1rpx solid #f5c6cb;
	border-radius: 8rpx;
}

.submit-button {
	width: 100%;
	height: 90rpx;
	line-height: 90rpx;
	font-size: 32rpx;
	margin-top: 30rpx;
	border-radius: 45rpx;
	background-color: #007bff;
	color: white;
}
.submit-button[disabled] {
	background-color: #a0cfff;
}
</style>