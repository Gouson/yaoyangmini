<template>
	<view class="user-management-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">用户管理</text>
				<button size="mini" @click="fetchUserList" :loading="loadingUsers">刷新列表</button>
			</view>

			<view v-if="loadingUsers && userList.length === 0" class="loading-text">用户列表加载中...</view>
			<view v-if="!loadingUsers && userList.length === 0" class="empty-text">暂无用户数据</view>

			<scroll-view scroll-y class="user-scroll-view">
				<view v-for="user in userList" :key="user._id" class="user-card">
					<view class="user-info-line">
						<text class="label">昵称:</text>
						<text class="value">{{ user.nickname }} ({{ user.username }})</text>
					</view>
					<view class="user-info-line">
						<text class="label">用户ID:</text>
						<text class="value id-value">{{ user._id }}</text>
					</view>
					<view class="user-info-line">
						<text class="label">角色:</text>
						<picker mode="selector" class="picker" :range="roleOptions" range-key="text"
							:value="getRoleIndex(user.role)" @change="e => handleRoleChange(e, user._id, user.role)">
							<view class="picker-value">{{ formatRole(user.role) }}</view>
						</picker>
					</view>
					<view class="user-info-line">
						<text class="label">状态:</text>
						<view class="status-control">
							<switch class="switch" :checked="user.status === 1"
								@change="e => handleStatusChange(e, user._id, user.status)" />
							<text class="status-text">{{ user.status === 1 ? '启用' : '禁用' }}</text>
						</view>
					</view>
				</view>
			</scroll-view>
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-text">
			<text>权限不足或未登录。请以管理员身份登录。</text>
			<button size="mini" @click="goToLogin" class="login-prompt-button">去登录</button>
		</view>
		<view v-else class="loading-text">页面加载中...</view>
	</view>
</template>

<script>
	import {
		mapGetters,
		mapActions
	} from 'vuex';

	export default {
		data() {
			return {
				userList: [],
				loadingUsers: false,
				isPageLoading: true,
				roleOptions: [{
						value: 'cs',
						text: '客服'
					},
					{
						value: 'supplier',
						text: '供货商'
					},
					{
						value: 'admin',
						text: '管理员'
					}
				],
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole', 'token'])
		},
		onShow() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			...mapActions('user', ['logout']),

			async checkAdminAuthAndLoadData() {
				if (!this.$store.getters['user/isLoggedIn']) {
					this.$store.dispatch('user/logout'); // 会导向登录页
					this.isPageLoading = false;
					return;
				}
				if (this.$store.getters['user/userRole'] !== 'admin') {
					uni.showToast({
						title: '权限不足!',
						icon: 'error',
						duration: 1500
					});
					this.navigateToUserHome(this.$store.getters['user/userRole']);
					this.isPageLoading = false;
					return;
				}
				this.isPageLoading = false;
				await this.fetchUserList();
			},

			navigateToUserHome(role) {
				let url = '/pages/login/login';
				if (role === 'cs') url = '/pages/cs/index';
				else if (role === 'supplier') url = '/pages/supplier/index';
				else if (role === 'admin') url = '/pages/admin/index'; // 如果已经是admin但权限不对，跳回admin首页

				const currentPages = getCurrentPages();
				const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
				if (url && url !== `/${currentPageRoute}`) { // 确保有url且不是当前页
					uni.reLaunch({
						url
					});
				} else if (!url) { // 如果角色未知，则登出
					this.$store.dispatch('user/logout');
				}
			},

			goToLogin() {
				this.$store.dispatch('user/logout');
			},

			formatRole(roleValue) {
				const role = this.roleOptions.find(r => r.value === roleValue);
				return role ? role.text : '未知';
			},

			getRoleIndex(roleValue) {
				const index = this.roleOptions.findIndex(r => r.value === roleValue);
				return index > -1 ? index : 0;
			},

			async fetchUserList() {
				this.loadingUsers = true;
				const currentToken = this.token || uni.getStorageSync('userToken');
				if (!currentToken) {
					this.goToLogin();
					this.loadingUsers = false;
					return;
				}

				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminListUsers',
							token: currentToken
						}
					});

					if (res.result.code === 200) {
						this.userList = res.result.data;
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error'
						});
						this.goToLogin();
					} else {
						uni.showToast({
							title: res.result.message || '加载用户列表失败',
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('fetchUserList 调用失败:', err);
					uni.showToast({
						title: '请求用户列表异常',
						icon: 'error'
					});
				} finally {
					this.loadingUsers = false;
				}
			},

			async handleRoleChange(event, userId, currentRole) {
				const selectedRoleOption = this.roleOptions[event.detail.value];
				const newRole = selectedRoleOption.value;
				if (newRole === currentRole) return;
				if (userId === this.currentUser._id && newRole !== 'admin') {
					uni.showToast({
						title: '不能将自己修改为非管理员',
						icon: 'none'
					});
					await this.fetchUserList();
					return;
				}
				uni.showModal({
					title: '确认修改角色',
					content: `确定将角色修改为 "${selectedRoleOption.text}"?`,
					success: async (res) => {
						if (res.confirm) await this.updateUser(userId, {
							newRole
						});
						else await this.fetchUserList();
					}
				});
			},

			async handleStatusChange(event, userId, currentStatus) {
				const newStatus = event.detail.value ? 1 : 0;
				if (newStatus === currentStatus) return; // 状态未改变
				if (userId === this.currentUser._id && newStatus === 0) {
					uni.showToast({
						title: '不能禁用自己的账号',
						icon: 'none'
					});
					await this.fetchUserList();
					return;
				}
				uni.showModal({
					title: '确认修改状态',
					content: `确定将状态修改为 "${newStatus === 1 ? '启用' : '禁用'}"?`,
					success: async (res) => {
						if (res.confirm) await this.updateUser(userId, {
							newStatus
						});
						else await this.fetchUserList();
					}
				});
			},

			async updateUser(userId, updateData) {
				uni.showLoading({
					title: '更新中...'
				});
				const currentToken = this.token || uni.getStorageSync('userToken');
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminUpdateUser',
							token: currentToken,
							userIdToUpdate: userId,
							...updateData
						}
					});
					if (res.result.code === 200) {
						uni.showToast({
							title: '更新成功',
							icon: 'success'
						});
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error'
						});
						this.goToLogin();
					} else {
						uni.showToast({
							title: res.result.message || '更新失败',
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('updateUser 调用失败:', err);
					uni.showToast({
						title: '更新请求异常',
						icon: 'error'
					});
				} finally {
					uni.hideLoading();
					await this.fetchUserList();
				}
			}
		}
	}
</script>

<style scoped>
	.user-management-container {
		padding: 20rpx;
		background-color: #f8f9fa;
		min-height: 100vh;
		box-sizing: border-box;
		/* 防止padding撑开页面 */
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 30rpx;
		padding: 20rpx;
		background-color: #fff;
		border-radius: 12rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}

	.page-title {
		font-size: 36rpx;
		font-weight: bold;
		color: #333;
	}

	.user-scroll-view {
		/* 减去顶部 header 和一些边距的高度 */
		height: calc(100vh - 120rpx - 40rpx);
	}

	.user-card {
		background-color: #fff;
		border: 1px solid #e9ecef;
		border-radius: 8rpx;
		padding: 25rpx;
		margin-bottom: 20rpx;
		box-shadow: 0 1rpx 5rpx rgba(0, 0, 0, 0.03);
	}

	.user-info-line {
		display: flex;
		align-items: center;
		font-size: 28rpx;
		margin-bottom: 15rpx;
		/* 增加行间距 */
	}

	.label {
		color: #6c757d;
		width: 120rpx;
		flex-shrink: 0;
	}

	.value {
		color: #343a40;
		flex: 1;
		word-break: break-all;
	}

	.id-value {
		font-size: 24rpx;
		color: #6c757d;
	}

	.user-actions {
		/* 移除边框和上边距，因为现在是行内元素 */
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 15rpx;
	}

	.action-group {
		display: flex;
		align-items: center;
		margin-top: 10rpx;
	}

	.picker {
		border: 1px solid #ced4da;
		padding: 8rpx 15rpx;
		border-radius: 8rpx;
		background-color: #f8f9fa;
		/* slight background for picker */
		margin-left: 10rpx;
		min-width: 180rpx;
		text-align: center;
	}

	.picker-value {
		font-size: 26rpx;
		color: #495057;
	}

	.status-control {
		display: flex;
		align-items: center;
	}

	.switch {
		transform: scale(0.8);
		margin-left: 0;
		/* Switch紧跟label */
	}

	.status-text {
		font-size: 26rpx;
		margin-left: 10rpx;
		color: #495057;
	}

	.loading-text,
	.empty-text,
	.unauthorized-text {
		text-align: center;
		color: #6c757d;
		margin-top: 100rpx;
		font-size: 28rpx;
	}

	.login-prompt-button {
		margin-top: 30rpx;
		background-color: #007bff;
		color: white;
	}
</style>