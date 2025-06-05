<template>
  <view class="change-password-container">
    <view class="form-title">修改您的密码</view>
    <form @submit.prevent="handleChangePassword">
      <view class="form-item">
        <input
          type="password"
          v-model="currentPassword"
          placeholder="请输入当前密码"
          class="input-field"
        />
      </view>
      <view class="form-item">
        <input
          type="password"
          v-model="newPassword"
          placeholder="请输入新密码 (至少6位)"
          class="input-field"
        />
      </view>
      <view class="form-item">
        <input
          type="password"
          v-model="confirmNewPassword"
          placeholder="请再次输入新密码"
          class="input-field"
        />
      </view>

      <view v-if="errorMsg" class="error-message">{{ errorMsg }}</view>
      <view v-if="successMsg" class="success-message">{{ successMsg }}</view>

      <button
        type="primary"
        class="submit-button"
        @click="handleChangePassword" 
        :loading="loading"
        :disabled="loading"
      >
        确认修改
      </button>
    </form>
  </view>
</template>

<script>
import { mapState, mapActions } from 'vuex';

export default {
  data() {
    return {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
      loading: false,
      errorMsg: '',
      successMsg: '',
    };
  },
  computed: {
    // 确保 'user' 是您 Vuex store 中用户模块的命名空间
    ...mapState('user', ['token']),
  },
  onLoad() {
     if (!this.token) { // 检查token是否存在
      uni.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 1500,
      });
      setTimeout(() => {
        // 通常，如果store中没有token，代表未登录或登录状态已清除
        // logout action通常会处理跳转逻辑
        this.$store.dispatch('user/logout'); 
      }, 1500);
    }
  },
  methods: {
    // 确保 'user' 模块下有 logout action
    ...mapActions('user', ['logout']),
    async handleChangePassword() {
      this.errorMsg = '';
      this.successMsg = '';

      if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
        this.errorMsg = '所有密码字段均不能为空。';
        uni.showToast({ title: this.errorMsg, icon: 'none' });
        return;
      }
      if (this.newPassword.length < 6) {
        this.errorMsg = '新密码长度不能少于6位。';
        uni.showToast({ title: this.errorMsg, icon: 'none' });
        return;
      }
      if (this.newPassword !== this.confirmNewPassword) {
        this.errorMsg = '两次输入的新密码不一致。';
        uni.showToast({ title: this.errorMsg, icon: 'none' });
        return;
      }
      if (this.currentPassword === this.newPassword) {
        this.errorMsg = '新密码不能与当前密码相同。';
        uni.showToast({ title: this.errorMsg, icon: 'none' });
        return;
      }

      this.loading = true;
      uni.showLoading({ title: '提交中...' });

      try {
        // *** 使用 uni.cloud.callFunction ***
        const res = await uni.cloud.callFunction({
          name: 'account-center',
          data: {
            action: 'changePassword',
            token: this.token,
            currentPassword: this.currentPassword,
            newPassword: this.newPassword,
          },
        });
        uni.hideLoading();
        if (res.result && res.result.code === 200) {
          this.successMsg = '密码修改成功！建议您重新登录。';
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmNewPassword = '';
          uni.showModal({
            title: '成功',
            content: '密码已成功修改，请重新登录。',
            showCancel: false,
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.logout(); // 调用 Vuex 的 logout action，它应处理清除本地存储和跳转
              }
            }
          });

        } else {
          this.errorMsg = res.result.message || '密码修改失败，请重试。';
          uni.showToast({ title: this.errorMsg, icon: 'none', duration: 3000 });
        }
      } catch (e) {
        uni.hideLoading();
        this.errorMsg = e.message || '请求失败，请检查网络连接。';
        uni.showToast({ title: this.errorMsg, icon: 'none', duration: 3000 });
        console.error("handleChangePassword error:", e);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.change-password-container {
  padding: 30px 20px;
  background-color: #f4f4f4;
  min-height: 100vh;
  box-sizing: border-box;
}
.form-title {
  font-size: 22px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 25px;
  color: #333;
}
.form-item {
  margin-bottom: 18px;
}
.input-field {
  width: 100%;
  height: 48px;
  padding: 0 15px;
  box-sizing: border-box;
  font-size: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #fff;
}
.input-field:focus {
   border-color: #007AFF; /* $uni-color-primary */
   box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}
.error-message, .success-message {
  font-size: 13px;
  text-align: center;
  margin-bottom: 15px;
  padding: 12px 15px;
  border-radius: 6px;
  line-height: 1.4;
}
.error-message {
  color: #D81B60;
  background-color: #FFCDD2;
  border: 1px solid #EF9A9A;
}
.success-message {
  color: #00796B;
  background-color: #C8E6C9;
  border: 1px solid #A5D6A7;
}
.submit-button {
  width: 100%;
  height: 48px;
  line-height: 48px;
  font-size: 17px;
  margin-top: 20px;
  border-radius: 24px;
  background-color: #007AFF; /* $uni-color-primary */
  color: white;
  transition: background-color 0.2s ease;
}
.submit-button:active {
  background-color: #005bb5;
}
.submit-button[disabled] {
  background-color: #cccccc;
  color: #888888;
  opacity: 0.7;
}
</style>