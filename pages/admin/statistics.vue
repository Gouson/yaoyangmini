<template>
	<view class="statistics-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">每日订单统计</text>
			</view>

			<view class="date-picker-section">
				<picker mode="date" :value="selectedDate" :start="startDateLimit" :end="endDateLimit"
					@change="onDateChange">
					<view class="picker-display">
						已选日期: {{ selectedDate }} <text class="arrow">▼</text>
					</view>
				</picker>
			</view>

			<view v-if="loading" class="loading-text">统计数据加载中...</view>

			<view v-if="!loading && dailyStats" class="stats-summary-section">
				<view class="stat-item"><text class="stat-label">总订单数:</text><text
						class="stat-value">{{ dailyStats.totalOrders }}</text></view>
				<view class="stat-item"><text class="stat-label">CDK订单:</text><text
						class="stat-value">{{ dailyStats.cdkCount }}</text></view>
				<view class="stat-item"><text class="stat-label">皮肤赠送:</text><text
						class="stat-value">{{ dailyStats.giftCount }}</text></view>
				<view class="stat-item"><text class="stat-label">待处理:</text><text
						class="stat-value">{{ dailyStats.pendingCount }}</text></view>
				<view class="stat-item"><text class="stat-label">计时中:</text><text
						class="stat-value">{{ dailyStats.timingCount }}</text></view>
				<view class="stat-item"><text class="stat-label">待发货:</text><text
						class="stat-value">{{ dailyStats.readyToSendCount }}</text></view>
				<view class="stat-item"><text class="stat-label">已完成:</text><text
						class="stat-value">{{ dailyStats.completedCount }}</text></view>
			</view>

			<view class="order-list-title" v-if="dailyOrders.length > 0">当日订单列表 ({{ dailyOrders.length }}条)</view>
			<view v-if="!loading && dailyOrders.length === 0 && selectedDate" class="empty-text">该日期暂无订单数据。</view>

			<scroll-view scroll-y class="order-scroll-view">
				<view v-for="order in dailyOrders" :key="order._id" class="order-card"
					@click="goToOrderDetails(order._id)">
					<view class="order-row"><text class="order-label">订单号:</text><text
							class="order-value">{{ order.orderNumber }}</text></view>
					<view class="order-row"><text class="order-label">客服:</text><text
							class="order-value id-value">{{ order.csNickname }}</text></view>
					<view v-if="order.supplierId" class="order-row"><text class="order-label">供货商:</text><text
							class="order-value id-value">{{ order.supplierNickname }}</text></view>
					<view class="order-row"><text class="order-label">买家ID:</text><text
							class="order-value">{{ order.buyerGameId }}</text></view>
					<view class="order-row"><text class="order-label">类型:</text><text class="order-value type-value"
							:class="order.orderType">{{ formatOrderType(order.orderType) }}</text></view>
					<view class="order-row"><text class="order-label">状态:</text><text class="order-value status-value"
							:class="order.status">{{ formatOrderStatus(order.status) }}</text></view>
				</view>
			</scroll-view>
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-text">
			<text>权限不足或未登录。</text>
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
	import {
		formatDate,
		formatOrderStatus,
		formatOrderType
	} from '@/utils/formatters.js'; // 确保路径正确

	export default {
		data() {
			return {
				selectedDate: this.getTodayDateString(), // 默认为今天
				dailyOrders: [],
				dailyStats: null,
				loading: false,
				isPageLoading: true,
				startDateLimit: '2020-01-01', // 日期选择器起始限制
				endDateLimit: this.getTodayDateString(), // 日期选择器结束限制 (今天)
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'userRole', 'token'])
		},
		onLoad() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			formatDate,
			formatOrderStatus,
			formatOrderType, // 从 utils 导入
			...mapActions('user', ['logout']),

			getTodayDateString() {
				const date = new Date();
				const year = date.getFullYear();
				const month = ('0' + (date.getMonth() + 1)).slice(-2);
				const day = ('0' + date.getDate()).slice(-2);
				return `${year}-${month}-${day}`;
			},

			checkAdminAuthAndLoadData() {
				if (!this.isLoggedIn || this.userRole !== 'admin') {
					uni.showToast({
						title: '权限不足',
						icon: 'error'
					});
					setTimeout(() => {
						this.$store.dispatch('user/logout');
					}, 1500);
					this.isPageLoading = false;
					return;
				}
				this.isPageLoading = false;
				this.fetchDailyOrdersAndStats(); // 初始加载当天数据
			},

			onDateChange(e) {
				this.selectedDate = e.detail.value;
				this.fetchDailyOrdersAndStats();
			},

			async fetchDailyOrdersAndStats() {
				this.loading = true;
				this.dailyOrders = [];
				this.dailyStats = null;
				const currentToken = this.token || uni.getStorageSync('userToken');
				if (!currentToken) {
					this.$store.dispatch('user/logout');
					this.loading = false;
					return;
				}

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'getDailyOrderStats',
							token: currentToken,
							dateString: this.selectedDate
						}
					});

					if (res.result.code === 200) {
						this.dailyOrders = res.result.data;
						this.dailyStats = res.result.stats;
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error'
						});
						this.$store.dispatch('user/logout');
					} else {
						uni.showToast({
							title: res.result.message || '获取统计数据失败',
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('fetchDailyOrdersAndStats 调用失败:', err);
					uni.showToast({
						title: '请求统计数据异常',
						icon: 'error'
					});
				} finally {
					this.loading = false;
				}
			},
			goToOrderDetails(orderId) {
				uni.navigateTo({
					url: `/pages/common/orderDetails?id=${orderId}`
				});
			},
			goToLogin() {
				this.$store.dispatch('user/logout');
			}
		}
	}
</script>

<style scoped>
	.statistics-container {
		padding: 20rpx;
		background-color: #f4f4f4;
		min-height: 100vh;
	}

	.header {
		/* ... 与 admin/orderList 类似 ... */
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20rpx;
		background-color: #fff;
		padding: 20rpx;
		border-radius: 12rpx;
	}

	.page-title {
		font-size: 36rpx;
		font-weight: bold;
	}

	.date-picker-section {
		background-color: #fff;
		padding: 20rpx;
		border-radius: 12rpx;
		margin-bottom: 20rpx;
		display: flex;
		justify-content: center;
	}

	.picker-display {
		border: 1px solid #007aff;
		color: #007aff;
		padding: 15rpx 30rpx;
		border-radius: 8rpx;
		font-size: 30rpx;
		text-align: center;
	}

	.arrow {
		margin-left: 10rpx;
	}

	.stats-summary-section {
		background-color: #fff;
		padding: 30rpx;
		border-radius: 12rpx;
		margin-bottom: 20rpx;
		display: grid;
		grid-template-columns: 1fr 1fr;
		/* 两列显示统计 */
		gap: 20rpx;
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		font-size: 28rpx;
	}

	.stat-label {
		color: #666;
	}

	.stat-value {
		color: #333;
		font-weight: bold;
	}

	.order-list-title {
		font-size: 32rpx;
		font-weight: bold;
		margin: 30rpx 0 20rpx;
		padding-left: 10rpx;
	}

	.order-scroll-view {
		/* 与 admin/orderList 类似 */
		height: calc(100vh - 600rpx);
		/* 根据实际页面元素高度粗略估算 */
		background-color: #fff;
		border-radius: 12rpx;
		padding: 0 20rpx;
	}

	.order-card {
		/* 与 admin/orderList 类似 */
		background-color: #f9f9f9;
		border: 1px solid #e9e9e9;
		border-radius: 8rpx;
		padding: 20rpx;
		margin: 20rpx 0;
	}

	.order-row,
	.order-label,
	.order-value,
	.type-value,
	.status-value {
		/* 复用样式 */
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
	}

	.type-value.gift {
		color: #e64340;
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

	.status-value.completed {
		color: #09bb07;
	}

	.loading-text,
	.empty-text,
	.unauthorized-text {
		/* ... */
		text-align: center;
		color: #6c757d;
		margin-top: 50rpx;
		font-size: 28rpx;
	}

	.login-prompt-button {
		margin-top: 30rpx;
		background-color: #007bff;
		color: white;
	}
</style>