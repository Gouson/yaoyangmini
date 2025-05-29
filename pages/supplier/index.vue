<template>
	<view class="supplier-dashboard-container">
		<view v-if="isLoggedIn && userRole === 'supplier'">
			<view class="header">
				<text class="welcome-text">欢迎, 供货商 {{ currentUser.nickname || currentUser.username }}</text>
			</view>

			<view class="order-list-section">
				<view class="list-header">
					<text class="list-title">我的任务订单</text>
					<button class="refresh-button" size="mini" @click="fetchSupplierOrders"
						:loading="loadingOrders">刷新</button>
				</view>

				<view v-if="loadingOrders && orderList.length === 0" class="loading-text">订单加载中...</view>
				<view v-if="!loadingOrders && orderList.length === 0" class="empty-text">暂无需要您处理的订单。</view>

				<scroll-view scroll-y class="order-scroll-view">
					<view v-for="order in orderList" :key="order._id" class="order-card"
						@click="goToOrderDetails(order._id)">
						<view class="order-row">
							<text class="order-label">订单号:</text>
							<text class="order-value">{{ order.orderNumber }}</text>
						</view>
						<view class="order-row">
							<text class="order-label">买家ID:</text>
							<text class="order-value">{{ order.buyerGameId }}</text>
						</view>
						<view class="order-row">
							<text class="order-label">类型:</text>
							<text class="order-value type-value"
								:class="order.orderType">{{ formatOrderType(order.orderType) }}</text>
						</view>
						<view class="order-row">
							<text class="order-label">状态:</text>
							<text class="order-value status-value"
								:class="order.status">{{ formatOrderStatus(order.status) }}</text>
						</view>
						<view class="order-row">
							<text class="order-label">创建时间:</text>
							<text class="order-value">{{ formatDate(order.createTime) }}</text>
						</view>
						<view v-if="order.orderType === 'gift' && order.expireTime" class="order-row">
							<text class="order-label">预计到期:</text>
							<text class="order-value important-time">{{ formatDate(order.expireTime) }}</text>
						</view>
					</view>
				</scroll-view>
			</view>
			<button class="logout-button" @click="handleLogout">退出登录</button>
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-container">
			<text>权限不足或未登录。请以供货商身份登录。</text>
			<button size="mini" @click="goToLogin" class="login-prompt-button">去登录</button>
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
				orderList: [],
				loadingOrders: false,
				isPageLoading: true,
				// pagination related data
				// currentPage: 1,
				// pageSize: 10,
				// totalOrders: 0,
				// hasMore: true
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole', 'token'])
		},
		onShow() {
			this.isPageLoading = true;
			this.checkSupplierAuthAndLoadData();
		},
		methods: {
			...mapActions('user', ['logout']),

			checkSupplierAuthAndLoadData() {
				if (!this.isLoggedIn) {
					this.$store.dispatch('user/logout');
					this.isPageLoading = false;
					return;
				}
				if (this.userRole !== 'supplier') {
					uni.showToast({
						title: '权限不足',
						icon: 'error',
						duration: 1500
					});
					this.navigateToUserHome(this.userRole);
					this.isPageLoading = false;
					return;
				}
				this.isPageLoading = false;
				this.fetchSupplierOrders();
			},

			async fetchSupplierOrders() {
				this.loadingOrders = true;
				const currentToken = this.token || uni.getStorageSync('userToken');
				if (!currentToken) {
					this.goToLogin();
					this.loadingOrders = false;
					return;
				}

				try {
					// 后端 order-center 的 viewOrders action 会根据 Supplier 角色自动过滤订单
					// 返回：所有 'pending' 订单，以及 supplierId 是当前用户且状态为 'timing' 或 'ready_to_send' 的订单
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'viewOrders',
							token: currentToken,
							// page: this.currentPage,
							// pageSize: this.pageSize
						}
					});

					if (res.result.code === 200) {
						this.orderList = res.result.data;
						// this.totalOrders = res.result.total;
						// this.hasMore = this.orderList.length < this.totalOrders;
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error',
							duration: 1500
						});
						this.goToLogin();
					} else {
						uni.showToast({
							title: res.result.message || '加载订单失败',
							icon: 'error',
							duration: 1500
						});
					}
				} catch (err) {
					console.error('fetchSupplierOrders 调用失败:', err);
					uni.showToast({
						title: '请求订单列表异常',
						icon: 'error',
						duration: 1500
					});
				} finally {
					this.loadingOrders = false;
				}
			},

			goToOrderDetails(orderId) {
				uni.navigateTo({
					url: `/pages/common/orderDetails?id=${orderId}`
				});
			},

			// --- Helper methods (can be moved to utils.js) ---
			formatOrderType(type) {
				if (type === 'cdk') return 'CDK激活码';
				if (type === 'gift') return '皮肤赠送';
				return '未知类型';
			},
			formatOrderStatus(status) {
				const statusMap = {
					pending: '待处理',
					timing: '计时中',
					ready_to_send: '待发货',
					completed: '已完成',
					cancelled: '已取消'
				};
				return statusMap[status] || '未知状态';
			},
			formatDate(dateString) {
				if (!dateString) return 'N/A';
				const date = new Date(dateString);
				return `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)} ${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}`;
			},

			handleLogout() {
				this.logout();
			},
			goToLogin() {
				this.$store.dispatch('user/logout');
			},
			navigateToUserHome(role) {
				let url = '/pages/login/login';
				if (role === 'admin') url = '/pages/admin/index';
				else if (role === 'cs') url = '/pages/cs/index';

				const currentPages = getCurrentPages();
				const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
				if (url !== `/${currentPageRoute}`) {
					uni.reLaunch({
						url
					});
				}
			}
		}
	}
</script>

<style scoped>
	/* 大部分样式可以复用 pages/cs/index.vue 中的样式，这里只列出一些差异或重点 */
	.supplier-dashboard-container {
		padding: 20rpx;
		background-color: #f4f4f4;
		min-height: 100vh;
	}

	.header {
		background-color: #ffffff;
		padding: 30rpx 20rpx;
		border-radius: 12rpx;
		margin-bottom: 20rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.03);
	}

	.welcome-text {
		font-size: 32rpx;
		font-weight: bold;
		color: #333;
	}

	.order-list-section {
		background-color: #ffffff;
		padding: 20rpx;
		border-radius: 12rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.03);
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20rpx;
		padding-bottom: 20rpx;
		border-bottom: 1px solid #f0f0f0;
	}

	.list-title {
		font-size: 32rpx;
		font-weight: bold;
		color: #333;
	}

	.refresh-button {
		background-color: #f0f0f0;
		color: #333;
		font-size: 24rpx;
		padding: 0 20rpx;
		height: 50rpx;
		line-height: 50rpx;
	}

	.order-scroll-view {
		height: calc(100vh - 380rpx);
		/* 根据实际页面布局调整高度 */
	}

	.order-card {
		background-color: #f9f9f9;
		border: 1px solid #e9e9e9;
		border-radius: 8rpx;
		padding: 20rpx;
		margin-bottom: 20rpx;
	}

	.order-row {
		display: flex;
		font-size: 26rpx;
		margin-bottom: 8rpx;
		line-height: 1.6;
	}

	.order-label {
		width: 150rpx;
		color: #666;
	}

	.order-value {
		flex: 1;
		color: #333;
		word-break: break-all;
	}

	.type-value.cdk {
		color: #2a9ff6;
		font-weight: bold;
	}

	.type-value.gift {
		color: #e64340;
		font-weight: bold;
	}

	.status-value.pending {
		color: #ff9900;
	}

	.status-value.timing {
		color: #2a9ff6;
	}

	.status-value.ready_to_send {
		color: #1aad19;
	}

	/* 假设这是定时器更新后的状态 */
	.status-value.completed {
		color: #09bb07;
	}

	.important-time {
		color: #e64340;
		font-weight: bold;
	}

	.loading-text,
	.empty-text {
		text-align: center;
		color: #999;
		padding: 50rpx 0;
		font-size: 28rpx;
	}

	.logout-button {
		margin-top: 40rpx;
		background-color: #e64340;
		color: white;
	}

	.unauthorized-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 70vh;
		text-align: center;
		color: #666;
		font-size: 28rpx;
	}

	.login-prompt-button {
		margin-top: 30rpx;
		background-color: #007aff;
		color: white;
	}
</style>