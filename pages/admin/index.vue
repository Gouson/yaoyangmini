<template>
	<view class="admin-dashboard-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-main-title">管理中心</text>
				<button class="logout-button-header" size="mini" @click="handleLogout">退出登录</button>
			</view>

			<view class="menu-grid">
				<view class="menu-item" @click="goToUserManagementPage">
					<image class="menu-icon" src="/static/icons/user-management.png"></image> <text
						class="menu-text">用户管理</text>
				</view>

				<view class="menu-item" @click="goToOrderListPage">
					<image class="menu-icon" src="/static/icons/order-management.png"></image> <text
						class="menu-text">订单管理</text>
				</view>
				<view class="menu-item" @click="goToStatisticsPage">
					<image class="menu-icon" src="/static/icons/statistics.png"></image> <text
						class="menu-text">订单统计</text>
				</view>
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
		mapActions
	} from 'vuex';

	export default {
		data() {
			return {
				isPageLoading: true,
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole'])
		},
		onShow() {
			this.isPageLoading = true;
			this.checkAdminAuth();
		},
		methods: {
			...mapActions('user', ['logout']),

			checkAdminAuth() {
				if (!this.$store.getters['user/isLoggedIn']) {
					this.$store.dispatch('user/logout');
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
			},

			navigateToUserHome(role) {
				let url = '/pages/login/login';
				if (role === 'cs') url = '/pages/cs/index';
				else if (role === 'supplier') url = '/pages/supplier/index';
				// 如果已经是 admin 角色但不知为何到了这里，可能保持不动或提示

				const currentPages = getCurrentPages();
				const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
				if (url && url !== `/${currentPageRoute}`) {
					uni.reLaunch({
						url
					});
				} else if (!url) {
					this.$store.dispatch('user/logout');
				}
			},
			goToStatisticsPage() { // 【新增方法】
				uni.navigateTo({
					url: '/pages/admin/statistics'
				});
			},
			goToLogin() {
				this.$store.dispatch('user/logout');
			},

			goToUserManagementPage() {
				uni.navigateTo({
					url: '/pages/admin/userManagement' // 跳转到新的用户管理页面
				});
			},
			goToOrderListPage() {
				uni.navigateTo({
					url: '/pages/admin/orderList'
				});
			},
			handleLogout() {
				this.logout();
			}
		}
	}
</script>

<style scoped>
	.admin-dashboard-container {
		padding: 20rpx;
		background-color: #f8f9fa;
		min-height: 100vh;
		box-sizing: border-box;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 40rpx;
		/* 增加与菜单的间距 */
		padding: 20rpx;
		background-color: #fff;
		border-radius: 12rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}

	.page-main-title {
		font-size: 40rpx;
		font-weight: bold;
		color: #333;
	}

	.logout-button-header {
		background-color: #dc3545;
		color: white;
		border: none;
	}

	.menu-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200rpx, 1fr));
		/* 响应式网格 */
		gap: 30rpx;
		/* 网格项之间的间距 */
	}

	.menu-item {
		background-color: #fff;
		border-radius: 12rpx;
		padding: 40rpx 20rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
		text-align: center;
		transition: transform 0.2s ease-in-out;
	}

	.menu-item:active {
		transform: scale(0.95);
	}

	.menu-icon {
		width: 80rpx;
		height: 80rpx;
		margin-bottom: 20rpx;
	}

	.menu-text {
		font-size: 28rpx;
		color: #495057;
	}

	.loading-text,
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