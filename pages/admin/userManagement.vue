<template>
	<view class="user-management-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">用户管理</text>
				<view class="header-actions">
					<button size="mini" @click="fetchUserList(true)" :loading="loadingUsers" class="header-button">刷新列表</button>
					<button size="mini" type="primary" @click="navigateToAddUserPage" class="header-button">添加新用户</button>
				</view>
			</view>

			<view v-if="loadingUsers && userList.length === 0" class="loading-text">用户列表加载中...</view>
			<view v-if="!loadingUsers && userList.length === 0" class="empty-text">暂无用户数据</view>

			<scroll-view scroll-y class="user-scroll-view" v-if="userList.length > 0">
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
							:value="getRoleIndex(user.role)" @change="e => handleRoleChange(e, user._id, user.role)"
							:disabled="user._id === (currentUser ? currentUser._id : '')">
							<view class="picker-value">{{ formatRole(user.role) }}</view>
						</picker>
					</view>
					<view class="user-info-line">
						<text class="label">状态:</text>
						<view class="status-control">
							<switch class="switch" :checked="user.status === 1"
								@change="e => handleStatusChange(e, user._id, user.status)" 
								:disabled="user._id === (currentUser ? currentUser._id : '')"/>
							<text class="status-text">{{ user.status === 1 ? '启用' : '禁用' }}</text>
						</view>
					</view>
					<view class="user-actions">
						<button
							v-if="currentUser && currentUser._id !== user._id"
							type="warn"
							size="mini"
							@click="confirmDeleteUser(user)"
							:loading="user._id === deletingUserId"
							:disabled="user._id === deletingUserId"
							class="action-button delete-button"
						>
							删除用户
						</button>
						<text v-if="currentUser && currentUser._id === user._id" class="self-tag">（这是您自己）</text>
					</view>
				</view>
			</scroll-view>
			
			<view class="pagination" v-if="!loadingUsers && total > pageSize">
				<button @click="handlePageChange(-1)" :disabled="page === 1 || loadingUsers">上一页</button>
				<text class="page-info">{{ page }} / {{ totalPages }}</text>
				<button @click="handlePageChange(1)" :disabled="page >= totalPages || loadingUsers">下一页</button>
			</view>

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
		mapActions,
		mapState
	} from 'vuex';

	export default {
		data() {
			return {
				userList: [],
				loadingUsers: false,
				isPageLoading: true,
				deletingUserId: null,
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
				page: 1,
				pageSize: 10,
				total: 0,
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole']),
			...mapState('user', ['token']),
			totalPages() {
				return Math.ceil(this.total / this.pageSize);
			}
		},
		onShow() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			...mapActions('user', ['logout']),

			async checkAdminAuthAndLoadData() {
				if (!this.$store.getters['user/isLoggedIn']) {
					this.$store.dispatch('user/logout');
					this.isPageLoading = false;
					return;
				}
				if (this.$store.getters['user/userRole'] !== 'admin') {
					uni.showToast({ title: '权限不足!', icon: 'error', duration: 1500 });
					this.navigateToUserHome(this.$store.getters['user/userRole']);
					this.isPageLoading = false;
					return;
				}
				this.isPageLoading = false;
				await this.fetchUserList(true);
			},

			navigateToUserHome(role) {
				let url = '/pages/login/login';
				if (role === 'cs') url = '/pages/cs/index';
				else if (role === 'supplier') url = '/pages/supplier/index';
				else if (role === 'admin') url = '/pages/admin/index';

				const currentPages = getCurrentPages();
				const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
				if (url && (!currentPageRoute || url !== `/${currentPageRoute}`)) {
					uni.reLaunch({ url });
				} else if (!url) {
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
            
			navigateToAddUserPage() {
				uni.navigateTo({
					url: '/pages/admin/addUser'
				});
			},

			async fetchUserList(resetPage = false) {
				if (resetPage) {
					this.page = 1;
				}
				this.loadingUsers = true;
				if (!this.token) {
					uni.showToast({ title: 'Token无效,请重新登录', icon: 'none' });
					this.goToLogin();
					this.loadingUsers = false;
					return;
				}
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminListUsers',
							token: this.token,
							page: this.page,
							pageSize: this.pageSize
						}
					});
					if (res.result.code === 200) {
						let fetchedUsers = res.result.data;
						// *** 新增排序逻辑 ***
						fetchedUsers.sort((a, b) => {
							// 管理员置顶
							if (a.role === 'admin' && b.role !== 'admin') {
								return -1; // a 排在 b 前面
							}
							if (a.role !== 'admin' && b.role === 'admin') {
								return 1;  // b 排在 a 前面
							}
							// 可选：在同一角色组内按其他字段排序，例如昵称或用户名
							const nicknameA = a.nickname || '';
							const nicknameB = b.nickname || '';
							if (nicknameA.localeCompare(nicknameB) !== 0) {
								return nicknameA.localeCompare(nicknameB);
							}
							const usernameA = a.username || '';
							const usernameB = b.username || '';
							return usernameA.localeCompare(usernameB);
						});
						this.userList = fetchedUsers;
						this.total = res.result.total;
					} else if (res.result.code === 401) {
						uni.showToast({ title: res.result.message || '登录失效,请重新登录', icon: 'error', duration: 2000 });
						this.goToLogin();
					} else {
						uni.showToast({ title: res.result.message || '加载用户列表失败', icon: 'error', duration: 2000 });
					}
				} catch (err) {
					console.error('fetchUserList 调用失败:', err);
					uni.showToast({ title: '请求用户列表异常', icon: 'error', duration: 2000 });
				} finally {
					this.loadingUsers = false;
				}
			},

			async handleRoleChange(event, userId, currentRole) {
				const selectedRoleOption = this.roleOptions[event.detail.value];
				const newRole = selectedRoleOption.value;
				if (newRole === currentRole) return;
				if (userId === this.currentUser._id && newRole !== 'admin') {
					uni.showToast({ title: '不能将自己修改为非管理员', icon: 'none' });
					this.$nextTick(() => { this.fetchUserList(); });
					return;
				}
				uni.showModal({
					title: '确认修改角色',
					content: `确定将用户 "${this.userList.find(u=>u._id === userId)?.nickname}" 的角色修改为 "${selectedRoleOption.text}"?`,
					success: async (res) => {
						if (res.confirm) {
							await this.updateUser(userId, { newRole });
						} else {
							this.fetchUserList(); // 如果取消，重新获取列表以确保选择器回退
						}
					}
				});
			},

			async handleStatusChange(event, userId, currentStatus) {
				const newStatus = event.detail.value ? 1 : 0;
				if (newStatus === currentStatus) return;
				if (userId === this.currentUser._id && newStatus === 0) {
					uni.showToast({ title: '不能禁用自己的账号', icon: 'none' });
					this.$nextTick(() => { this.fetchUserList(); }); // 重新获取列表以确保开关回退
					return;
				}
				uni.showModal({
					title: '确认修改状态',
					content: `确定将用户 "${this.userList.find(u=>u._id === userId)?.nickname}" 的状态修改为 "${newStatus === 1 ? '启用' : '禁用'}"?`,
					success: async (res) => {
						if (res.confirm) {
							await this.updateUser(userId, { newStatus });
						} else {
							this.fetchUserList(); // 如果取消，重新获取列表以确保开关回退
						}
					}
				});
			},

			async updateUser(userId, updateData) {
				uni.showLoading({ title: '更新中...' });
				if (!this.token) {
					uni.hideLoading();
					uni.showToast({ title: 'Token无效,请重新登录', icon: 'none' });
					this.goToLogin();
					return;
				}
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminUpdateUser',
							token: this.token,
							userIdToUpdate: userId,
							...updateData
						}
					});
					if (res.result.code === 200) {
						uni.showToast({ title: '更新成功', icon: 'success' });
					} else if (res.result.code === 401) {
						uni.showToast({ title: res.result.message || '登录失效', icon: 'error' });
						this.goToLogin();
					} else {
						console.error("Update user error from backend: ", res.result.message);
						uni.showToast({ title: res.result.message || '更新失败', icon: 'error' });
					}
				} catch (err) {
					console.error('updateUser 调用失败:', err);
					uni.showToast({ title: '更新请求异常', icon: 'error' });
				} finally {
					uni.hideLoading();
					await this.fetchUserList();
				}
			},

			confirmDeleteUser(user) {
				if (!user || !user._id) {
					uni.showToast({title: '无效的用户信息', icon: 'none'});
					return;
				}
				uni.showModal({
					title: '确认删除',
					content: `您确定要永久删除用户 "${user.nickname || user.username}" 吗？此操作不可恢复。`,
					success: async (res) => {
						if (res.confirm) {
							this.deleteUser(user._id);
						}
					},
				});
			},

			async deleteUser(userIdToDelete) {
				this.deletingUserId = userIdToDelete;
				uni.showLoading({ title: '删除中...' });
				if (!this.token) {
					uni.hideLoading();
					this.deletingUserId = null;
					uni.showToast({ title: 'Token无效,请重新登录', icon: 'none' });
					this.goToLogin();
					return;
				}
				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'adminDeleteUser',
							token: this.token,
							userIdToDelete: userIdToDelete,
						},
					});
					uni.hideLoading();
					if (res.result && res.result.code === 200) {
						uni.showToast({ title: '用户删除成功', icon: 'success' });
						if (this.userList.length === 1 && this.page > 1) {
							this.page--;
						}
						await this.fetchUserList();
					} else if (res.result.code === 401) {
						uni.showToast({ title: res.result.message || '登录失效,请重新登录', icon: 'error' });
						this.goToLogin();
					}
					 else {
						uni.showToast({ title: res.result.message || '删除用户失败', icon: 'none' });
					}
				} catch (e) {
					uni.hideLoading();
					uni.showToast({ title: e.message || '删除用户操作失败', icon: 'none' });
				} finally {
					this.deletingUserId = null;
				}
			},
			handlePageChange(change) {
				const newPage = this.page + change;
				if (newPage >= 1 && newPage <= this.totalPages) {
					this.page = newPage;
					this.fetchUserList();
				}
			}
		}
	}
</script>

<style scoped>
	/* 样式与上一版本相同，此处省略以保持简洁，请沿用您之前的样式 */
	.user-management-container {
		padding: 20rpx;
		background-color: #f8f9fa;
		min-height: 100vh;
		box-sizing: border-box;
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
    .header-actions {
        display: flex;
    }
    .header-button {
        margin-left: 20rpx;
    }
	.page-title {
		font-size: 36rpx;
		font-weight: bold;
		color: #333;
	}
	.user-scroll-view {
		height: calc(100vh - 220rpx);
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
		margin-top: 20rpx;
		padding-top: 15rpx;
		border-top: 1rpx solid #eee;
		display: flex;
		justify-content: flex-end;
	}
	.action-button {
		margin-left: 15rpx;
	}
	.self-tag {
		font-size: 24rpx;
		color: #6c757d;
		align-self: center;
	}
	.picker {
		border: 1px solid #ced4da;
		padding: 8rpx 15rpx;
		border-radius: 8rpx;
		background-color: #f8f9fa;
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
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 20rpx 0;
		background-color: #fff;
		margin-top: 20rpx;
		border-radius: 12rpx;
		box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.03);
	}
	.pagination button {
		margin: 0 20rpx;
		font-size: 28rpx;
		padding: 10rpx 20rpx;
	}
	.page-info {
		font-size: 28rpx;
		color: #333;
	}
</style>