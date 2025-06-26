export function formatDate(dateString) {
	if (!dateString) return 'N/A';
	const date = new Date(dateString);
	const year = date.getFullYear();
	const month = ('0' + (date.getMonth() + 1)).slice(-2);
	const day = ('0' + date.getDate()).slice(-2);
	const hours = ('0' + date.getHours()).slice(-2);
	const minutes = ('0' + date.getMinutes()).slice(-2);
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatOrderStatus(status) {
	const statusMap = {
		pending: '待处理',
		timing: '计时中',
		ready_to_send: '待发货',
		completed: '已完成',
		cancelled: '已取消'
	};
	return statusMap[status] || '未知状态';
}

export function formatOrderType(type) {
	if (type === 'cdk') return 'CDK激活码';
	if (type === 'gift') return '皮肤赠送';
	return '未知类型';
}