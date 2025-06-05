<template>
	<view class="statistics-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">每日订单统计与分析</text>
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

			<view v-if="!loading && dailyStats" class="stats-content">
				<view class="stats-section">
					<view class="section-header">订单概览</view>
					<view class="stats-summary-flex-wrap">
						<view class="stat-item"><text class="stat-label">总订单数:</text><text
								class="stat-value">{{ dailyStats.totalOrders }}</text></view>
						<view class="stat-item"
							v-if="dailyStats.totalCost !== null && dailyStats.totalCost !== undefined">
							<text class="stat-label">当日总成本:</text>
							<text class="stat-value cost-value">¥
								{{ parseFloat(dailyStats.totalCost).toFixed(2) }}</text>
						</view>
						<view class="stat-item"><text class="stat-label">CDK订单:</text><text
								class="stat-value">{{ dailyStats.cdkCount }}
								({{ dailyStats.typeDistribution && dailyStats.typeDistribution.cdk ? dailyStats.typeDistribution.cdk.toFixed(1) : '0.0' }}%)</text>
						</view>
						<view class="stat-item"><text class="stat-label">皮肤赠送:</text><text
								class="stat-value">{{ dailyStats.giftCount }}
								({{ dailyStats.typeDistribution && dailyStats.typeDistribution.gift ? dailyStats.typeDistribution.gift.toFixed(1) : '0.0' }}%)</text>
						</view>
						<view class="stat-item"><text class="stat-label">待处理:</text><text
								class="stat-value">{{ dailyStats.pendingCount }}</text></view>
						<view class="stat-item"><text class="stat-label">计时中:</text><text
								class="stat-value">{{ dailyStats.timingCount }}</text></view>
						<view class="stat-item"><text class="stat-label">待发货:</text><text
								class="stat-value">{{ dailyStats.readyToSendCount }}</text></view>
						<view class="stat-item"><text class="stat-label">已完成:</text><text
								class="stat-value">{{ dailyStats.completedCount }}</text></view>
					</view>
				</view>

				<view class="stats-section" v-if="dailyStats.csPerformance && dailyStats.csPerformance.length > 0">
					<view class="section-header">客服业绩 (按订单数)</view>
					<view v-for="cs in dailyStats.csPerformance" :key="cs.nickname" class="performance-item">
						<text class="name">{{ cs.nickname }}:</text>
						<text class="count">{{ cs.count }} 单</text>
					</view>
				</view>
				<view class="empty-text"
					v-else-if="!loading && dailyStats && (!dailyStats.csPerformance || dailyStats.csPerformance.length === 0)">
					当日无客服业绩数据
				</view>

				<view class="stats-section"
					v-if="dailyStats.supplierPerformance && dailyStats.supplierPerformance.length > 0">
					<view class="section-header">供货商业绩 (按订单数和成本)</view>
					<view v-for="supplier in dailyStats.supplierPerformance" :key="supplier.nickname"
						class="performance-item supplier-perf-item">
						<text class="name">{{ supplier.nickname }}:</text>
						<view class="details">
							<text class="count">{{ supplier.count }} 单</text>
							<text class="total-cost">总成本: ¥ {{ parseFloat(supplier.totalCost).toFixed(2) }}</text>
						</view>
					</view>
				</view>
				<view class="empty-text"
					v-else-if="!loading && dailyStats && (!dailyStats.supplierPerformance || dailyStats.supplierPerformance.length === 0)">
					当日无供货商业绩数据
				</view>

			</view>

			<view class="order-list-title" v-if="!loading && dailyOrders.length > 0">当日订单列表 ({{ dailyOrders.length }}条)
			</view>
			<view v-if="!loading && dailyOrders.length === 0 && selectedDate && !orderLoadError" class="empty-text">
				该日期暂无订单数据。</view>
			<view v-if="orderLoadError" class="error-text">{{orderLoadError}}</view>


			<scroll-view scroll-y class="order-scroll-view" v-if="!loading && dailyOrders.length > 0">
				<view v-for="order in dailyOrders" :key="order._id" class="order-card"
					@click="goToOrderDetails(order._id)">
					<view class="order-row"><text class="order-label">订单号:</text><text
							class="order-value important-value">{{ order.orderNumber }}</text></view>
					<view class="order-row"><text class="order-label">客服:</text><text
							class="order-value id-value">{{ order.csNickname || order.csId || 'N/A' }}</text></view>
					<view v-if="order.supplierId" class="order-row"><text class="order-label">供货商:</text><text
							class="order-value id-value">{{ order.supplierNickname || order.supplierId || 'N/A' }}</text>
					</view>
					<view class="order-row" v-if="order.costPrice !== null && order.costPrice !== undefined">
						<text class="order-label">成本价:</text>
						<text class="order-value cost-value">¥ {{ parseFloat(order.costPrice).toFixed(2) }}</text>
					</view>
					<view class="order-row"><text class="order-label">类型:</text><text class="order-value type-value"
							:class="order.orderType">{{ formatOrderType(order.orderType) }}</text></view>
					<view class="order-row"><text class="order-label">状态:</text><text class="order-value status-value"
							:class="order.status">{{ formatOrderStatus(order.status) }}</text></view>
					<view class="order-row"><text class="order-label">创建时间:</text><text
							class="order-value date-value">{{ formatDate(order.createTime) }}</text></view>
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
		mapActions,
		mapState
	} from 'vuex';
	import {
		formatDate,
		formatOrderStatus,
		formatOrderType
	} from '@/utils/formatters.js'; //

	export default {
		data() {
			return {
				selectedDate: this.getTodayDateString(),
				dailyOrders: [],
				dailyStats: null,
				loading: false,
				isPageLoading: true,
				orderLoadError: null,
				startDateLimit: '2020-01-01',
				endDateLimit: this.getTodayDateString(),
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'userRole']),
			...mapState('user', ['token']) //
		},
		onLoad() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			formatDate, //
			formatOrderStatus, //
			formatOrderType, //
			...mapActions('user', ['logout']), //

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
				this.fetchDailyOrdersAndStats();
			},

			onDateChange(e) {
				this.selectedDate = e.detail.value;
				this.fetchDailyOrdersAndStats();
			},

			async fetchDailyOrdersAndStats() {
				this.loading = true;
				this.dailyOrders = [];
				this.dailyStats = null;
				this.orderLoadError = null;
				if (!this.token) {
					uni.showToast({
						title: '登录状态异常，请重新登录',
						icon: 'none'
					});
					this.$store.dispatch('user/logout');
					this.loading = false;
					return;
				}

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center', //
						data: {
							action: 'getDailyOrderStats', //
							token: this.token,
							dateString: this.selectedDate
						}
					});

					if (res.result.code === 200) {
						this.dailyOrders = res.result.data;
						this.dailyStats = res.result.stats;
					} else if (res.result.code === 401) {
						this.orderLoadError = res.result.message || '登录失效';
						uni.showToast({
							title: this.orderLoadError,
							icon: 'error'
						});
						this.$store.dispatch('user/logout');
					} else {
						this.orderLoadError = res.result.message || '获取统计数据失败';
						uni.showToast({
							title: this.orderLoadError,
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('fetchDailyOrdersAndStats 调用失败:', err);
					this.orderLoadError = '请求统计数据异常';
					uni.showToast({
						title: this.orderLoadError,
						icon: 'error'
					});
				} finally {
					this.loading = false;
				}
			},
			goToOrderDetails(orderId) {
				uni.navigateTo({
					url: `/pages/common/orderDetails?id=${orderId}` //
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
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20rpx;
		background-color: #fff;
		padding: 20rpx;
		border-radius: 12rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
	}

	.page-title {
		font-size: 36rpx;
		font-weight: bold;
		color: #333;
	}

	.date-picker-section {
		background-color: #fff;
		padding: 20rpx;
		border-radius: 12rpx;
		margin-bottom: 20rpx;
		display: flex;
		justify-content: center;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
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

	.stats-content {
		/* Wrapper for all stat sections */
	}

	.stats-section {
		background-color: #fff;
		padding: 25rpx;
		border-radius: 12rpx;
		margin-bottom: 20rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
	}

	.section-header {
		font-size: 30rpx;
		font-weight: bold;
		color: #333;
		margin-bottom: 25rpx;
		padding-bottom: 15rpx;
		border-bottom: 1rpx solid #eee;
	}

	/* 修改订单概览区域的布局 (方案三：flex-wrap) */
	.stats-summary-flex-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 18rpx;
		/* 项目之间的统一间隙，可调整 */
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 27rpx;
		padding: 15rpx;
		/* 增加内边距 */
		border: 1rpx solid #e8e8e8;
		/* 边框更清晰 */
		border-radius: 8rpx;
		background-color: #f9f9f9;

		flex-basis: calc(50% - 10rpx);
		/* 尝试一行两个，减去部分gap，可调整 */
		min-width: 280rpx;
		/* 保证最小宽度，防止文字过度拥挤 */
		box-sizing: border-box;
		/* padding和border不额外增加宽度 */
		margin-bottom: 0;
		/* gap会处理间距，移除单独的margin-bottom */
	}

	.stat-label {
		color: #555;
		margin-right: 15rpx;
		/* 标签和值之间明确的间距 */
		white-space: nowrap;
	}

	.stat-value {
		color: #333;
		font-weight: bold;
		text-align: right;
		/* flex-shrink: 0; /* 移除，允许值换行如果需要 */
		word-break: break-word;
		/* 允许值在必要时换行 */
	}

	.cost-value {
		color: #e74c3c;
	}

	.performance-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 28rpx;
		padding: 12rpx 0;
		border-bottom: 1rpx solid #f0f0f0;
	}

	.performance-item:last-child {
		border-bottom: none;
	}

	.performance-item .name {
		color: #333;
		flex-basis: 45%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.performance-item .count {
		color: #007bff;
		font-weight: bold;
		margin-left: 10rpx;
	}

	.performance-item.supplier-perf-item .details {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		margin-left: 10rpx;
	}

	.performance-item .total-cost {
		font-size: 24rpx;
		color: #e74c3c;
	}

	.order-list-title {
		font-size: 32rpx;
		font-weight: bold;
		margin: 30rpx 0 15rpx;
		padding-left: 10rpx;
		color: #333;
	}

	.order-scroll-view {
		max-height: 600rpx;
		background-color: #fff;
		border-radius: 12rpx;
		padding: 0 10rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
		margin-bottom: 20rpx;
	}

	.order-card {
		background-color: #fdfdfd;
		border: 1px solid #e9e9e9;
		border-radius: 8rpx;
		padding: 20rpx;
		margin: 20rpx 0;
	}

	.order-row {
		display: flex;
		font-size: 26rpx;
		margin-bottom: 10rpx;
		line-height: 1.6;
	}

	.order-label {
		width: 150rpx;
		color: #666;
		flex-shrink: 0;
	}

	.order-value {
		flex: 1;
		color: #333;
		word-break: break-all;
	}

	.order-value.important-value {
		font-weight: 500;
		color: #007bff;
	}

	.id-value {
		color: #555;
	}

	.date-value {
		font-size: 24rpx;
		color: #777;
	}

	.type-value.cdk {
		color: #17a2b8;
	}

	.type-value.gift {
		color: #fd7e14;
	}

	.status-value.pending {
		color: #ffc107;
	}

	.status-value.timing {
		color: #007bff;
	}

	.status-value.ready_to_send {
		color: #fd7e14;
	}

	.status-value.completed {
		color: #28a745;
	}

	.status-value.cancelled {
		color: #6c757d;
	}

	.loading-text,
	.empty-text,
	.unauthorized-text,
	.error-text {
		text-align: center;
		color: #6c757d;
		margin-top: 50rpx;
		font-size: 28rpx;
		padding: 20rpx;
	}

	.error-text {
		color: #e74c3c;
		background-color: #fdd;
		border: 1rpx solid #fbb;
		border-radius: 8rpx;
	}

	.login-prompt-button {
		margin-top: 30rpx;
		background-color: #007bff;
		color: white;
	}
</style>