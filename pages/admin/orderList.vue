<template>
	<view class="admin-order-list-container">
		<view class="header">
			<text class="page-title">所有订单管理</text>
			<button class="refresh-button" size="mini" @click="fetchOrders(true)" :loading="loading">刷新</button>
		</view>

		<view class="filters-section">
			<picker class="filter-picker" @change="onStatusFilterChange" :value="statusFilterIndex"
				:range="statusOptions" range-key="text">
				<view>状态: {{ statusOptions[statusFilterIndex].text }}</view>
			</picker>
			<picker class="filter-picker" @change="onTypeFilterChange" :value="typeFilterIndex" :range="typeOptions"
				range-key="text">
				<view>类型: {{ typeOptions[typeFilterIndex].text }}</view>
			</picker>
		</view>

		<view v-if="loading && orderList.length === 0" class="loading-text">订单加载中...</view>
		<view v-if="!loading && orderList.length === 0" class="empty-text">暂无订单数据。</view>

		<scroll-view scroll-y class="order-scroll-view" @scrolltolower="loadMoreOrders">
			<view v-for="order in orderList" :key="order._id" class="order-card" @click="goToOrderDetails(order._id)">
				<view class="order-row"><text class="order-label">订单号:</text><text
						class="order-value">{{ order.orderNumber }}</text></view>
				<view class="order-row"><text class="order-label">买家ID:</text><text
						class="order-value">{{ order.buyerGameId }}</text></view>
				<view class="order-row"><text class="order-label">类型:</text><text class="order-value type-value"
						:class="order.orderType">{{ formatOrderType(order.orderType) }}</text></view>
				<view class="order-row"><text class="order-label">状态:</text><text class="order-value status-value"
						:class="order.status">{{ formatOrderStatus(order.status) }}</text></view>
				<view class="order-row"><text class="order-label">客服:</text><text
						class="order-value id-value">{{ order.csNickname }}</text></view>
				<view v-if="order.supplierId" class="order-row"><text class="order-label">供货商:</text><text
						class="order-value id-value">{{ order.supplierNickname }}</text></view>
				<view class="order-row"><text class="order-label">创建时间:</text><text
						class="order-value">{{ formatDate(order.createTime) }}</text></view>
			</view>
			<view v-if="loadingMore" class="loading-more-text">加载更多...</view>
			<view v-if="!hasMore && orderList.length > 0" class="loading-more-text">没有更多订单了</view>
		</scroll-view>
	</view>
</template>

<script>
	import {
		mapGetters,
		mapActions
	} from 'vuex';
	// 假设您已将格式化函数放入 utils
	import {
		formatDate,
		formatOrderStatus,
		formatOrderType
	} from '@/utils/formatters.js';

	export default {
		data() {
			return {
				orderList: [],
				loading: false,
				isPageLoading: true, // 初始页面加载状态

				filters: {
					status: '', // '' 表示所有状态
					orderType: '', // '' 表示所有类型
				},
				statusOptions: [{
						value: '',
						text: '所有状态'
					},
					{
						value: 'pending',
						text: '待处理'
					},
					{
						value: 'timing',
						text: '计时中'
					},
					{
						value: 'ready_to_send',
						text: '待发货'
					},
					{
						value: 'completed',
						text: '已完成'
					},
					{
						value: 'cancelled',
						text: '已取消'
					},
				],
				statusFilterIndex: 0,
				typeOptions: [{
						value: '',
						text: '所有类型'
					},
					{
						value: 'cdk',
						text: 'CDK激活码'
					},
					{
						value: 'gift',
						text: '皮肤赠送'
					},
				],
				typeFilterIndex: 0,

				// 分页
				currentPage: 1,
				pageSize: 15,
				totalOrders: 0,
				hasMore: true,
				loadingMore: false,
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'userRole', 'token'])
		},
		onLoad() { // 页面首次加载时
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		onShow() { // 每次页面显示时，如果不是首次加载，可以考虑是否刷新
			if (!this.isPageLoading) {
				// 可以选择在这里刷新，或者让用户手动刷新
				// this.fetchOrders(true); 
			}
		},
		// onReachBottom() { // uni-app 页面触底事件
		//   this.loadMoreOrders();
		// },
		methods: {
			// 从 utils 导入的函数可以直接使用
			formatDate,
			formatOrderStatus,
			formatOrderType,
			...mapActions('user', ['logout']),

			checkAdminAuthAndLoadData() {
				if (!this.isLoggedIn || this.userRole !== 'admin') {
					uni.showToast({
						title: '权限不足或未登录',
						icon: 'error',
						duration: 2000
					});
					setTimeout(() => {
						this.$store.dispatch('user/logout');
					}, 2000);
					this.isPageLoading = false;
					return;
				}
				this.isPageLoading = false;
				this.fetchOrders(true); // 初始加载，重置分页
			},

			async fetchOrders(reset = false) {
				if (reset) {
					this.currentPage = 1;
					this.orderList = [];
					this.hasMore = true;
				}
				if (!this.hasMore && !reset) return; // 没有更多数据了，且不是重置操作

				this.loading = true;
				if (this.currentPage > 1) this.loadingMore = true;

				const currentToken = this.token || uni.getStorageSync('userToken');
				if (!currentToken) {
					this.$store.dispatch('user/logout');
					this.loading = false;
					this.loadingMore = false;
					return;
				}

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'viewOrders',
							token: currentToken,
							statusFilter: this.filters.status,
							typeFilter: this.filters.orderType,
							page: this.currentPage,
							pageSize: this.pageSize
						}
					});

					if (res.result.code === 200) {
						if (reset) {
							this.orderList = res.result.data;
						} else {
							this.orderList = this.orderList.concat(res.result.data);
						}
						this.totalOrders = res.result.total;
						this.hasMore = this.orderList.length < this.totalOrders;
						if (res.result.data.length > 0 && !reset) this.currentPage++;

					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error'
						});
						this.$store.dispatch('user/logout');
					} else {
						uni.showToast({
							title: res.result.message || '加载订单失败',
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('fetchOrders 调用失败:', err);
					uni.showToast({
						title: '请求订单列表异常',
						icon: 'error'
					});
				} finally {
					this.loading = false;
					this.loadingMore = false;
				}
			},

			onStatusFilterChange(e) {
				this.statusFilterIndex = e.detail.value;
				this.filters.status = this.statusOptions[this.statusFilterIndex].value;
				this.fetchOrders(true); // 重置并按新筛选条件获取
			},
			onTypeFilterChange(e) {
				this.typeFilterIndex = e.detail.value;
				this.filters.orderType = this.typeOptions[this.typeFilterIndex].value;
				this.fetchOrders(true); // 重置并按新筛选条件获取
			},

			loadMoreOrders() { // 用于 scroll-view 的 @scrolltolower 事件
				if (!this.loadingMore && this.hasMore) {
					console.log('触发加载更多...');
					this.fetchOrders(false); // 不是重置，是加载下一页
				}
			},

			goToOrderDetails(orderId) {
				uni.navigateTo({
					url: `/pages/common/orderDetails?id=${orderId}`
				});
			}
		}
	}
</script>

<style scoped>
	.admin-order-list-container {
		padding: 20rpx;
		background-color: #f4f4f4;
		min-height: 100vh;
		box-sizing: border-box;
	}

	.header {
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

	.refresh-button {
		background-color: #007aff;
		color: white;
		font-size: 24rpx;
	}

	.filters-section {
		display: flex;
		gap: 20rpx;
		/* picker之间的间距 */
		margin-bottom: 20rpx;
		padding: 20rpx;
		background-color: #fff;
		border-radius: 12rpx;
	}

	.filter-picker {
		flex: 1;
		height: 70rpx;
		line-height: 70rpx;
		border: 1px solid #e0e0e0;
		border-radius: 8rpx;
		padding: 0 20rpx;
		font-size: 26rpx;
		background-color: #f9f9f9;
		text-align: center;
	}

	.order-scroll-view {
		height: calc(100vh - 280rpx);
		/* 根据实际页面顶部元素高度调整 */
		background-color: #fff;
		border-radius: 12rpx;
		padding: 0 20rpx;
	}

	.order-card {
		/* 与 cs/index.vue 和 supplier/index.vue 类似 */
		background-color: #f9f9f9;
		border: 1px solid #e9e9e9;
		border-radius: 8rpx;
		padding: 20rpx;
		margin: 20rpx 0;
		/* 调整卡片间距 */
	}

	.order-row,
	.order-label,
	.order-value,
	.type-value,
	.status-value,
	.id-value {
		/* 复用之前的样式 */
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

	.status-value.completed {
		color: #09bb07;
	}

	.status-value.cancelled {
		color: #888888;
	}

	.id-value {
		color: #007aff;
	}

	.loading-text,
	.empty-text {
		text-align: center;
		color: #999;
		padding: 50rpx 0;
		font-size: 28rpx;
	}

	.loading-more-text {
		text-align: center;
		color: #999;
		padding: 20rpx 0;
		font-size: 24rpx;
	}
</style>