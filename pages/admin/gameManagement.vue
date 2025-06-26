<template>
	<view class="game-management-container">
		<view class="header">
			<text class="page-title">游戏管理</text>
			<button size="mini" type="primary" @click="openAddModal()">添加新游戏</button>
		</view>

		<view v-if="loading" class="loading-text">加载中...</view>
		<view v-if="!loading && gameList.length === 0" class="empty-text">暂无游戏，请添加。</view>

		<scroll-view v-else scroll-y class="game-list">
			<view v-for="game in gameList" :key="game._id" class="game-card">
				<view class="game-info">
					<text class="game-name">{{ game.name }}</text>
					<text class="game-desc">{{ game.description || '暂无描述' }}</text>
				</view>
				<view class="game-actions">
					<button size="mini" @click="openEditModal(game)">编辑</button>
					<button size="mini" type="warn" @click="confirmDelete(game._id)">删除</button>
				</view>
			</view>
		</scroll-view>

		<view v-if="modalVisible" class="modal-mask">
			<view class="modal-content">
				<text class="modal-title">{{ isEditMode ? '编辑游戏' : '添加新游戏' }}</text>
				<input class="modal-input" v-model="currentGame.name" placeholder="请输入游戏名称" />
				<textarea class="modal-textarea" v-model="currentGame.description" placeholder="请输入游戏描述 (可选)" />
				<view class="modal-actions">
					<button class="modal-btn" @click="closeModal">取消</button>
					<button class="modal-btn primary" @click="handleSaveGame" :disabled="isSaving">{{ isSaving ? '保存中...' : '保存' }}</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapState } from 'vuex';
	export default {
		data() {
			return {
				gameList: [],
				loading: true,
				modalVisible: false,
				isEditMode: false,
				isSaving: false,
				currentGame: {
					_id: null,
					name: '',
					description: ''
				}
			};
		},
		computed: {
			...mapState('user', ['token'])
		},
		onLoad() {
			if (this.$store.getters['user/userRole'] !== 'admin') {
				uni.showToast({ title: '无权限访问', icon: 'error' });
				uni.navigateBack();
				return;
			}
			this.fetchGames();
		},
		methods: {
			async fetchGames() {
				this.loading = true;
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'getGames', token: this.token } });
					if (res.result.code === 200) {
						this.gameList = res.result.data;
					} else {
						uni.showToast({ title: res.result.message || '加载失败', icon: 'none' });
					}
				} catch (e) {
					uni.showToast({ title: '请求失败', icon: 'error' });
				} finally {
					this.loading = false;
				}
			},
			openAddModal() {
				this.isEditMode = false;
				this.currentGame = { _id: null, name: '', description: '' };
				this.modalVisible = true;
			},
			openEditModal(game) {
				this.isEditMode = true;
				this.currentGame = { ...game };
				this.modalVisible = true;
			},
			closeModal() {
				this.modalVisible = false;
			},
			async handleSaveGame() {
				if (!this.currentGame.name) {
					uni.showToast({ title: '游戏名称不能为空', icon: 'none' });
					return;
				}
				this.isSaving = true;
				const action = this.isEditMode ? 'updateGame' : 'addGame';
				const requestData = {
					action,
					token: this.token,
					gameDetails: { name: this.currentGame.name, description: this.currentGame.description }
				};
				if (this.isEditMode) {
					requestData.gameId = this.currentGame._id;
				}
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: requestData });
					if (res.result.code === 200) {
						uni.showToast({ title: '保存成功', icon: 'success' });
						this.closeModal();
						await this.fetchGames();
					} else {
						uni.showToast({ title: res.result.message || '保存失败', icon: 'none' });
					}
				} catch (e) {
					uni.showToast({ title: '请求异常', icon: 'error' });
				} finally {
					this.isSaving = false;
				}
			},
			confirmDelete(gameId) {
				uni.showModal({
					title: '确认删除',
					content: '确定要删除这个游戏吗？如果有关联的用户或订单，将无法删除。',
					success: (res) => {
						if (res.confirm) {
							this.deleteGame(gameId);
						}
					}
				});
			},
			async deleteGame(gameId) {
				uni.showLoading({ title: '删除中...' });
				try {
					const res = await uni.cloud.callFunction({ name: 'account-center', data: { action: 'deleteGame', token: this.token, gameId: gameId } });
					if (res.result.code === 200) {
						uni.showToast({ title: '删除成功', icon: 'success' });
						await this.fetchGames();
					} else {
						uni.showToast({ title: res.result.message || '删除失败', icon: 'none', duration: 3000 });
					}
				} catch (e) {
					uni.showToast({ title: '请求异常', icon: 'error' });
				} finally {
					uni.hideLoading();
				}
			}
		}
	};
</script>

<style scoped>
	.game-management-container { padding: 20rpx; background-color: #f8f9fa; min-height: 100vh; }
	.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; padding: 20rpx; background-color: #fff; border-radius: 12rpx; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.05); }
	.page-title { font-size: 36rpx; font-weight: bold; }
	.game-list { height: calc(100vh - 160rpx); }
	.game-card { background-color: #fff; padding: 25rpx; border-radius: 10rpx; margin-bottom: 20rpx; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1rpx 5rpx rgba(0,0,0,0.03); }
	.game-info { flex: 1; margin-right: 20rpx; }
	.game-name { font-size: 32rpx; font-weight: bold; display: block; color: #333; }
	.game-desc { font-size: 26rpx; color: #666; display: block; margin-top: 10rpx; }
	.game-actions { display: flex; }
	.game-actions button { margin-left: 20rpx; }
	.modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 999; }
	.modal-content { width: 85%; background-color: #fff; padding: 40rpx; border-radius: 20rpx; box-shadow: 0 5rpx 15rpx rgba(0,0,0,0.1); }
	.modal-title { font-size: 36rpx; font-weight: bold; text-align: center; display: block; margin-bottom: 40rpx; }
	.modal-input, .modal-textarea { width: 100%; box-sizing: border-box; border: 1px solid #e0e0e0; border-radius: 10rpx; padding: 20rpx; margin-bottom: 25rpx; font-size: 28rpx; }
	.modal-textarea { height: 160rpx; }
	.modal-actions { display: flex; justify-content: space-between; margin-top: 20rpx; }
	.modal-btn { flex: 1; margin: 0 10rpx; }
	.modal-btn.primary { background-color: #007aff; color: #fff; }
	.loading-text, .empty-text { text-align: center; color: #999; margin-top: 150rpx; font-size: 28rpx; }
</style>