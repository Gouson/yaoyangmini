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
						class="value important">{{ order.orderNumber }}</text></view>
				<view class="detail-item"><text class="label">买家游戏ID:</text><text
						class="value">{{ order.buyerGameId }}</text></view>
				<view class="detail-item"><text class="label">订单类型:</text><text class="value type-value"
						:class="order.orderType">{{ formatOrderType(order.orderType) }}</text></view>
				<view class="detail-item"><text class="label">当前状态:</text><text class="value status-value"
						:class="order.status">{{ formatOrderStatus(order.status) }}</text></view>
				<view v-if="(userRole === 'admin' || (userRole === 'supplier' && order.supplierId === currentUser._id)) && order.costPrice !== null && order.costPrice !== undefined" class="detail-item">
					<text class="label">成本价格:</text>
					<text class="value cost-price-display">¥ {{ parseFloat(order.costPrice).toFixed(2) }}</text>
				</view>
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
				<view class="detail-item"><text class="label">创建客服:</text><text
						class="value id-value">{{ order.csNickname || order.csId }}</text></view>
				<view v-if="order.supplierId" class="detail-item"><text class="label">处理供货商:</text><text
						class="value id-value">{{ order.supplierNickname || order.supplierId }}</text></view>
				<view v-else class="detail-item"><text class="label">处理供货商:</text><text
						class="value id-value">未分配</text></view>
			</view>

			<view class="detail-section">
				<view class="section-title">相关截图</view>
				<view class="screenshot-item" v-if="order.screenshots && order.screenshots.orderContentFileId">
					<text class="label">订单内容截图:</text>
					<image :src="order.screenshots.orderContentFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.orderContentFileId)" />
				</view>
				<view class="screenshot-item" v-if="order.screenshots && order.screenshots.buyerIdPageFileId">
					<text class="label">买家ID主页截图:</text>
					<image :src="order.screenshots.buyerIdPageFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.buyerIdPageFileId)" />
				</view>
				<view class="screenshot-item" v-if="order.screenshots && order.screenshots.completionProofFileId">
					<text class="label">完成凭证截图:</text>
					<image :src="order.screenshots.completionProofFileId" class="screenshot-image" mode="aspectFit"
						@click="previewImage(order.screenshots.completionProofFileId)" />
				</view>
			</view>

			<view v-if="userRole === 'supplier'" class="supplier-actions-section">
				<view v-if="order.orderType === 'cdk' && order.status === 'pending' && (!order.supplierId || order.supplierId === currentUser._id)">
					<view class="action-title">处理CDK订单</view>
					<view class="form-field">
						<text class="form-label">完成截图:</text>
						<view class="image-uploader" @click="handleCompletionProofUpload('cdkCompletion')">
							<image v-if="cdkCompletionProofPreview" :src="cdkCompletionProofPreview" mode="aspectFit" class="preview-image"></image>
							<text v-else class="upload-placeholder">+</text>
							<view v-if="isUploadingCdkProof" class="upload-loading">上传中...</view>
						</view>
					</view>
					<view class="form-field">
						<text class="form-label">成本价格 (元):</text>
						<input type="digit" v-model.number="inputCostPrice" placeholder="请输入成本价 (数字)" class="input-field cost-input" />
					</view>
					<button class="action-button cdk-button" @click="processCdkOrder"
						:disabled="!cdkCompletionProofFileId || isSubmittingCdk"
						:loading="isSubmittingCdk">确认CDK发货</button>
				</view>

				<view v-if="order.orderType === 'gift'">
					<button v-if="order.status === 'pending' && (!order.supplierId || order.supplierId === currentUser._id)" class="action-button gift-button-start" @click="startGiftTimer"
						:loading="isSubmittingGiftAction">接单并开始24小时计时</button>
					
					<view v-if="(order.status === 'timing' || order.status === 'ready_to_send') && order.supplierId === currentUser._id">
						<view class="action-title">完成皮肤赠送</view>
						<view class="form-field">
							<text class="form-label">完成截图:</text>
							<view class="image-uploader" @click="handleCompletionProofUpload('giftCompletion')">
								<image v-if="giftCompletionProofPreview" :src="giftCompletionProofPreview" mode="aspectFit" class="preview-image"></image>
								<text v-else class="upload-placeholder">+</text>
								<view v-if="isUploadingGiftProof" class="upload-loading">上传中...</view>
							</view>
						</view>
						<view class="form-field">
							<text class="form-label">成本价格 (元):</text>
							<input type="digit" v-model.number="inputCostPrice" placeholder="请输入成本价 (数字)" class="input-field cost-input" />
						</view>
						<button class="action-button gift-button-complete" @click="completeGiftOrder"
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
	import { mapGetters, mapActions, mapState } from 'vuex'; // Added mapState
	// 建议从 utils 导入格式化函数
	import { formatDate, formatOrderStatus, formatOrderType } from '@/utils/formatters.js'; // 假设路径正确


	export default {
		data() {
			return {
				orderId: null,
				order: null,
				loading: false, 
				isPageLoading: true, 
				orderLoadError: null, 

				// CDK 完成凭证
				cdkCompletionProofPreview: null,
				cdkCompletionProofFileId: null,
				isUploadingCdkProof: false,
				isSubmittingCdk: false,

				// Gift 完成凭证
				giftCompletionProofPreview: null,
				giftCompletionProofFileId: null,
				isUploadingGiftProof: false,
				isSubmittingGiftAction: false, 
				
				inputCostPrice: null, // 新增：供货商输入的成本价格
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'currentUser', 'userRole']), // currentUser should have _id
			...mapState('user', ['token']) // Directly map token
		},
		onLoad(options) {
			if (options.id) {
				this.orderId = options.id;
				this.checkAuthAndLoadOrderDetails();
			} else {
				this.orderLoadError = '未提供订单ID';
				this.isPageLoading = false;
				uni.showToast({ title: '缺少订单ID参数', icon: 'error' });
			}
		},
		watch: {
			order(newOrder) {
				// 当订单数据加载或更新后，如果当前用户是供货商且已填写过成本，则预填充inputCostPrice
				// (此场景主要用于查看已完成订单，对于首次完成，inputCostPrice应由用户输入)
				// 为简化，首次完成时，inputCostPrice将为空，供货商需手动填写
				// 如果需要编辑已填写的成本，逻辑会更复杂
				if (newOrder && newOrder.costPrice !== null && newOrder.costPrice !== undefined && this.userRole === 'supplier' && newOrder.supplierId === this.currentUser._id) {
                    // 通常在完成时输入，所以加载详情时不清空 inputCostPrice 除非是不同订单或重新进入
                    // this.inputCostPrice = newOrder.costPrice; 
                    // 决定：让供货商在“完成”操作时填写，不预填充旧值，以免混淆是否本次操作已填。
				}
                 // 清空截图预览和FileID，以及成本价输入，当订单变化或重新加载时
                this.cdkCompletionProofPreview = null;
                this.cdkCompletionProofFileId = null;
                this.giftCompletionProofPreview = null;
                this.giftCompletionProofFileId = null;
                this.inputCostPrice = null; // 每次加载详情都重置供货商的成本输入框
			}
		},
		methods: {
			...mapActions('user', ['logout']),
			// 使用导入的格式化函数
			formatDate,
			formatOrderStatus,
			formatOrderType,

			goToLogin() {
				this.$store.dispatch('user/logout');
			},

			async checkAuthAndLoadOrderDetails() {
				this.isPageLoading = true;
				if (!this.isLoggedIn) {
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
				// const currentToken = this.token || uni.getStorageSync('userToken'); // Use mapped token

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'viewOrderDetails',
							token: this.token, // 使用来自 Vuex 的 token
							orderId: this.orderId
						}
					});
					if (res.result.code === 200) {
						this.order = res.result.data;
					} else if (res.result.code === 401) {
						this.orderLoadError = res.result.message || '登录失效，请重新登录';
						uni.showToast({ title: this.orderLoadError, icon: 'error' });
						this.goToLogin();
					} else {
						this.orderLoadError = res.result.message || '加载订单详情失败';
						uni.showToast({ title: this.orderLoadError, icon: 'error' });
						this.order = null; 
					}
				} catch (err) {
					console.error('fetchOrderDetails 调用失败:', err);
					this.orderLoadError = '请求订单详情异常';
					uni.showToast({ title: this.orderLoadError, icon: 'error' });
				} finally {
					this.loading = false;
					this.isPageLoading = false; 
				}
			},

			previewImage(fileUrl) { // Changed parameter name for clarity
				if (fileUrl) {
					uni.previewImage({
						urls: [fileUrl],
						current: fileUrl
					});
				}
			},
			handleCompletionProofUpload(type) { 
				let isUploadingFlag = type === 'cdkCompletion' ? 'isUploadingCdkProof' : 'isUploadingGiftProof';
				let previewFlag = type === 'cdkCompletion' ? 'cdkCompletionProofPreview' : 'giftCompletionProofPreview';
				let fileIdFlag = type === 'cdkCompletion' ? 'cdkCompletionProofFileId' : 'giftCompletionProofFileId';

				if (this[isUploadingFlag]) return;

				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					success: async (res) => {
						const tempFilePath = res.tempFilePaths[0];
						this[isUploadingFlag] = true;
						this[previewFlag] = tempFilePath;
						this[fileIdFlag] = null; // Clear previous file ID on new upload

						try {
							// 确保 currentUser 和 orderId 有效
							if (!this.currentUser || !this.currentUser._id || !this.orderId) {
								throw new Error('用户信息或订单ID无效，无法生成 cloudPath');
							}
							const fileExtension = tempFilePath.substring(tempFilePath.lastIndexOf('.') + 1);
							const cloudPath =
								`completion_proofs/${this.currentUser._id}_${this.orderId}_${type}_${Date.now()}.${fileExtension}`;
							
							// uni.cloud.uploadFile 返回 Promise
							const uploadResult = await uni.cloud.uploadFile({
								cloudPath,
								filePath: tempFilePath,
								// cloudType: 'tcb' // 如果是微信，可能不需要或根据实际情况
							});

							if (uploadResult.fileID) {
								this[fileIdFlag] = uploadResult.fileID;
								uni.showToast({ title: '凭证上传成功', icon: 'success' });
							} else {
								console.error('上传失败，返回结果:', uploadResult);
								throw new Error('上传失败未返回FileID');
							}
						} catch (err) {
							console.error(`上传凭证(${type})失败:`, err);
							uni.showToast({ title: `凭证上传失败: ${err.message || ''}`, icon: 'error' });
							this[previewFlag] = null;
							this[fileIdFlag] = null;
						} finally {
							this[isUploadingFlag] = false;
						}
					},
					fail: (chooseErr) => {
						console.log('选择图片失败', chooseErr);
						// uni.showToast({ title: '取消选择或选择失败', icon: 'none' });
					}
				});
			},

			async processCdkOrder() {
				if (!this.cdkCompletionProofFileId) {
					uni.showToast({ title: '请先上传CDK完成截图', icon: 'none' });
					return;
				}
				// 成本价格校验
				const cost = parseFloat(this.inputCostPrice);
				if (this.inputCostPrice !== null && (isNaN(cost) || cost < 0)) {
					uni.showToast({ title: '请输入有效的成本价格 (非负数字)', icon: 'none' });
					return;
				}

				this.isSubmittingCdk = true;
				try {
					const payload = {
						action: 'processCdkOrder',
						token: this.token,
						orderId: this.orderId,
						screenshots: {
							completionProofFileId: this.cdkCompletionProofFileId
						}
					};
					if (this.inputCostPrice !== null && !isNaN(cost) && cost >= 0) {
						payload.costPrice = cost;
					}

					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: payload
					});

					if (res.result.code === 200) {
						uni.showToast({ title: 'CDK订单处理成功!', icon: 'success' });
						this.inputCostPrice = null; // 清空输入
						this.cdkCompletionProofFileId = null;
						this.cdkCompletionProofPreview = null; 
						await this.fetchOrderDetails(); 
					} else {
						uni.showToast({ title: res.result.message || '操作失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '请求异常', icon: 'error' });
					console.error("processCdkOrder error:", err);
				} finally {
					this.isSubmittingCdk = false;
				}
			},

			async startGiftTimer() {
				this.isSubmittingGiftAction = true;
				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'startGiftOrderTimer',
							token: this.token,
							orderId: this.orderId
						}
					});
					if (res.result.code === 200) {
						uni.showToast({ title: '计时已开始!', icon: 'success' });
						await this.fetchOrderDetails();
					} else {
						uni.showToast({ title: res.result.message || '操作失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '请求异常', icon: 'error' });
					console.error("startGiftTimer error:", err);
				} finally {
					this.isSubmittingGiftAction = false;
				}
			},

			async completeGiftOrder() {
				if (!this.giftCompletionProofFileId) {
					uni.showToast({ title: '请先上传皮肤赠送完成截图', icon: 'none' });
					return;
				}
				// 成本价格校验
				const cost = parseFloat(this.inputCostPrice);
				if (this.inputCostPrice !== null && (isNaN(cost) || cost < 0)) {
					uni.showToast({ title: '请输入有效的成本价格 (非负数字)', icon: 'none' });
					return;
				}
				
				this.isSubmittingGiftAction = true;
				try {
					const payload = {
						action: 'completeGiftOrder',
						token: this.token,
						orderId: this.orderId,
						screenshots: {
							completionProofFileId: this.giftCompletionProofFileId
						}
					};
					if (this.inputCostPrice !== null && !isNaN(cost) && cost >=0) {
						payload.costPrice = cost;
					}

					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: payload
					});
					if (res.result.code === 200) {
						uni.showToast({ title: '皮肤赠送完成!', icon: 'success' });
						this.inputCostPrice = null; // 清空输入
						this.giftCompletionProofFileId = null;
						this.giftCompletionProofPreview = null;
						await this.fetchOrderDetails();
					} else {
						uni.showToast({ title: res.result.message || '操作失败', icon: 'error' });
					}
				} catch (err) {
					uni.showToast({ title: '请求异常', icon: 'error' });
					console.error("completeGiftOrder error:", err);
				} finally {
					this.isSubmittingGiftAction = false;
				}
			},
			goBack() {
				uni.navigateBack();
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
	.loading-container, .unauthorized-container, .error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding-top: 100rpx;
		color: #666;
		text-align: center;
	}
	.login-prompt-button, .error-container button, .back-button {
		margin-top: 20rpx;
		font-size: 28rpx;
		padding: 10rpx 30rpx;
	}
	.details-content {
		background-color: #fff;
		border-radius: 12rpx;
		/* padding: 30rpx; removed for section-based padding */
	}
	.detail-section {
		margin-bottom: 20rpx; /* Space between sections */
		padding: 25rpx;
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
		margin-bottom: 25rpx;
		padding-bottom: 15rpx;
		border-bottom: 1rpx solid #e8e8e8;
	}
	.info-grid { /* For a potentially better layout if many items */
		/* display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280rpx, 1fr));
		gap: 15rpx; */
	}
	.detail-item {
		display: flex;
		font-size: 28rpx;
		line-height: 1.7;
		margin-bottom: 12rpx;
		align-items: flex-start;
	}
	.label {
		width: 180rpx;
		color: #666; /* Darker gray for labels */
		flex-shrink: 0;
	}
	.value {
		color: #333;
		flex: 1;
		word-break: break-all;
	}
    .value.important {
        font-weight: bold;
        color: #007bff;
    }
	.remarks-value {
		white-space: pre-wrap;
		background-color: #f9f9f9;
		padding: 10rpx;
		border-radius: 6rpx;
		border: 1rpx solid #eee;
	}
	.id-value {
		font-size: 26rpx; /* Slightly smaller for IDs */
		color: #555;
	}
	.type-value.cdk { color: #17a2b8; font-weight: 500; }
	.type-value.gift { color: #fd7e14; font-weight: 500; }

	.status-value.pending { color: #ffc107; }
	.status-value.timing { color: #007bff; }
	.status-value.ready_to_send { color: #fd7e14; }
	.status-value.completed { color: #28a745; }
	.status-value.cancelled { color: #6c757d; }

    .cost-price-display {
        color: #c0392b; /* Red for cost */
        font-weight: bold;
    }

	.screenshot-item {
		margin-bottom: 20rpx;
	}
	.screenshot-item .label {
		display: block;
		margin-bottom: 10rpx;
		color: #555;
	}
	.screenshot-image {
		width: 200rpx;
		height: 200rpx;
		border: 1px solid #eee;
		background-color: #f0f0f0;
		border-radius: 8rpx;
	}

	.supplier-actions-section {
		margin-top: 30rpx; /* Increased top margin */
		padding-top: 20rpx;
		border-top: 1px solid #e0e0e0; /* Slightly darker border */
	}
	.action-title {
		font-size: 30rpx;
		font-weight: bold;
		margin-bottom: 25rpx;
		color: #333;
	}
	.form-field {
		margin-bottom: 25rpx;
	}
	.form-field .form-label { /* Reusing label class for consistency */
		display: block;
		font-size: 28rpx;
		color: #555;
		margin-bottom: 10rpx;
	}
	.input-field.cost-input {
		height: 70rpx;
		padding: 0 20rpx;
		font-size: 28rpx;
		border: 1px solid #ccc;
		border-radius: 6rpx;
		background-color: #fff;
	}
	.image-uploader {
		width: 180rpx;
		height: 180rpx;
		border: 2rpx dashed #007bff;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #f9f9f9;
		position: relative;
		margin-bottom: 10rpx; /* Reduced margin if label is above */
		border-radius: 8rpx;
	}
	.preview-image {
		width: 100%;
		height: 100%;
		border-radius: 6rpx;
	}
	.upload-placeholder {
		font-size: 60rpx;
		color: #007bff;
	}
	.upload-loading {
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		background-color: rgba(255,255,255,0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #007bff;
		font-size: 24rpx;
		border-radius: 6rpx;
	}
	.action-button {
		width: 100%;
		margin-top: 20rpx;
		color: white;
		font-size: 30rpx;
		padding: 20rpx 0;
		height: auto;
		line-height: normal;
		border-radius: 8rpx;
	}
	.cdk-button { background-color: #007aff; }
	.gift-button-start { background-color: #ff9800; } /* Orange for start timer */
	.gift-button-complete { background-color: #4CAF50; } /* Green for complete */

	.action-button[disabled] {
		background-color: #c0c0c0;
		opacity: 0.7;
	}
	.refresh-button {
		margin-top: 40rpx;
		background-color: #6c757d;
		color: white;
		font-size: 28rpx;
		padding: 18rpx 0;
		height: auto;
		line-height: normal;
		border-radius: 8rpx;
	}
</style>