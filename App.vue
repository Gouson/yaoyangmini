<script>
	export default {
		onLaunch: function() {
			wx.cloud.init({
				env: 'cloud1-8grelvba9540d4e3',
				traceUser: true,
			})
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/*每个页面公共css */
</style>
