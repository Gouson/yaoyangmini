<template>
	<view class="supplier-dashboard-container">
		<view v-if="isLoggedIn && userRole === 'supplier'">
			<view class="header">
				<text class="welcome-text">欢迎, 供货商 {{ currentUser.nickname || currentUser.username }}</text>
				<view class="header-actions">
					<button type="default" class="action-button change-password-btn" size="mini" @click="goToChangePassword">修改密码</button>
					<button class="action-button logout-btn-header" size="mini" @click="handleLogout">退出登录</button>
				</view>
			</view>

			<view class="order-list-section">
				<view class="list-header">
					<text class="list-title">我的任务订单</text>
					<button class="refresh-button" size="mini" @click="fetchSupplierOrders" :loading="loadingOrders">刷新</button>
				</view>

				<view v-if="loadingOrders && orderList.length === 0" class="loading-text">订单加载中...</view>
				<view v-if="!loadingOrders && orderList.length === 0" class="empty-text">暂无需要您处理的订单。</view>

				<scroll-view scroll-y class="order-scroll-view">
					<view v-for="order in orderList" :key="order._id" class="order-card" @click="goToOrderDetails(order._id)">
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
							<text class="order-value type-value" :class="order.orderType">{{ formatOrderType(order.orderType) }}</text>
						</view>
						<view class="order-row">
							<text class="order-label">状态:</text>
							<text class="order-value status-value" :class="order.status">{{ formatOrderStatus(order.status) }}</text>
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
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-container">
			<text>权限不足或未登录。请以供货商身份登录。</text>
			<button size="mini" @click="goToLogin" class="login-prompt-button">去登录</button>
		</view>
		<view v-else class="loading-text">页面加载中...</view>
	</view>
</template>

<script>
import { mapGetters, mapActions, mapState } from 'vuex';
import { formatDate, formatOrderStatus, formatOrderType } from '@/utils/formatters.js';

export default {
	data() {
		return {
			orderList: [],
			loadingOrders: false,
			isPageLoading: true,
		};
	},
	computed: {
		...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole']),
		...mapState('user', ['token'])
	},
	onShow() {
		this.isPageLoading = true;
		this.checkSupplierAuthAndLoadData();
	},
	methods: {
		...mapActions('user', ['logout']),
		formatDate, formatOrderStatus, formatOrderType,
		checkSupplierAuthAndLoadData() {
			if (!this.isLoggedIn) {
				this.logout();
				this.isPageLoading = false;
				return;
			}
			if (this.userRole !== 'supplier') {
				uni.showToast({ title: '权限不足', icon: 'error', duration: 1500 });
				this.navigateToUserHome(this.userRole);
				this.isPageLoading = false;
				return;
			}
			if (!this.currentUser.game_id) {
				uni.showToast({ title: '您尚未分配游戏，请联系管理员', icon: 'error', duration: 3000 });
				this.isPageLoading = false;
				this.orderList = [];
				return;
			}
			this.isPageLoading = false;
			this.fetchSupplierOrders();
		},
		async fetchSupplierOrders() {
			this.loadingOrders = true;
			if (!this.token) {
				this.logout();
				this.loadingOrders = false;
				return;
			}
			try {
				const res = await uni.cloud.callFunction({
					name: 'order-center',
					data: { action: 'viewOrders', token: this.token }
				});
				if (res.result.code === 200) {
					this.orderList = res.result.data;
				} else if (res.result.code === 401) {
					uni.showToast({ title: res.result.message || '登录失效', icon: 'error' });
					this.logout();
				} else {
					uni.showToast({ title: res.result.message || '加载订单失败', icon: 'error' });
				}
			} catch (err) {
				uni.showToast({ title: '请求订单列表异常', icon: 'error' });
			} finally {
				this.loadingOrders = false;
			}
		},
		goToOrderDetails(orderId) { uni.navigateTo({ url: `/pages/common/orderDetails?id=${orderId}` }); },
		goToChangePassword() { uni.navigateTo({ url: '/pages/user/changePassword' }); },
		handleLogout() { this.logout(); },
		goToLogin() { this.logout(); },
		navigateToUserHome(role) {
			let url = '/pages/login/login';
			if (role === 'admin') url = '/pages/admin/index';
			else if (role === 'cs') url = '/pages/cs/index';
			const currentPages = getCurrentPages();
			const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
			if (url && url !== `/${currentPageRoute}`) {
				uni.reLaunch({ url });
			}
		}
	}
}
</script>

<style scoped>
	.supplier-dashboard-container { padding: 20rpx; background-color: #f4f4f4; min-height: 100vh; box-sizing: border-box; }
	.header { background-color: #ffffff; padding: 25rpx 20rpx; border-radius: 12rpx; margin-bottom: 25rpx; display: flex; flex-direction: column; align-items: flex-start; box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.03); }
	.welcome-text { font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 20rpx; width: 100%; }
	.header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 15rpx; width: 100%; justify-content: flex-start; }
	.action-button { font-size: 26rpx; padding: 0 20rpx; height: 60rpx; line-height: 60rpx; flex-shrink: 0; border-radius: 8rpx; text-align: center; }
	.change-password-btn { background-color: #6c757d; color: white; }
	.logout-btn-header { background-color: #e64340; color: white; }
	.order-list-section { background-color: #ffffff; padding: 20rpx; border-radius: 12rpx; box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.03); }
	.list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; padding-bottom: 20rpx; border-bottom: 1px solid #f0f0f0; }
	.list-title { font-size: 32rpx; font-weight: bold; color: #333; }
	.refresh-button { background-color: #f0f0f0; color: #333; font-size: 24rpx; padding: 0 20rpx; height: 50rpx; line-height: 50rpx; }
	.order-scroll-view { height: calc(100vh - 420rpx); }
	.order-card { background-color: #f9f9f9; border: 1px solid #e9e9e9; border-radius: 8rpx; padding: 20rpx; margin-bottom: 20rpx; cursor: pointer; }
	.order-row { display: flex; font-size: 26rpx; margin-bottom: 8rpx; line-height: 1.6; }
	.order-label { width: 150rpx; color: #666; flex-shrink: 0; }
	.order-value { flex: 1; color: #333; word-break: break-all; }
	.type-value.cdk { color: #2a9ff6; font-weight: bold; }
	.type-value.gift { color: #e64340; font-weight: bold; }
	.status-value.pending { color: #ff9900; }
	.status-value.timing { color: #2a9ff6; }
	.status-value.ready_to_send { color: #1aad19; }
	.status-value.completed { color: #09bb07; }
	.status-value.cancelled { color: #888888; }
	.important-time { color: #e64340; font-weight: bold; }
	.loading-text, .empty-text, .unauthorized-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 100rpx; text-align: center; color: #666; font-size: 28rpx; }
	.login-prompt-button { margin-top: 30rpx; background-color: #007aff; color: white; }
</style>