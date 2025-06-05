<template>
	<view class="user-management-container"> <view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">所有订单管理</text> <view class="header-actions">
					<button size="mini" @click="fetchOrderList(true)" :loading="loadingOrders" class="header-button">刷新列表</button>
					</view>
			</view>

			<view v-if="loadingOrders && orderList.length === 0" class="loading-text">订单列表加载中...</view>
			<view v-if="!loadingOrders && orderList.length === 0" class="empty-text">暂无订单数据</view>

			<scroll-view scroll-y class="order-scroll-view" v-if="orderList.length > 0">
				<view v-for="order in orderList" :key="order._id" class="order-card" @click="goToOrderDetails(order._id)">
					<view class="order-info-line">
						<text class="label">订单号:</text>
						<text class="value important-value">{{ order.orderNumber }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">买家ID:</text>
						<text class="value">{{ order.buyerGameId }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">类型:</text>
						<text class="value type-value" :class="order.orderType">{{ formatOrderType(order.orderType) }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">状态:</text>
						<text class="value status-value" :class="order.status">{{ formatOrderStatus(order.status) }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">客服:</text>
						<text class="value">{{ order.csNickname || 'N/A' }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">供货商:</text>
						<text class="value">{{ order.supplierNickname || (order.status === 'pending' ? '待分配' : '未分配/未知') }}</text>
					</view>
					<view class="order-info-line" v-if="order.costPrice !== null && order.costPrice !== undefined">
						<text class="label">成本价:</text>
						<text class="value cost-price-value">¥ {{ order.costPrice.toFixed(2) }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">创建时间:</text>
						<text class="value date-value">{{ formatDate(order.createTime) }}</text>
					</view>
					<view class="order-info-line" v-if="order.completeTime">
						<text class="label">完成时间:</text>
						<text class="value date-value">{{ formatDate(order.completeTime) }}</text>
					</view>
					</view>
			</scroll-view>
			
			<view class="pagination" v-if="!loadingOrders && totalOrders > pageSize">
				<button @click="handlePageChange(-1)" :disabled="currentPage === 1 || loadingOrders">上一页</button>
				<text class="page-info">{{ currentPage }} / {{ totalPages }}</text>
				<button @click="handlePageChange(1)" :disabled="currentPage >= totalPages || loadingOrders">下一页</button>
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
	// 建议从 utils 导入格式化函数
	import { formatDate, formatOrderStatus, formatOrderType } from '@/utils/formatters.js'; // 假设路径正确

	export default {
		data() {
			return {
				orderList: [],
				loadingOrders: false,
				isPageLoading: true,
				// 分页
				currentPage: 1,
				pageSize: 10, 
				totalOrders: 0,
				// 可以添加筛选条件
				// statusFilter: '', 
				// typeFilter: '',
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole']),
			...mapState('user', ['token']),
			totalPages() {
				return Math.ceil(this.totalOrders / this.pageSize);
			}
		},
		onShow() {
			this.isPageLoading = true;
			this.checkAdminAuthAndLoadData();
		},
		methods: {
			...mapActions('user', ['logout']),
			// 使用导入的格式化函数
			formatDate,
			formatOrderStatus,
			formatOrderType,

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
				await this.fetchOrderList(true);
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
            
			async fetchOrderList(resetPage = false) {
				if (resetPage) {
					this.currentPage = 1;
				}
				this.loadingOrders = true;
				if (!this.token) {
					uni.showToast({ title: 'Token无效,请重新登录', icon: 'none' });
					this.goToLogin();
					this.loadingOrders = false;
					return;
				}
				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'viewOrders', // 管理员调用此接口可以看到所有订单
							token: this.token,
							page: this.currentPage,
							pageSize: this.pageSize,
							// statusFilter: this.statusFilter, // 如果添加了筛选器
							// typeFilter: this.typeFilter,   // 如果添加了筛选器
						}
					});
					if (res.result.code === 200) {
						this.orderList = res.result.data;
						this.totalOrders = res.result.total;
					} else if (res.result.code === 401) {
						uni.showToast({ title: res.result.message || '登录失效,请重新登录', icon: 'error', duration: 2000 });
						this.goToLogin();
					} else {
						uni.showToast({ title: res.result.message || '加载订单列表失败', icon: 'error', duration: 2000 });
					}
				} catch (err) {
					console.error('fetchOrderList 调用失败:', err);
					uni.showToast({ title: '请求订单列表异常', icon: 'error', duration: 2000 });
				} finally {
					this.loadingOrders = false;
				}
			},
			goToOrderDetails(orderId) {
				uni.navigateTo({
					url: `/pages/common/orderDetails?id=${orderId}`
				});
			},
			handlePageChange(change) {
				const newPage = this.currentPage + change;
				if (newPage >= 1 && newPage <= this.totalPages) {
					this.currentPage = newPage;
					this.fetchOrderList();
				}
			}
		}
	}
</script>

<style scoped>
/* 建议将页面 class 名称从 user-management-container 改为更合适的，例如 order-list-admin-container */
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
.order-scroll-view { /* Renamed from user-scroll-view */
	height: calc(100vh - 220rpx); /* 根据实际header和pagination高度调整 */
}
.order-card { /* Renamed from user-card */
	background-color: #fff;
	border: 1px solid #e9ecef;
	border-radius: 8rpx;
	padding: 25rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 1rpx 5rpx rgba(0, 0, 0, 0.03);
    cursor: pointer; /* 添加手型指示可点击 */
}
.order-info-line { /* Renamed from user-info-line */
	display: flex;
	align-items: flex-start; /* 顶部对齐，方便查看多行value */
	font-size: 28rpx;
	margin-bottom: 12rpx; /* 略微调整 */
	line-height: 1.5;
}
.label {
	color: #6c757d;
	width: 150rpx; /* 增加宽度以适应“成本价格” */
	flex-shrink: 0;
}
.value {
	color: #343a40;
	flex: 1;
	word-break: break-all;
}
.important-value {
    font-weight: bold;
    color: #007bff;
}
.cost-price-value {
    color: #dc3545; /* 成本用红色突出显示 */
    font-weight: bold;
}
.date-value {
    font-size: 24rpx;
    color: #555;
}
.type-value.cdk { color: #17a2b8; font-weight: 500; }
.type-value.gift { color: #fd7e14; font-weight: 500; }

.status-value.pending { color: #ffc107; } /* 黄色 */
.status-value.timing { color: #007bff; } /* 蓝色 */
.status-value.ready_to_send { color: #fd7e14; } /* 橙色 */
.status-value.completed { color: #28a745; } /* 绿色 */
.status-value.cancelled { color: #6c757d; } /* 灰色 */

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