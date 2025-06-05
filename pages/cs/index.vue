<template>
	<view class="cs-dashboard-container">
		<view v-if="isLoggedIn && userRole === 'cs'">
			<view class="header">
				<text class="welcome-text">欢迎您, 客服 {{ currentUser.nickname || currentUser.username }}</text>
				<view class="header-actions">
					<button class="action-button create-order-btn" size="mini" @click="goToCreateOrderPage">创建新订单</button>
					<button type="default" class="action-button change-password-btn" size="mini" @click="goToChangePassword">修改密码</button>
					<button class="action-button logout-btn-header" size="mini" @click="handleLogout">退出登录</button>
				</view>
			</view>

			<view class="order-list-section">
				<view class="list-header">
					<text class="list-title">我创建的订单</text>
					<button class="refresh-button" size="mini" @click="fetchMyOrders" :loading="loadingOrders">刷新</button>
				</view>

				<view v-if="loadingOrders && orderList.length === 0" class="loading-text">订单加载中...</view>
				<view v-if="!loadingOrders && orderList.length === 0" class="empty-text">您还没有创建任何订单。</view>

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
					</view>
				</scroll-view>
			</view>
		</view>
		<view v-else-if="!isPageLoading" class="unauthorized-container">
			<text>权限不足或未登录。请以客服身份登录。</text>
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
		this.checkCsAuthAndLoadData();
	},
	methods: {
		...mapActions('user', ['logout']),

		checkCsAuthAndLoadData() {
			if (!this.$store.getters['user/isLoggedIn']) {
				this.$store.dispatch('user/logout');
				this.isPageLoading = false;
				return;
			}
			if (this.$store.getters['user/userRole'] !== 'cs') {
				uni.showToast({ title: '权限不足', icon: 'error', duration: 1500 });
				this.navigateToUserHome(this.$store.getters['user/userRole']);
				this.isPageLoading = false;
				return;
			}
			this.isPageLoading = false;
			this.fetchMyOrders();
		},

		async fetchMyOrders() {
			this.loadingOrders = true;
			if (!this.token) {
				this.goToLogin(); 
				this.loadingOrders = false;
				return;
			}

			try {
				const res = await uni.cloud.callFunction({
					name: 'order-center',
					data: {
						action: 'viewOrders',
						token: this.token,
					}
				});

				if (res.result.code === 200) {
					this.orderList = res.result.data;
				} else if (res.result.code === 401) {
					uni.showToast({ title: res.result.message || '登录失效', icon: 'error', duration: 1500 });
					this.goToLogin();
				} else {
					uni.showToast({ title: res.result.message || '加载订单失败', icon: 'error', duration: 1500 });
				}
			} catch (err) {
				console.error('fetchMyOrders 调用失败:', err);
				uni.showToast({ title: '请求订单列表异常', icon: 'error', duration: 1500 });
			} finally {
				this.loadingOrders = false;
			}
		},

		goToCreateOrderPage() {
			uni.navigateTo({
				url: '/pages/cs/createOrder'  //
			});
		},

		goToOrderDetails(orderId) {
			uni.navigateTo({
				url: `/pages/common/orderDetails?id=${orderId}` //
			});
		},
		
		goToChangePassword() {
			uni.navigateTo({
				url: '/pages/user/changePassword' 
			});
		},
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
				else if (role === 'supplier') url = '/pages/supplier/index';
				
				const currentPages = getCurrentPages();
				const currentPageRoute = currentPages.length ? currentPages[currentPages.length - 1].route : null;
				if (url && (!currentPageRoute || url !== `/${currentPageRoute}`)) { 
					uni.reLaunch({ url });
				} else if (url && url === `/${currentPageRoute}` && url !== '/pages/login/login') {
                    console.log("已经在目标页面或角色首页。");
                } else if (!url) { 
                    this.$store.dispatch('user/logout');
                }
		}
	}
}
</script>

<style scoped>
.cs-dashboard-container {
	padding: 20rpx;
	background-color: #f4f4f4;
	min-height: 100vh;
	box-sizing: border-box;
}
.header {
	background-color: #ffffff;
	padding: 25rpx 20rpx;
	border-radius: 12rpx;
	margin-bottom: 25rpx;
	display: flex;
	/* 改为垂直排列 */
	flex-direction: column; 
	align-items: flex-start; /* 左对齐 */
	box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.03);
}
.welcome-text {
	font-size: 30rpx;
	font-weight: bold;
	color: #333;
	margin-bottom: 20rpx; /* 欢迎语和按钮行之间的间距 */
	width: 100%; /* 让欢迎语占据一行 */
}
.header-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap; /* 允许按钮在空间不足时换行 */
	gap: 15rpx; /* 按钮之间的间隙 */
	width: 100%; /* 让按钮行占据全部可用宽度 */
	justify-content: flex-start; /* 按钮靠左排列，您可以改为 space-around 或 center */
}
.action-button {
	font-size: 26rpx;
	padding: 0 20rpx; /* 调整内边距，让按钮小一点，但能容纳文字 */
	height: 60rpx;    /* 增加按钮高度 */
	line-height: 60rpx;
	/* margin-left: 0; /* 通过gap来控制间距，移除单独的margin-left */
	/* white-space: nowrap; /* 移除或改为 normal，允许文字在按钮内换行如果需要 */
	flex-shrink: 0; /* 防止按钮被过度压缩 */
    border-radius: 8rpx; /* 给按钮加点圆角 */
    text-align: center;
}
.create-order-btn {
	background-color: #007aff;
	color: white;
}
.change-password-btn {
	background-color: #6c757d;
	color: white;
}
.logout-btn-header {
	background-color: #e64340;
	color: white;
}

.order-list-section {
	background-color: #ffffff;
	padding: 20rpx;
	border-radius: 12rpx;
	box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.03);
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
	height: calc(100vh - 420rpx); /* 根据头部区域调整后的高度重新估算 */
}
.order-card {
	background-color: #f9f9f9;
	border: 1px solid #e9e9e9;
	border-radius: 8rpx;
	padding: 20rpx;
	margin-bottom: 20rpx;
	cursor: pointer;
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
	flex-shrink: 0;
}
.order-value {
	flex: 1;
	color: #333;
	word-break: break-all;
}
.type-value.cdk { color: #2a9ff6; font-weight: bold; }
.type-value.gift { color: #e64340; font-weight: bold; }
.status-value.pending { color: #ff9900; }
.status-value.timing { color: #2a9ff6; }
.status-value.ready_to_send { color: #1aad19; }
.status-value.completed { color: #09bb07; }
.status-value.cancelled { color: #888888; }

.loading-text, .empty-text {
	text-align: center;
	color: #999;
	padding: 50rpx 0;
	font-size: 28rpx;
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