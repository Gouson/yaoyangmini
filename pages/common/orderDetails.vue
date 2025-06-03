<template>
	<view class="order-details-container">
		<view v-if="isPageLoading" class="loading-container"><text>加载中...</text></view>
		<view v-else-if="!isLoggedIn" class="unauthorized-container">
			<text>请先登录后查看。</text>
			<button size="mini" @click="goToLogin" class="login-prompt-button">去登录</button>
		</view>
		<view v-else-if="orderLoadError" class="error-container">
			<text>{{ orderLoadError }}</text>
			<button size="mini" @click="fetchOrderDetails">重试</button>
		</view>
		<view v-else-if="order" class="details-content">
			<view class="detail-section">
				<view class="section-title">基本信息</view>
				<view class="detail-item"><text class="label">订单号:</text><text
						class="value">{{ order.orderNumber }}</text></view>
				<view class="detail-item"><text class="label">买家游戏ID:</text><text
						class="value">{{ order.buyerGameId }}</text></view>
				<view class="detail-item"><text class="label">订单类型:</text><text class="value type-value"
						:class="order.orderType">{{ formatOrderType(order.orderType) }}</text></view>
				<view class="detail-item"><text class="label">当前状态:</text><text class="value status-value"
						:class="order.status">{{ formatOrderStatus(order.status) }}</text></view>
				<view class="detail-item"><text class="label">客服备注:</text><text
						class="value remarks-value">{{ order.remarks || '无' }}</text></view>
			</view>

			<view class="detail-section">
				<view class="section-title">时间信息</view>
				<view class="detail-item"><text class="label">创建时间:</text><text
						class="value">{{ formatDate(order.createTime) }}</text></view>
				<view v-if="order.startTime" class="detail-item"><text class="label">开始计时:</text><text
						class="value">{{ formatDate(order.startTime) }}</text></view>
				<view v-if="order.expireTime" class="detail-item"><text class="label">预计到期:</text><text
						class="value">{{ formatDate(order.expireTime) }}</text></view>
				<view v-if="order.completeTime" class="detail-item"><text class="label">完成时间:</text><text
						class="value">{{ formatDate(order.completeTime) }}</text></view>
			</view>

			<view class="detail-section">
				<view class="section-title">关联人员</view>
				<view class="detail-item"><text class="label">创建客服ID:</text><text
						class="value id-value">{{ order.csId }}</text></view>
				<view class="detail-item"><text class="label">客服: </text><text
						class="value id-value">{{ order.csNickname }}</text></view>
				<view class="detail-item"><text class="label">供货商: </text><text
						class="value id-value">{{ order.supplierNickname }}</text></view>

				<view v-if="order.supplierId" class="detail-item"><text class="label">处理供货商ID:</text><text
						class="value id-value">{{ order.supplierId }}</text></view>
			</view>

			<view class="detail-section">
				<view class="section-title">相关截图</view>
				<view class="screenshot-item" v-if="order.screenshots.orderContentFileId">
					<text class="label">订单内容截图:</text>
					<image :src="order.screenshots.orderContentFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.orderContentFileId)" />
				</view>
				<view class="screenshot-item" v-if="order.screenshots.buyerIdPageFileId">
					<text class="label">买家ID主页截图:</text>
					<image :src="order.screenshots.buyerIdPageFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.buyerIdPageFileId)" />
				</view>
				<view class="screenshot-item" v-if="order.screenshots.completionProofFileId">
					<text class="label">完成凭证截图:</text>
					<image :src="order.screenshots.completionProofFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.completionProofFileId)" />
				</view>
			</view>

			<view v-if="userRole === 'supplier'" class="supplier-actions-section">
				<view v-if="order.orderType === 'cdk' && order.status === 'pending'">
					<view class="action-title">处理CDK订单</view>
					<view class="image-uploader" @click="handleCompletionProofUpload('cdkCompletion')">
						<image v-if="cdkCompletionProofPreview" :src="cdkCompletionProofPreview" mode="aspectFit"
							class="preview-image"></image>
						<text v-else class="upload-placeholder">上传完成截图</text>
						<view v-if="isUploadingCdkProof" class="upload-loading">上传中...</view>
					</view>
					<button class="action-button cdk-button" @click="processCdkOrder"
						:disabled="!cdkCompletionProofFileId || isSubmittingCdk"
						:loading="isSubmittingCdk">确认CDK发货</button>
				</view>

				<view v-if="order.orderType === 'gift'">
					<button v-if="order.status === 'pending'" class="action-button gift-button" @click="startGiftTimer"
						:loading="isSubmittingGiftAction">添加好友，开始24小时计时</button>
					<view
						v-if="(order.status === 'timing' || order.status === 'ready_to_send') && order.supplierId === currentUser._id">
						<view class="action-title">完成皮肤赠送</view>
						<view class="image-uploader" @click="handleCompletionProofUpload('giftCompletion')">
							<image v-if="giftCompletionProofPreview" :src="giftCompletionProofPreview" mode="aspectFit"
								class="preview-image"></image>
							<text v-else class="upload-placeholder">上传完成截图</text>
							<view v-if="isUploadingGiftProof" class="upload-loading">上传中...</view>
						</view>
						<button class="action-button gift-button" @click="completeGiftOrder"
							:disabled="!giftCompletionProofFileId || isSubmittingGiftAction"
							:loading="isSubmittingGiftAction">确认皮肤已赠送</button>
					</view>
				</view>
			</view>
			<button class="refresh-button" @click="fetchOrderDetails" :loading="loading">刷新订单详情</button>
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
				orderId: null,
				order: null,
				loading: false, // 通用加载状态，主要用于刷新按钮
				isPageLoading: true, // 页面级初始加载状态
				orderLoadError: null, // 订单加载错误信息

				// CDK 完成凭证
				cdkCompletionProofPreview: null,
				cdkCompletionProofFileId: null,
				isUploadingCdkProof: false,
				isSubmittingCdk: false,

				// Gift 完成凭证
				giftCompletionProofPreview: null,
				giftCompletionProofFileId: null,
				isUploadingGiftProof: false,
				isSubmittingGiftAction: false, // 用于开始计时和完成赠送两个按钮的loading
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole', 'token'])
		},
		onLoad(options) {
			if (options.id) {
				this.orderId = options.id;
				this.checkAuthAndLoadOrderDetails();
			} else {
				this.orderLoadError = '未提供订单ID';
				this.isPageLoading = false;
				uni.showToast({
					title: '缺少订单ID参数',
					icon: 'error'
				});
			}
		},
		methods: {
			...mapActions('user', ['logout']),

			goToLogin() {
				this.$store.dispatch('user/logout');
			},

			async checkAuthAndLoadOrderDetails() {
				this.isPageLoading = true;
				if (!this.isLoggedIn) {
					// uni.showToast({ title: '请先登录', icon: 'none' });
					this.goToLogin();
					this.isPageLoading = false;
					return;
				}
				await this.fetchOrderDetails();
				this.isPageLoading = false;
			},

			async fetchOrderDetails() {
				if (!this.orderId) return;
				this.loading = true;
				this.orderLoadError = null;
				const currentToken = this.token || uni.getStorageSync('userToken');

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'viewOrderDetails',
							token: currentToken,
							orderId: this.orderId
						}
					});
					if (res.result.code === 200) {
						this.order = res.result.data;
					} else if (res.result.code === 401) {
						this.orderLoadError = res.result.message || '登录失效，请重新登录';
						uni.showToast({
							title: this.orderLoadError,
							icon: 'error'
						});
						this.goToLogin();
					} else {
						this.orderLoadError = res.result.message || '加载订单详情失败';
						uni.showToast({
							title: this.orderLoadError,
							icon: 'error'
						});
						this.order = null; // 清空可能存在的旧数据
					}
				} catch (err) {
					console.error('fetchOrderDetails 调用失败:', err);
					this.orderLoadError = '请求订单详情异常';
					uni.showToast({
						title: this.orderLoadError,
						icon: 'error'
					});
				} finally {
					this.loading = false;
					this.isPageLoading = false; // 确保初始加载状态被解除
				}
			},

			// --- 图片处理 ---
			previewImage(fileId) {
				if (fileId) {
					// uni.previewImage可以直接预览云存储FileID
					uni.previewImage({
						urls: [fileId],
						current: fileId
					});
				}
			},
			handleCompletionProofUpload(type) { // type: 'cdkCompletion' or 'giftCompletion'
				let isUploadingFlag = type === 'cdkCompletion' ? 'isUploadingCdkProof' : 'isUploadingGiftProof';
				if (this[isUploadingFlag]) return;

				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					success: async (res) => {
						const tempFilePath = res.tempFilePaths[0];
						this[isUploadingFlag] = true;
						if (type === 'cdkCompletion') this.cdkCompletionProofPreview = tempFilePath;
						else if (type === 'giftCompletion') this.giftCompletionProofPreview = tempFilePath;

						try {
							const cloudPath =
								`completion_proofs/${this.currentUser._id}_${this.orderId}_${type}_${Date.now()}_${tempFilePath.substring(tempFilePath.lastIndexOf('/') + 1)}`;
							const uploadResult = await uni.cloud.uploadFile({
								cloudPath,
								filePath: tempFilePath
							});

							if (uploadResult.fileID) {
								if (type === 'cdkCompletion') this.cdkCompletionProofFileId = uploadResult
									.fileID;
								else if (type === 'giftCompletion') this.giftCompletionProofFileId =
									uploadResult.fileID;
								uni.showToast({
									title: '凭证上传成功',
									icon: 'success'
								});
							} else {
								throw new Error('上传失败未返回FileID');
							}
						} catch (err) {
							console.error(`上传凭证(${type})失败:`, err);
							uni.showToast({
								title: '凭证上传失败',
								icon: 'error'
							});
							if (type === 'cdkCompletion') this.cdkCompletionProofPreview = null;
							else if (type === 'giftCompletion') this.giftCompletionProofPreview = null;
						} finally {
							this[isUploadingFlag] = false;
						}
					}
				});
			},

			// --- 供货商操作 ---
			async processCdkOrder() {
				if (!this.cdkCompletionProofFileId) {
					uni.showToast({
						title: '请先上传CDK完成截图',
						icon: 'none'
					});
					return;
				}
				this.isSubmittingCdk = true;
				const currentToken = this.token || uni.getStorageSync('userToken');
				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'processCdkOrder',
							token: currentToken,
							orderId: this.orderId,
							screenshots: {
								completionProofFileId: this.cdkCompletionProofFileId
							}
						}
					});
					if (res.result.code === 200) {
						uni.showToast({
							title: 'CDK订单处理成功!',
							icon: 'success'
						});
						await this.fetchOrderDetails(); // 刷新订单状态
						this.cdkCompletionProofFileId = null;
						this.cdkCompletionProofPreview = null; // 清空上传记录
					} else {
						/* ...错误处理同其他接口... */
						uni.showToast({
							title: res.result.message || '操作失败',
							icon: 'error'
						});
					}
				} catch (err) {
					/* ... */
					uni.showToast({
						title: '请求异常',
						icon: 'error'
					});
				} finally {
					this.isSubmittingCdk = false;
				}
			},

			async startGiftTimer() {
				this.isSubmittingGiftAction = true;
				const currentToken = this.token || uni.getStorageSync('userToken');
				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'startGiftOrderTimer',
							token: currentToken,
							orderId: this.orderId
						}
					});
					if (res.result.code === 200) {
						uni.showToast({
							title: '计时已开始!',
							icon: 'success'
						});
						await this.fetchOrderDetails();
					} else {
						/* ...错误处理... */
						uni.showToast({
							title: res.result.message || '操作失败',
							icon: 'error'
						});
					}
				} catch (err) {
					/* ... */
					uni.showToast({
						title: '请求异常',
						icon: 'error'
					});
				} finally {
					this.isSubmittingGiftAction = false;
				}
			},

			async completeGiftOrder() {
				if (!this.giftCompletionProofFileId) {
					uni.showToast({
						title: '请先上传皮肤赠送完成截图',
						icon: 'none'
					});
					return;
				}
				this.isSubmittingGiftAction = true;
				const currentToken = this.token || uni.getStorageSync('userToken');
				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'completeGiftOrder',
							token: currentToken,
							orderId: this.orderId,
							screenshots: {
								completionProofFileId: this.giftCompletionProofFileId
							}
						}
					});
					if (res.result.code === 200) {
						uni.showToast({
							title: '皮肤赠送完成!',
							icon: 'success'
						});
						await this.fetchOrderDetails();
						this.giftCompletionProofFileId = null;
						this.giftCompletionProofPreview = null;
					} else {
						/* ...错误处理... */
						uni.showToast({
							title: res.result.message || '操作失败',
							icon: 'error'
						});
					}
				} catch (err) {
					/* ... */
					uni.showToast({
						title: '请求异常',
						icon: 'error'
					});
				} finally {
					this.isSubmittingGiftAction = false;
				}
			},

			// --- 通用格式化函数 (可提取到utils) ---
			formatOrderType(type) {
				/* ...与cs/index.vue中相同... */
				if (type === 'cdk') return 'CDK激活码';
				if (type === 'gift') return '皮肤赠送';
				return '未知类型';
			},
			formatOrderStatus(status) {
				/* ...与cs/index.vue中相同... */
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
				/* ...与cs/index.vue中相同... */
				if (!dateString) return 'N/A';
				const date = new Date(dateString);
				return `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)} ${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}`;
			}
		}
	}
</script>

<style scoped>
	.order-details-container {
		padding: 20rpx;
		background-color: #f8f8f8;
		min-height: 100vh;
	}

	.loading-container,
	.unauthorized-container,
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding-top: 100rpx;
		color: #666;
	}

	.login-prompt-button,
	.error-container button {
		margin-top: 20rpx;
		font-size: 28rpx;
	}

	.details-content {
		background-color: #fff;
		border-radius: 12rpx;
		padding: 30rpx;
	}

	.detail-section {
		margin-bottom: 30rpx;
		padding-bottom: 20rpx;
		border-bottom: 1px solid #f0f0f0;
	}

	.detail-section:last-child {
		border-bottom: none;
		margin-bottom: 0;
	}

	.section-title {
		font-size: 32rpx;
		font-weight: bold;
		color: #333;
		margin-bottom: 20rpx;
	}

	.detail-item {
		display: flex;
		font-size: 28rpx;
		line-height: 1.7;
		margin-bottom: 10rpx;
	}

	.label {
		width: 180rpx;
		/* 固定标签宽度 */
		color: #888;
		flex-shrink: 0;
		/* 防止标签被压缩 */
	}

	.value {
		color: #333;
		flex: 1;
		word-break: break-all;
	}

	.remarks-value {
		white-space: pre-wrap;
		/* 保持备注中的换行 */
	}

	.id-value {
		font-size: 24rpx;
		color: #666;
	}

	.type-value.cdk {
		color: #007aff;
	}

	.type-value.gift {
		color: #e64340;
	}

	.status-value.pending {
		color: #ff9900;
	}

	.status-value.timing,
	.status-value.ready_to_send {
		color: #007aff;
	}

	.status-value.completed {
		color: #09bb07;
	}

	.status-value.cancelled {
		color: #888888;
	}

	.screenshot-item {
		margin-bottom: 20rpx;
	}

	.screenshot-item .label {
		display: block;
		margin-bottom: 10rpx;
	}

	.screenshot-image {
		width: 200rpx;
		height: 200rpx;
		border: 1px solid #eee;
		background-color: #f0f0f0;
		border-radius: 8rpx;
	}

	.supplier-actions-section {
		margin-top: 40rpx;
		padding-top: 30rpx;
		border-top: 1px solid #f0f0f0;
	}

	.action-title {
		font-size: 30rpx;
		font-weight: bold;
		margin-bottom: 20rpx;
	}

	.image-uploader {
		/* 与 createOrder 页面中样式类似 */
		width: 180rpx;
		height: 180rpx;
		border: 1px dashed #ccc;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #f9f9f9;
		position: relative;
		margin-bottom: 20rpx;
	}

	.preview-image {
		width: 100%;
		height: 100%;
	}

	.upload-placeholder {
		font-size: 60rpx;
		color: #ccc;
	}

	.upload-loading {
		/* ... */
	}

	.action-button {
		margin-top: 20rpx;
		color: white;
		font-size: 30rpx;
	}

	.cdk-button {
		background-color: #007aff;
	}

	.gift-button {
		background-color: #e64340;
	}

	.action-button[disabled] {
		background-color: #c0c0c0;
	}

	.refresh-button {
		margin-top: 40rpx;
		background-color: #f0f0f0;
		color: #333;
	}
</style>