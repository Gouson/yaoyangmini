<template>
	<view class="create-order-container">
		<view class="form-title">创建新订单</view>

		<view class="form-item">
			<text class="label">订单编号<text class="required">*</text></text>
			<input class="input" v-model.trim="orderData.orderNumber" placeholder="请输入客服记录的订单编号" />
		</view>

		<view class="form-item">
			<text class="label">买家游戏ID<text class="required">*</text></text>
			<input class="input" v-model.trim="orderData.buyerGameId" placeholder="请输入买家游戏数字ID" />
		</view>

		<view class="form-item">
			<text class="label">订单类型<text class="required">*</text></text>
			<picker class="picker" :range="orderTypeOptions" range-key="text" :value="orderTypeIndex"
				@change="onOrderTypeChange">
				<view class="picker-value">{{ orderTypeOptions[orderTypeIndex].text }}</view>
			</picker>
		</view>

		<view class="form-item">
			<text class="label">指派供货商 (可选)</text>
			<picker class="picker" mode="selector" :range="supplierListForPicker" range-key="displayName"
				:value="selectedSupplierIndex" @change="onSupplierChange">
				<view class="picker-value">
					{{ selectedSupplierIndex > -1 ? supplierListForPicker[selectedSupplierIndex].displayName : '不指定 (所有供货商可见)' }}
				</view>
			</picker>
		</view>

		<view class="form-item">
			<text class="label">订单内容截图<text class="required">*</text></text>
			<view class="image-uploader" @click="handleImageUpload('orderContent')">
				<image v-if="orderContentImagePreview" :src="orderContentImagePreview" mode="aspectFit"
					class="preview-image"></image>
				<text v-else class="upload-placeholder">+</text>
				<view v-if="isUploadingOrderContent" class="upload-loading">上传中...</view>
			</view>
			<text v-if="orderData.screenshots.orderContentFileId" class="file-id-display">FileID: 已上传</text>
		</view>

		<view class="form-item">
			<text class="label">买家ID主页截图<text class="required">*</text></text>
			<view class="image-uploader" @click="handleImageUpload('buyerIdPage')">
				<image v-if="buyerIdPageImagePreview" :src="buyerIdPageImagePreview" mode="aspectFit"
					class="preview-image"></image>
				<text v-else class="upload-placeholder">+</text>
				<view v-if="isUploadingBuyerIdPage" class="upload-loading">上传中...</view>
			</view>
			<text v-if="orderData.screenshots.buyerIdPageFileId" class="file-id-display">FileID: 已上传</text>
		</view>

		<view class="form-item">
			<text class="label">备注信息</text>
			<textarea class="textarea" v-model="orderData.remarks" placeholder="请输入订单备注（可选）" />
		</view>

		<button class="submit-button" @click="handleSubmitOrder" :loading="isSubmitting"
			:disabled="isSubmitting || isUploadingOrderContent || isUploadingBuyerIdPage">
			提 交 订 单
		</button>
	</view>
</template>

<script>
	import {
		mapGetters
	} from 'vuex';

	export default {
		data() {
			return {
				orderData: {
					orderNumber: '',
					buyerGameId: '',
					orderType: 'cdk', // 默认 'cdk'
					remarks: '',
					screenshots: {
						orderContentFileId: null,
						buyerIdPageFileId: null
					}
				},
				assignedSupplierId: null,
				orderTypeOptions: [{
						value: 'cdk',
						text: 'CDK激活码'
					},
					{
						value: 'gift',
						text: '皮肤赠送'
					}
				],
				orderTypeIndex: 0, // 对应 orderTypeOptions 的索引

				supplierList: [], // 存储从后端获取的供货商列表
				selectedSupplierIndex: -1, // Picker 默认不选中

				orderContentImagePreview: null,
				buyerIdPageImagePreview: null,

				isUploadingOrderContent: false,
				isUploadingBuyerIdPage: false,
				isSubmitting: false,
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'userRole', 'token', 'currentUser']),
			supplierListForPicker() {
				// 构造 Picker 需要的数组，增加一个“不指定”的选项
				const options = [{
					_id: null,
					displayName: '不指定 (所有供货商可见)'
				}];
				this.supplierList.forEach(supplier => {
					options.push({
						_id: supplier._id,
						displayName: `${supplier.nickname} (${supplier.username})`
					});
				});
				return options;
			}
		},
		async onLoad() {
			// 权限检查
			if (!this.isLoggedIn || this.userRole !== 'cs') {
				uni.showToast({
					title: '权限不足或未登录',
					icon: 'error',
					duration: 2000
				});
				setTimeout(() => {
					this.$store.dispatch('user/logout'); // 确保跳转到登录页
				}, 2000);
				return; // 提前返回，不执行后续逻辑
			}
			await this.fetchActiveSuppliers(); // 【新增】加载供货商列表
		},
		methods: {
			onOrderTypeChange(e) {
				this.orderTypeIndex = e.detail.value;
				this.orderData.orderType = this.orderTypeOptions[this.orderTypeIndex].value;
			},

			handleImageUpload(type) {
				if (type === 'orderContent' && this.isUploadingOrderContent) return;
				if (type === 'buyerIdPage' && this.isUploadingBuyerIdPage) return;

				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'], // 可以指定是原图还是压缩图，默认二者都有
					sourceType: ['album', 'camera'], // 从相册选择或使用相机
					success: async (res) => {
						const tempFilePath = res.tempFilePaths[0];

						if (type === 'orderContent') {
							this.orderContentImagePreview = tempFilePath;
							this.isUploadingOrderContent = true;
						} else if (type === 'buyerIdPage') {
							this.buyerIdPageImagePreview = tempFilePath;
							this.isUploadingBuyerIdPage = true;
						}

						try {
							// 生成云端路径，建议包含用户ID和时间戳防止重名
							const cloudPath =
								`orders_screenshots/${this.currentUser._id}_${type}_${Date.now()}_${tempFilePath.substring(tempFilePath.lastIndexOf('/') + 1)}`;

							const uploadResult = await uni.cloud.uploadFile({
								cloudPath: cloudPath,
								filePath: tempFilePath,
							});

							if (uploadResult.fileID) {
								if (type === 'orderContent') {
									this.orderData.screenshots.orderContentFileId = uploadResult.fileID;
								} else if (type === 'buyerIdPage') {
									this.orderData.screenshots.buyerIdPageFileId = uploadResult.fileID;
								}
								uni.showToast({
									title: '上传成功',
									icon: 'success',
									duration: 1000
								});
							} else {
								throw new Error('上传失败未返回FileID');
							}
						} catch (err) {
							console.error(`上传图片 (${type}) 失败:`, err);
							uni.showToast({
								title: `上传图片 (${type}) 失败`,
								icon: 'error'
							});
							// 上传失败，清空预览
							if (type === 'orderContent') this.orderContentImagePreview = null;
							else if (type === 'buyerIdPage') this.buyerIdPageImagePreview = null;
						} finally {
							if (type === 'orderContent') this.isUploadingOrderContent = false;
							else if (type === 'buyerIdPage') this.isUploadingBuyerIdPage = false;
						}
					},
					fail: (err) => {
						if (err.errMsg.indexOf('cancel') === -1) { // 用户取消选择不算错误
							uni.showToast({
								title: '选择图片失败',
								icon: 'none'
							});
						}
					}
				});
			},

			// 【新增】获取供货商列表的方法
			async fetchActiveSuppliers() {
				const currentToken = this.token || uni.getStorageSync('userToken');
				if (!currentToken) return; // 应该在 onLoad 就处理了未登录情况

				try {
					const res = await uni.cloud.callFunction({
						name: 'account-center',
						data: {
							action: 'getActiveSuppliers',
							token: currentToken
						}
					});
					if (res.result.code === 200) {
						this.supplierList = res.result.data;
					} else {
						uni.showToast({
							title: res.result.message || '加载供货商失败',
							icon: 'none'
						});
					}
				} catch (err) {
					console.error('加载供货商列表失败:', err);
					uni.showToast({
						title: '请求供货商列表异常',
						icon: 'none'
					});
				}
			},

			// 【新增】供货商选择器变化事件
			onSupplierChange(e) {
				const index = e.detail.value;
				this.selectedSupplierIndex = index;
				this.orderData.assignedSupplierId = this.supplierListForPicker[index]._id; // 存入实际的 _id
			},

			async handleSubmitOrder() {
				// 表单校验
				if (!this.orderData.orderNumber) return uni.showToast({
					title: '请输入订单编号',
					icon: 'none'
				});
				if (!this.orderData.buyerGameId) return uni.showToast({
					title: '请输入买家游戏ID',
					icon: 'none'
				});
				if (!this.orderData.screenshots.orderContentFileId) return uni.showToast({
					title: '请上传订单内容截图',
					icon: 'none'
				});
				if (!this.orderData.screenshots.buyerIdPageFileId) return uni.showToast({
					title: '请上传买家ID主页截图',
					icon: 'none'
				});

				this.isSubmitting = true;
				const currentToken = this.token || uni.getStorageSync('userToken'); // 从Vuex或缓存获取token

				try {
					const res = await uni.cloud.callFunction({
						name: 'order-center',
						data: {
							action: 'createOrder',
							token: currentToken,
							orderInput: this.orderData
						}
					});

					if (res.result.code === 200) {
						uni.showToast({
							title: '订单创建成功!',
							icon: 'success',
							duration: 2000
						});
						// 清空表单
						this.orderData = {
							orderNumber: '',
							buyerGameId: '',
							orderType: 'cdk',
							remarks: '',
							screenshots: {
								orderContentFileId: null,
								buyerIdPageFileId: null
							},
							assignedSupplierId: null // 重置
						};
						this.orderTypeIndex = 0;
						this.orderContentImagePreview = null;
						this.buyerIdPageImagePreview = null;
						// 可选：跳转回客服订单列表页或客服首页
						setTimeout(() => {
							uni.navigateBack(); // 或 uni.switchTab({ url: '/pages/cs/index' });
						}, 2000);
					} else if (res.result.code === 401) {
						uni.showToast({
							title: res.result.message || '登录失效',
							icon: 'error'
						});
						this.$store.dispatch('user/logout');
					} else {
						uni.showToast({
							title: res.result.message || '订单创建失败',
							icon: 'error'
						});
					}
				} catch (err) {
					console.error('创建订单请求失败:', err);
					uni.showToast({
						title: '订单提交异常',
						icon: 'error'
					});
				} finally {
					this.isSubmitting = false;
				}
			}
		}
	}
</script>

<style scoped>
	.create-order-container {
		padding: 30rpx;
	}

	.form-title {
		font-size: 40rpx;
		font-weight: bold;
		text-align: center;
		margin-bottom: 40rpx;
	}

	.form-item {
		margin-bottom: 30rpx;
	}

	.label {
		display: block;
		font-size: 28rpx;
		color: #333;
		margin-bottom: 10rpx;
	}

	.required {
		color: red;
		margin-left: 5rpx;
	}

	.input,
	.textarea,
	.picker {
		width: 100%;
		height: 80rpx;
		border: 1px solid #e0e0e0;
		border-radius: 8rpx;
		padding: 0 20rpx;
		font-size: 28rpx;
		box-sizing: border-box;
		background-color: #fff;
	}

	.textarea {
		height: 160rpx;
		padding: 20rpx;
	}

	.picker-value {
		line-height: 80rpx;
		/* 使文字在picker内垂直居中 */
	}

	.image-uploader {
		width: 200rpx;
		height: 200rpx;
		border: 1px dashed #ccc;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #f9f9f9;
		position: relative;
		margin-top: 10rpx;
	}

	.preview-image {
		width: 100%;
		height: 100%;
	}

	.upload-placeholder {
		font-size: 80rpx;
		color: #ccc;
	}

	.upload-loading {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		text-align: center;
		font-size: 24rpx;
		padding: 5rpx 0;
	}

	.file-id-display {
		font-size: 22rpx;
		color: #999;
		margin-top: 5rpx;
		display: block;
		word-break: break-all;
	}

	.submit-button {
		margin-top: 50rpx;
		background-color: #007aff;
		color: white;
		font-size: 32rpx;
	}

	.submit-button[disabled] {
		background-color: #c0c0c0;
	}

	.picker {
		/* 确保picker样式与其他输入框一致 */
		width: 100%;
		height: 80rpx;
		border: 1px solid #e0e0e0;
		border-radius: 8rpx;
		padding: 0 20rpx;
		font-size: 28rpx;
		box-sizing: border-box;
		background-color: #fff;
		display: flex;
		/* 用于 picker-value 垂直居中 */
		align-items: center;
		/* 用于 picker-value 垂直居中 */
	}

	.picker-value {
		width: 100%;
		/* 确保文字能撑开 picker */
	}
</style>