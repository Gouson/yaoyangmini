<template>
	<view class="admin-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="title">用户管理中心</text>
				<button size="mini" @click="fetchUserList" :loading="loading">刷新列表</button>
			</view>

			<view v-if="loading && userList.length === 0" class="loading-text">加载中...</view>

			<view v-if="!loading && userList.length === 0" class="empty-text">暂无用户数据</view>

			<view v-for="user in userList" :key="user._id" class="user-card">
				<view class="user-info-line">
					<text class="label">昵称:</text>
					<text class="value">{{ user.nickname }} ({{ user.username }})</text>
				</view>
				<view class="user-info-line">
					<text class="label">用户ID:</text>
					<text class="value id-value">{{ user._id }}</text>
				</view>
				<view class="user-actions">
					<view class="action-group">
						<text class="label">角色:</text>
						<picker class="picker" :range="roleOptions" range-key="text" :value="getRoleIndex(user.role)"
							@change="e => handleRoleChange(e, user._id, user.role)">
							<view class="picker-value">{{ formatRole(user.role) }}</view>
						</picker>
					</view>
					<view class="action-group">
						<text class="label">状态:</text>
						<switch class="switch" :checked="user.status === 1"
							@change="e => handleStatusChange(e, user._id, user.status)" />
						<text class="status-text">{{ user.status === 1 ? '启用' : '禁用' }}</text>
					</view>
				</view>
			</view>
			<button class="logout-button" @click="handleLogout">退出登录</button>
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-text">
			<text>权限不足或未登录。请以管理员身份登录。</text>
			<button size="mini" @click="goToLogin">去登录</button>
		</view>
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
				loading: false,
				isPageLoading: true, // 用于初始加载时避免闪烁“权限不足”
				roleOptions: [ // picker 的选项
					{
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
					} // 理论上管理员不应随意更改其他管理员角色
				],
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole', 'token'])
			// 确保在 user.js getters 中也导出了 token，或者直接从 storage 获取
			// 如果 token 不在 getters，可以这样：
			// localToken() { return uni.getStorageSync('userToken'); }
		},
		onShow() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			...mapActions('user', ['logout']), // 映射 Vuex actions

			async checkAdminAuthAndLoadData() {
				if (!this.$store.getters['user/isLoggedIn']) {
					// uni.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
					this.$store.dispatch('user/logout'); // 会导向登录页
					this.isPageLoading = false;
					return;
				}
				if (this.$store.getters['user/userRole'] !== 'admin') {
					uni.showToast({
						title: '权限不足',
						icon: 'error',
						duration: 1500
					});
					// 根据实际情况决定跳转逻辑，例如跳转到该用户对应的首页
					// this.navigateToUserHome(this.$store.getters['user/userRole']);
					this.isPageLoading = false;
					return;
				}
				// 权限验证通过
				this.isPageLoading = false;
				await this.fetchUserList();
			},

			navigateToUserHome(role) {
				let url = '/pages/login/login'; // 默认
				if (role === 'cs') url = '/pages/cs/index';
				else if (role === 'supplier') url = '/pages/supplier/index';
				uni.reLaunch({
					url
				});
			},

			goToLogin() {
				this.$store.dispatch('user/logout');
			},

			formatRole(roleValue) {
				const role = this.roleOptions.find(r => r.value === roleValue);
				return role ? role.text : '未知角色';
			},

			getRoleIndex(roleValue) {
				const index = this.roleOptions.findIndex(r => r.value === roleValue);
				return index > -1 ? index : 0;
			},

			async fetchUserList() {
				this.loading = true;
				const currentToken = this.$store.getters['user/token'] || uni.getStorageSync('userToken');
				if (!currentToken) {
					this.goToLogin();
					return;
				}

				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminListUsers',
							token: currentToken,
							// 可以添加分页参数
							// page: 1,
							// pageSize: 20
						}
					});

					if (res.result.code === 200) {
						this.userList = res.result.data;
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效，请重新登录',
							icon: 'error',
							duration: 1500
						});
						this.goToLogin();
					} else {
						uni.showToast({
							title: res.result.message || '加载用户列表失败',
							icon: 'error',
							duration: 1500
						});
					}
				} catch (err) {
					console.error('fetchUserList 调用失败:', err);
					uni.showToast({
						title: '请求用户列表异常',
						icon: 'error',
						duration: 1500
					});
				} finally {
					this.loading = false;
				}
			},

			async handleRoleChange(event, userId, currentRole) {
				const selectedRoleOption = this.roleOptions[event.detail.value];
				const newRole = selectedRoleOption.value;

				if (newRole === currentRole) return; // 角色未改变

				// 防止管理员误操作把自己改成非管理员或禁用自己
				if (userId === this.currentUser._id && newRole !== 'admin') {
					uni.showToast({
						title: '不能将自己修改为非管理员角色',
						icon: 'none'
					});
					// 可能需要强制刷新列表以恢复picker的显示，或者在updateUser失败时不更新本地数据
					this.$forceUpdate(); // 强制重新渲染以恢复picker显示
					setTimeout(() => this.fetchUserList(), 0); // 异步刷新列表
					return;
				}


				uni.showModal({
					title: '确认修改角色',
					content: `确定要将用户角色修改为 "${selectedRoleOption.text}" 吗？`,
					success: async (res) => {
						if (res.confirm) {
							await this.updateUser(userId, {
								newRole: newRole
							});
						} else {
							// 用户取消，可能需要强制刷新列表以恢复picker的显示
							this.$forceUpdate();
							setTimeout(() => this.fetchUserList(), 0);
						}
					}
				});
			},

			async handleStatusChange(event, userId, currentStatus) {
				const newStatus = event.detail.value ? 1 : 0;

				if (newStatus === currentStatus) return; // 状态未改变

				// 防止管理员禁用自己
				if (userId === this.currentUser._id && newStatus === 0) {
					uni.showToast({
						title: '不能禁用自己的账号',
						icon: 'none'
					});
					// 强制刷新列表以恢复switch显示
					this.$forceUpdate();
					setTimeout(() => this.fetchUserList(), 0);
					return;
				}

				uni.showModal({
					title: '确认修改状态',
					content: `确定要将用户状态修改为 "${newStatus === 1 ? '启用' : '禁用'}" 吗？`,
					success: async (res) => {
						if (res.confirm) {
							await this.updateUser(userId, {
								newStatus: newStatus
							});
						} else {
							// 用户取消，可能需要强制刷新列表以恢复switch显示
							this.$forceUpdate();
							setTimeout(() => this.fetchUserList(), 0);
						}
					}
				});
			},

			async updateUser(userId, updateData) {
				this.loading = true; // 可以用一个更细粒度的loading状态
				const currentToken = this.$store.getters['user/token'] || uni.getStorageSync('userToken');

				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminUpdateUser',
							token: currentToken,
							userIdToUpdate: userId,
							...updateData // newRole 或 newStatus
						}
					});

					if (res.result.code === 200) {
						uni.showToast({
							title: '更新成功',
							icon: 'success'
						});
						await this.fetchUserList(); // 成功后刷新列表
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效，请重新登录',
							icon: 'error',
							duration: 1500
						});
						this.goToLogin();
					} else {
						uni.showToast({
							title: res.result.message || '更新失败',
							icon: 'error'
						});
						// 如果更新失败，也可能需要刷新列表以恢复旧状态
						await this.fetchUserList();
					}
				} catch (err) {
					console.error('updateUser 调用失败:', err);
					uni.showToast({
						title: '更新请求异常',
						icon: 'error'
					});
					await this.fetchUserList(); // 异常时也刷新，确保数据一致性
				} finally {
					this.loading = false;
				}
			},
			handleLogout() {
				this.logout(); // 调用 Vuex action
			}
		}
	}
</script>

<style scoped>
	.admin-container {
		padding: 20rpx;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 30rpx;
	}

	.title {
		font-size: 40rpx;
		font-weight: bold;
	}

	.loading-text,
	.empty-text,
	.unauthorized-text {
		text-align: center;
		color: #999;
		margin-top: 50rpx;
		font-size: 28rpx;
	}

	.user-card {
		background-color: #fff;
		border-radius: 10rpx;
		padding: 25rpx;
		margin-bottom: 20rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}

	.user-info-line {
		display: flex;
		align-items: center;
		font-size: 28rpx;
		margin-bottom: 10rpx;
	}

	.label {
		color: #666;
		width: 120rpx;
		/* 固定标签宽度 */
	}

	.value {
		color: #333;
		flex: 1;
		word-break: break-all;
	}

	.id-value {
		font-size: 24rpx;
		color: #999;
	}

	.user-actions {
		margin-top: 20rpx;
		padding-top: 20rpx;
		border-top: 1px solid #f0f0f0;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.action-group {
		display: flex;
		align-items: center;
	}

	.picker {
		border: 1px solid #eee;
		padding: 5rpx 15rpx;
		border-radius: 8rpx;
		background-color: #f9f9f9;
		margin-left: 10rpx;
	}

	.picker-value {
		font-size: 26rpx;
	}

	.switch {
		transform: scale(0.8);
		/* 缩小switch控件 */
		margin-left: 10rpx;
	}

	.status-text {
		font-size: 26rpx;
		margin-left: 10rpx;
		color: #333;
	}

	.logout-button {
		margin-top: 50rpx;
		background-color: #e64340;
		color: white;
	}
</style>