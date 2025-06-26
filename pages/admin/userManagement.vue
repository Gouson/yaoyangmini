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
					
					<view class="user-info-line" v-if="user.role !== 'admin'">
						<text class="label">所属游戏:</text>
						<picker mode="selector" class="picker" :range="gameList" range-key="name"
							:value="getGameIndex(user.game_id)" @change="e => handleGameChange(e, user._id, user.nickname)">
							<view class="picker-value">{{ user.game_name || '未分配' }}</view>
						</picker>
					</view>

					<view class="user-info-line">
						<text class="label">角色:</text>
						<picker mode="selector" class="picker" :range="roleOptions" range-key="text"
							:value="getRoleIndex(user.role)" @change="e => handleRoleChange(e, user._id, user.nickname)"
							:disabled="user._id === currentUser._id">
							<view class="picker-value">{{ formatRole(user.role) }}</view>
						</picker>
					</view>

					<view class="user-info-line">
						<text class="label">状态:</text>
						<view class="status-control">
							<switch class="switch" :checked="user.status === 1"
								@change="e => handleStatusChange(e, user._id, user.nickname)" 
								:disabled="user._id === currentUser._id"/>
							<text class="status-text">{{ user.status === 1 ? '启用' : '禁用' }}</text>
						</view>
					</view>
					<view class="user-actions">
						<button
							v-if="currentUser._id !== user._id"
							type="warn"
							size="mini"
							@click="confirmDeleteUser(user)"
							:loading="user._id === deletingUserId"
							:disabled="user._id === deletingUserId"
							class="action-button delete-button"
						>
							删除用户
						</button>
						<text v-if="currentUser._id === user._id" class="self-tag">（这是您自己）</text>
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
	import { mapGetters, mapActions, mapState } from 'vuex';

	export default {
		data() {
			return {
				userList: [],
				loadingUsers: false,
				isPageLoading: true,
				deletingUserId: null,
				roleOptions: [
					{ value: 'cs', text: '客服' },
					{ value: 'supplier', text: '供货商' },
					{ value: 'admin', text: '管理员' }
				],
				page: 1,
				pageSize: 10,
				total: 0,
				gameList: [],
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
				if (!this.isLoggedIn || this.userRole !== 'admin') {
					uni.showToast({ title: '无权限访问', icon: 'error' });
					this.logout();
					return;
				}
				this.isPageLoading = false;
				await this.fetchGames();
				await this.fetchUserList(true);
			},
			async fetchGames() {
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getGames', token: this.token }});
					if (res.result.code === 200) {
						this.gameList = res.result.data;
					}
				} catch (e) {
					console.error("加载游戏列表失败", e);
				}
			},
			getGameIndex(gameId) {
				if (!gameId) return -1;
				return this.gameList.findIndex(g => g._id === gameId);
			},
			formatRole(roleValue) {
				const role = this.roleOptions.find(r => r.value === roleValue);
				return role ? role.text : '未知';
			},
			getRoleIndex(roleValue) {
				return this.roleOptions.findIndex(r => r.value === roleValue);
			},
			navigateToAddUserPage() {
				uni.navigateTo({ url: '/pages/admin/addUser' });
			},
			async fetchUserList(resetPage = false) {
				if (resetPage) this.page = 1;
				this.loadingUsers = true;
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'adminListUsers', token: this.token, page: this.page, pageSize: this.pageSize } });
					if (res.result.code === 200) {
						this.userList = res.result.data;
						this.total = res.result.total;
					} else {
						uni.showToast({ title: res.result.message, icon: 'error' });
						if (res.result.code === 401) this.logout();
					}
				} catch (err) {
					uni.showToast({ title: '请求用户列表异常', icon: 'error' });
				} finally {
					this.loadingUsers = false;
				}
			},
			async handleGameChange(event, userId, nickname) {
				const selectedGame = this.gameList[event.detail.value];
				if (!selectedGame) return;
				uni.showModal({
					title: '确认修改游戏',
					content: `确定要将用户 "${nickname}" 分配到游戏 "${selectedGame.name}" 吗?`,
					success: async res => {
						if (res.confirm) {
							await this.updateUser(userId, { game_id: selectedGame._id });
						}
					}
				});
			},
			async handleRoleChange(event, userId, nickname) {
				const newRole = this.roleOptions[event.detail.value];
				uni.showModal({
					title: '确认修改角色',
					content: `确定要将用户 "${nickname}" 的角色修改为 "${newRole.text}"?`,
					success: async res => {
						if (res.confirm) {
							await this.updateUser(userId, { newRole: newRole.value });
						}
					}
				});
			},
			async handleStatusChange(event, userId, nickname) {
				const newStatus = event.detail.value ? 1 : 0;
				uni.showModal({
					title: '确认修改状态',
					content: `确定要将用户 "${nickname}" 的状态修改为 "${newStatus === 1 ? '启用' : '禁用'}"?`,
					success: async res => {
						if (res.confirm) {
							await this.updateUser(userId, { newStatus: newStatus });
						}
					}
				});
			},
			async updateUser(userId, updateData) {
				uni.showLoading({ title: '更新中...' });
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'adminUpdateUser', token: this.token, userIdToUpdate: userId, ...updateData } });
					if (res.result.code === 200) {
						uni.showToast({ title: '更新成功', icon: 'success' });
					} else {
						uni.showToast({ title: res.result.message || '更新失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '更新请求异常', icon: 'error' });
				} finally {
					uni.hideLoading();
					await this.fetchUserList();
				}
			},
			confirmDeleteUser(user) {
				uni.showModal({
					title: '确认删除',
					content: `您确定要永久删除用户 "${user.nickname || user.username}" 吗？`,
					success: async (res) => {
						if (res.confirm) this.deleteUser(user._id);
					},
				});
			},
			async deleteUser(userIdToDelete) {
				this.deletingUserId = userIdToDelete;
				uni.showLoading({ title: '删除中...' });
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'adminDeleteUser', token: this.token, userIdToDelete: userIdToDelete } });
					if (res.result && res.result.code === 200) {
						uni.showToast({ title: '用户删除成功', icon: 'success' });
						if (this.userList.length === 1 && this.page > 1) this.page--;
						await this.fetchUserList();
					} else {
						uni.showToast({ title: res.result.message || '删除用户失败', icon: 'none' });
					}
				} catch (e) {
					uni.showToast({ title: '删除用户操作失败', icon: 'none' });
				} finally {
					this.deletingUserId = null;
					uni.hideLoading();
				}
			},
			handlePageChange(change) {
				const newPage = this.page + change;
				if (newPage >= 1 && newPage <= this.totalPages) {
					this.page = newPage;
					this.fetchUserList();
				}
			},
			goToLogin() {
				this.logout();
			}
		}
	}
</script>

<style scoped>
	.user-management-container { padding: 20rpx; background-color: #f8f9fa; min-height: 100vh; box-sizing: border-box; }
	.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30rpx; padding: 20rpx; background-color: #fff; border-radius: 12rpx; box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05); }
    .header-actions { display: flex; }
    .header-button { margin-left: 20rpx; }
	.page-title { font-size: 36rpx; font-weight: bold; color: #333; }
	.user-scroll-view { height: calc(100vh - 220rpx); }
	.user-card { background-color: #fff; border: 1px solid #e9ecef; border-radius: 8rpx; padding: 25rpx; margin-bottom: 20rpx; box-shadow: 0 1rpx 5rpx rgba(0, 0, 0, 0.03); }
	.user-info-line { display: flex; align-items: center; font-size: 28rpx; margin-bottom: 15rpx; }
	.label { color: #6c757d; width: 140rpx; flex-shrink: 0; }
	.value { color: #343a40; flex: 1; word-break: break-all; }
	.id-value { font-size: 24rpx; color: #6c757d; }
	.user-actions { margin-top: 20rpx; padding-top: 15rpx; border-top: 1rpx solid #eee; display: flex; justify-content: flex-end; }
	.action-button { margin-left: 15rpx; }
	.self-tag { font-size: 24rpx; color: #6c757d; align-self: center; }
	.picker { border: 1px solid #ced4da; padding: 8rpx 15rpx; border-radius: 8rpx; background-color: #f8f9fa; flex-grow: 1; text-align: center; }
	.picker-value { font-size: 26rpx; color: #495057; }
	.status-control { display: flex; align-items: center; }
	.switch { transform: scale(0.8); margin-left: -10rpx; }
	.status-text { font-size: 26rpx; margin-left: 10rpx; color: #495057; }
	.loading-text, .empty-text, .unauthorized-text { text-align: center; color: #6c757d; margin-top: 100rpx; font-size: 28rpx; }
	.login-prompt-button { margin-top: 30rpx; background-color: #007bff; color: white; }
	.pagination { display: flex; justify-content: center; align-items: center; padding: 20rpx 0; background-color: #fff; margin-top: 20rpx; border-radius: 12rpx; box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.03); }
	.pagination button { margin: 0 20rpx; font-size: 28rpx; padding: 10rpx 20rpx; }
	.page-info { font-size: 28rpx; color: #333; }
</style>