<template>
	<view>
		登录页面
	</view>
</template>

<script>
	export default {
		data() {
			return {
				title: 'Hello'
			}
		},
		onLoad() {
			wx.cloud.callFunction({
				name: 'abc'
			}).then(res => {
				console.log('res', res)
			})
		},
		methods: {

		}
	}
</script>
<style>

</style>