<template>
	<view class="order-list-admin-container">
		<view v-if="isLoggedIn && userRole === 'admin'">
			<view class="header">
				<text class="page-title">所有订单管理</text>
				<button size="mini" @click="fetchOrderList(true)" :loading="loadingOrders" class="header-button">刷新</button>
			</view>

			<view class="filter-section">
				<picker mode="selector" :range="gameListForFilter" range-key="name" @change="onGameFilterChange">
					<view class="picker-display">
						<text>筛选游戏:</text>
						<text class="filter-value">{{ selectedGameName }}</text>
						<text class="arrow">▼</text>
					</view>
				</picker>
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
						<text class="label">所属游戏:</text>
						<text class="value game-name-value">{{ order.gameName || '未知游戏' }}</text>
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
						<text class="value">{{ order.supplierNickname || (order.status === 'pending' ? '待分配' : '未分配') }}</text>
					</view>
					<view class="order-info-line" v-if="order.costPrice !== null && order.costPrice !== undefined">
						<text class="label">成本价:</text>
						<text class="value cost-price-value">¥ {{ order.costPrice.toFixed(2) }}</text>
					</view>
					<view class="order-info-line">
						<text class="label">创建时间:</text>
						<text class="value date-value">{{ formatDate(order.createTime) }}</text>
					</view>
				</view>
			</scroll-view>
			
			<view class="pagination" v-if="!loadingOrders && totalOrders > pageSize">
				<button @click="handlePageChange(-1)" :disabled="currentPage === 1 || loadingOrders">上一页</button>
				<text class="page-info">{{ currentPage }} / {{ totalPages }}</text>
				<button @click="handlePageChange(1)" :disabled="currentPage >= totalPages || loadingOrders">下一页</button>
			</view>

		</view>
		<view v-else class="unauthorized-text">
			<text>权限不足或未登录。</text>
			<button size="mini" @click="goToLogin" class="login-prompt-button">去登录</button>
		</view>
	</view>
</template>

<script>
import { mapGetters, mapActions, mapState } from 'vuex';
import { formatDate, formatOrderStatus, formatOrderType } from '@/utils/formatters.js';

export default {
    data() {
        return {
            orderList: [],
            loadingOrders: true,
            currentPage: 1,
            pageSize: 10,
            totalOrders: 0,
            gameList: [],
            selectedGameId: null,
            selectedGameName: '所有游戏',
        };
    },
    computed: {
        ...mapGetters('user', ['isLoggedIn', 'userRole']),
        ...mapState('user', ['token']),
        totalPages() { return Math.ceil(this.totalOrders / this.pageSize); },
        gameListForFilter() { return [{ _id: null, name: '所有游戏' }, ...this.gameList]; }
    },
    onShow() {
        this.checkAdminAuthAndLoadData();
    },
    methods: {
        ...mapActions('user', ['logout']),
        formatDate, formatOrderStatus, formatOrderType,
        async checkAdminAuthAndLoadData() {
            if (!this.isLoggedIn || this.userRole !== 'admin') {
                uni.showToast({ title: '无权限访问', icon: 'error' });
                this.logout();
                return;
            }
            await this.fetchGames();
            await this.fetchOrderList(true);
        },
        async fetchGames() {
            try {
                const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getGames', token: this.token }});
                if (res.result.code === 200) {
					this.gameList = res.result.data;
				}
            } catch (e) { console.error("加载游戏列表失败", e); }
        },
        onGameFilterChange(e) {
            const selected = this.gameListForFilter[e.detail.value];
            this.selectedGameId = selected._id;
            this.selectedGameName = selected.name;
            this.fetchOrderList(true);
        },
        async fetchOrderList(resetPage = false) {
            if (resetPage) this.currentPage = 1;
            this.loadingOrders = true;
            try {
                const res = await uni.cloud.callFunction({
                    name: 'order-center',
                    data: {
                        action: 'viewOrders',
                        token: this.token,
                        page: this.currentPage,
                        pageSize: this.pageSize,
                        game_id: this.selectedGameId,
                    }
                });
                if (res.result.code === 200) { 
					this.orderList = res.result.data; 
					this.totalOrders = res.result.total; 
				} else { 
					uni.showToast({ title: res.result.message || '加载失败', icon: 'error' }); 
					this.orderList = [];
					this.totalOrders = 0;
				}
            } catch (err) { 
				uni.showToast({ title: '请求异常', icon: 'error' }); 
				console.error("fetchOrderList error:", err);
			} finally { 
				this.loadingOrders = false; 
			}
        },
        goToOrderDetails(orderId) { uni.navigateTo({ url: `/pages/common/orderDetails?id=${orderId}` }); },
        handlePageChange(change) {
            const newPage = this.currentPage + change;
            if (newPage >= 1 && newPage <= this.totalPages) { this.currentPage = newPage; this.fetchOrderList(); }
        },
		goToLogin(){
			this.logout();
		}
    }
}
</script>

<style scoped>
	.order-list-admin-container { padding: 20rpx; background-color: #f8f9fa; min-height: 100vh; box-sizing: border-box; }
	.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; padding: 20rpx; background-color: #fff; border-radius: 12rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.05); }
	.page-title { font-size: 36rpx; font-weight: bold; color: #333; }
	.filter-section { background-color: #fff; padding: 15rpx 20rpx; border-radius: 12rpx; margin-bottom: 20rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.05); }
	.picker-display { display: flex; align-items: center; font-size: 28rpx; color: #333; }
	.filter-value { font-weight: bold; color: #007aff; margin: 0 10rpx; }
	.arrow { color: #999; }
	.order-scroll-view { height: calc(100vh - 280rpx); }
	.order-card { background-color: #fff; border: 1px solid #e9ecef; border-radius: 8rpx; padding: 25rpx; margin-bottom: 20rpx; box-shadow: 0 1rpx 5rpx rgba(0,0,0,0.03); cursor: pointer; }
	.order-info-line { display: flex; align-items: flex-start; font-size: 28rpx; margin-bottom: 12rpx; line-height: 1.5; }
	.label { color: #6c757d; width: 150rpx; flex-shrink: 0; }
	.value { color: #343a40; flex: 1; word-break: break-all; }
	.important-value { font-weight: bold; color: #007bff; }
	.game-name-value { font-weight: 500; color: #28a745; }
	.cost-price-value { color: #dc3545; font-weight: bold; }
	.date-value { font-size: 24rpx; color: #555; }
	.type-value.cdk { color: #17a2b8; font-weight: 500; }
	.type-value.gift { color: #fd7e14; font-weight: 500; }
	.status-value.pending { color: #ffc107; }
	.status-value.timing { color: #007bff; }
	.status-value.ready_to_send { color: #fd7e14; }
	.status-value.completed { color: #28a745; }
	.status-value.cancelled { color: #6c757d; }
	.loading-text, .empty-text, .unauthorized-text { text-align: center; color: #6c757d; margin-top: 100rpx; font-size: 28rpx; }
	.login-prompt-button { margin-top: 30rpx; background-color: #007bff; color: white; }
	.pagination { display: flex; justify-content: center; align-items: center; padding: 20rpx 0; background-color: #fff; margin-top: 20rpx; border-radius: 12rpx; box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.03); }
	.pagination button { margin: 0 20rpx; font-size: 28rpx; padding: 10rpx 20rpx; }
	.page-info { font-size: 28rpx; color: #333; }
</style>