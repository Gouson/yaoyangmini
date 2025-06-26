<template>
	<view class="create-order-container">
		<view class="form-title">创建新订单</view>

		<view class="form-item" v-if="userRole === 'admin'">
			<text class="label">所属游戏<text class="required">*</text></text>
			<picker class="picker" :range="gameList" range-key="name" @change="onGameChange">
				<view class="picker-value">{{ selectedGameName }}</view>
			</picker>
		</view>

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
			<picker class="picker" :range="orderTypeOptions" range-key="text" :value="orderTypeIndex" @change="onOrderTypeChange">
				<view class="picker-value">{{ orderTypeOptions[orderTypeIndex].text }}</view>
			</picker>
		</view>

		<view class="form-item">
			<text class="label">指派供货商 (可选)</text>
			<picker class="picker" :range="supplierListForPicker" range-key="displayName" @change="onSupplierChange">
				<view class="picker-value">{{ selectedSupplierName }}</view>
			</picker>
		</view>

		<view class="form-item">
			<text class="label">订单内容截图<text class="required">*</text></text>
			<view class="image-uploader" @click="handleImageUpload('orderContent')">
				<image v-if="orderContentImagePreview" :src="orderContentImagePreview" mode="aspectFit" class="preview-image"></image>
				<text v-else class="upload-placeholder">+</text>
				<view v-if="uploading.orderContent" class="upload-loading">上传中...</view>
			</view>
		</view>

		<view class="form-item">
			<text class="label">买家ID主页截图<text class="required">*</text></text>
			<view class="image-uploader" @click="handleImageUpload('buyerIdPage')">
				<image v-if="buyerIdPageImagePreview" :src="buyerIdPageImagePreview" mode="aspectFit" class="preview-image"></image>
				<text v-else class="upload-placeholder">+</text>
				<view v-if="uploading.buyerIdPage" class="upload-loading">上传中...</view>
			</view>
		</view>

		<view class="form-item">
			<text class="label">备注信息</text>
			<textarea class="textarea" v-model="orderData.remarks" placeholder="请输入订单备注（可选）" />
		</view>

		<button class="submit-button" @click="handleSubmitOrder" :loading="isSubmitting" :disabled="isSubmitting || uploading.orderContent || uploading.buyerIdPage">
			提 交 订 单
		</button>
	</view>
</template>

<script>
	import { mapGetters, mapState } from 'vuex';
	export default {
		data() {
			return {
				orderData: {
					orderNumber: '', buyerGameId: '', orderType: 'cdk', remarks: '',
					screenshots: { orderContentFileId: null, buyerIdPageFileId: null },
					assignedSupplierId: null, game_id: null
				},
				orderTypeOptions: [{ value: 'cdk', text: 'CDK激活码' }, { value: 'gift', text: '皮肤赠送' }],
				orderTypeIndex: 0,
				supplierList: [],
				selectedSupplierName: '不指定 (所有供货商可见)',
				orderContentImagePreview: null,
				buyerIdPageImagePreview: null,
				uploading: { orderContent: false, buyerIdPage: false },
				isSubmitting: false,
				gameList: [],
				selectedGameName: '请选择游戏',
			};
		},
		computed: {
			...mapGetters('user', ['isLoggedIn', 'userRole', 'currentUser']),
			...mapState('user', ['token']),
			supplierListForPicker() {
				const options = [{ _id: null, displayName: '不指定' }];
				this.supplierList.forEach(s => options.push({ _id: s._id, displayName: `${s.nickname} (${s.username})` }));
				return options;
			}
		},
		async onLoad() {
			if (!this.isLoggedIn || !['admin', 'cs'].includes(this.userRole)) {
				uni.showToast({ title: '权限不足', icon: 'error' });
				setTimeout(() => this.$store.dispatch('user/logout'), 1500);
				return;
			}
			if (this.userRole === 'admin') {
				await this.fetchGames();
			} else { // 如果是客服
				if (!this.currentUser.game_id) {
					uni.showToast({ title: '您尚未分配游戏，请联系管理员', icon: 'error', duration: 3000 });
					setTimeout(() => uni.navigateBack(), 3000);
					return;
				}
				await this.fetchActiveSuppliers();
			}
		},
		methods: {
			async fetchGames() {
				const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getGames', token: this.token } });
				if (res.result.code === 200) this.gameList = res.result.data;
			},
			async fetchActiveSuppliers() {
				const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getActiveSuppliers', token: this.token } });
				if (res.result.code === 200) this.supplierList = res.result.data;
			},
			async fetchActiveSuppliersForGame(gameId) {
				const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getActiveSuppliers', token: this.token, game_id: gameId } });
				if (res.result.code === 200) this.supplierList = res.result.data;
			},
			onGameChange(e) {
				const game = this.gameList[e.detail.value];
				this.selectedGameName = game.name;
				this.orderData.game_id = game._id;
				this.supplierList = [];
				this.selectedSupplierName = '不指定';
				this.orderData.assignedSupplierId = null;
				this.fetchActiveSuppliersForGame(game._id);
			},
			onOrderTypeChange(e) { 
				this.orderData.orderType = this.orderTypeOptions[e.detail.value].value; 
				this.orderTypeIndex = e.detail.value;
			},
			onSupplierChange(e) {
				const supplier = this.supplierListForPicker[e.detail.value];
				this.orderData.assignedSupplierId = supplier._id;
				this.selectedSupplierName = supplier.displayName;
			},
			handleImageUpload(type) {
				if (this.uploading[type]) return;
				uni.chooseImage({
					count: 1, 
					success: async (res) => {
						this.uploading[type] = true;
						const tempFilePath = res.tempFilePaths[0];
						if(type === 'orderContent') this.orderContentImagePreview = tempFilePath;
						else this.buyerIdPageImagePreview = tempFilePath;
						try {
							const cloudPath = `orders_screenshots/${this.currentUser._id}_${type}_${Date.now()}`;
							const uploadResult = await uni.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
							if (type === 'orderContent') this.orderData.screenshots.orderContentFileId = uploadResult.fileID;
							else this.orderData.screenshots.buyerIdPageFileId = uploadResult.fileID;
							uni.showToast({title: "上传成功", icon: "success"})
						} catch(e) {
							uni.showToast({ title: '上传失败', icon: 'error' });
						} finally {
							this.uploading[type] = false;
						}
					}
				});
			},
			async handleSubmitOrder() {
				if (this.userRole === 'admin' && !this.orderData.game_id) { uni.showToast({ title: '管理员请先选择游戏', icon: 'none' }); return; }
				if (!this.orderData.orderNumber || !this.orderData.buyerGameId || !this.orderData.screenshots.orderContentFileId || !this.orderData.screenshots.buyerIdPageFileId) {
					uni.showToast({ title: '请填写所有必填项和截图', icon: 'none' }); return;
				}
				this.isSubmitting = true;
				try {
					const res = await uni.cloud.callFunction({ name: 'order-center', data: { action: 'createOrder', token: this.token, orderInput: this.orderData } });
					if (res.result.code === 200) { 
						uni.showToast({ title: '订单创建成功!', icon: 'success' }); 
						setTimeout(() => uni.navigateBack(), 1500); 
					} 
					else { 
						uni.showToast({ title: res.result.message, icon: 'error' }); 
					}
				} catch (e) { 
					uni.showToast({ title: '提交异常', icon: 'error' }); 
				} finally { 
					this.isSubmitting = false; 
				}
			}
		}
	}
</script>

<style scoped>
	.create-order-container { padding: 30rpx; }
	.form-title { font-size: 40rpx; font-weight: bold; text-align: center; margin-bottom: 40rpx; }
	.form-item { margin-bottom: 30rpx; }
	.label { display: block; font-size: 28rpx; color: #333; margin-bottom: 10rpx; }
	.required { color: red; margin-left: 5rpx; }
	.input, .textarea, .picker { width: 100%; height: 80rpx; border: 1px solid #e0e0e0; border-radius: 8rpx; padding: 0 20rpx; font-size: 28rpx; box-sizing: border-box; background-color: #fff; }
	.textarea { height: 160rpx; padding: 20rpx; }
	.picker-value { line-height: 80rpx; }
	.image-uploader { width: 200rpx; height: 200rpx; border: 1px dashed #ccc; display: flex; justify-content: center; align-items: center; background-color: #f9f9f9; position: relative; margin-top: 10rpx; }
	.preview-image { width: 100%; height: 100%; }
	.upload-placeholder { font-size: 80rpx; color: #ccc; }
	.upload-loading { position: absolute; bottom: 0; left: 0; width: 100%; background-color: rgba(0, 0, 0, 0.5); color: white; text-align: center; font-size: 24rpx; padding: 5rpx 0; }
	.submit-button { margin-top: 50rpx; background-color: #007aff; color: white; font-size: 32rpx; }
	.submit-button[disabled] { background-color: #c0c0c0; }
</style>