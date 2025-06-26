'use strict';
const cloud = require('wx-server-sdk');
cloud.init({
	env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

/**
 * 记录订单操作日志的辅助函数
 */
async function addOrderLog(orderId, operatorId, operatorRole, action, details = '') {
	try {
		await db.collection('orderLogs').add({
			data: {
				orderId,
				operatorId,
				operatorRole,
				action,
				details,
				timestamp: new Date()
			}
		});
		console.log(`订单日志记录成功: ${orderId}, Action: ${action}`);
	} catch (logError) {
		console.error(`记录订单日志失败 for order ${orderId}:`, logError);
	}
}

exports.main = async (event, context) => {
	const {
		action,
		orderInput,
		orderId,
		statusFilter,
		typeFilter,
		page,
		pageSize,
		screenshots,
		dateString,
		costPrice,
		game_id
	} = event;

	const authRes = await cloud.callFunction({
		name: 'account-center',
		data: {
			action: 'checkAuth',
			token: event.token
		}
	});

	if (authRes.result.code !== 200) {
		return authRes.result;
	}
	const userInfo = authRes.result.data;

	switch (action) {
		case 'createOrder':
			{
				if (!['admin', 'cs'].includes(userInfo.role)) return { code: 403, message: '仅管理员和客服可创建订单' };
				let gameIdForOrder;
				if (userInfo.role === 'cs') {
					if (!userInfo.game_id) return { code: 403, message: '您未被分配到任何游戏，无法创建订单' };
					gameIdForOrder = userInfo.game_id;
				} else {
					if (!orderInput.game_id) return { code: 400, message: '管理员创建订单时必须指定游戏' };
					gameIdForOrder = orderInput.game_id;
				}
				if (!orderInput || !orderInput.orderNumber || !orderInput.buyerGameId || !orderInput.orderType || !orderInput.screenshots || !orderInput.screenshots.orderContentFileId || !orderInput.screenshots.buyerIdPageFileId) {
					return { code: 400, message: '订单参数不完整' };
				}
				let assignedSupplierId = null;
				if (orderInput.assignedSupplierId) {
					const supplierCheck = await db.collection('users').where({ _id: orderInput.assignedSupplierId, role: 'supplier', status: 1, game_id: gameIdForOrder }).count();
					if (supplierCheck.total !== 1) return { code: 400, message: '指定的供货商无效或不属于该游戏' };
					assignedSupplierId = orderInput.assignedSupplierId;
				}
				try {
					const newOrderData = {
						orderNumber: orderInput.orderNumber,
						buyerGameId: orderInput.buyerGameId,
						orderType: orderInput.orderType,
						status: 'pending',
						game_id: gameIdForOrder,
						screenshots: { orderContentFileId: orderInput.screenshots.orderContentFileId, buyerIdPageFileId: orderInput.screenshots.buyerIdPageFileId, completionProofFileId: null },
						remarks: orderInput.remarks || '',
						csId: userInfo._id,
						supplierId: assignedSupplierId,
						createTime: new Date(),
						updateTime: new Date(),
						startTime: null,
						expireTime: null,
						completeTime: null,
						costPrice: null
					};
					const addResult = await db.collection('orders').add({ data: newOrderData });
					await addOrderLog(addResult._id, userInfo._id, userInfo.role, 'CREATE_ORDER', `${userInfo.role} ${userInfo.nickname || userInfo.username} 创建订单 #${orderInput.orderNumber}`);
					return { code: 200, message: '订单创建成功', orderId: addResult._id };
				} catch (e) {
					return { code: 500, message: '订单创建失败' };
				}
			}

		case 'viewOrders':
			{
				const p = parseInt(page) || 1;
				const ps = parseInt(pageSize) || 10;
				const skip = (p - 1) * ps;
				let baseQuery = {};
				if (statusFilter) baseQuery.status = statusFilter;
				if (typeFilter) baseQuery.orderType = typeFilter;
				let finalDbQuery;

				if (userInfo.role === 'admin') {
					if (game_id) baseQuery.game_id = game_id;
					finalDbQuery = { ...baseQuery };
				} else if (userInfo.role === 'cs') {
					if (!userInfo.game_id) return { code: 200, data: [], total: 0 };
					finalDbQuery = { ...baseQuery, csId: userInfo._id, game_id: userInfo.game_id };
				} else if (userInfo.role === 'supplier') {
					if (!userInfo.game_id) return { code: 200, data: [], total: 0 };
					const assignedToMe = { supplierId: userInfo._id };
					const unassignedPending = { status: 'pending', supplierId: _.or(_.eq(null), _.exists(false)) };
					const visibilityConditions = _.or([assignedToMe, unassignedPending]);
					const gameCondition = { game_id: userInfo.game_id };
					finalDbQuery = _.and([ baseQuery, gameCondition, visibilityConditions ]);
				} else {
					return { code: 403, message: '无权查看' };
				}

				try {
					const { list } = await db.collection('orders').aggregate().match(finalDbQuery).sort({ updateTime: -1 }).skip(skip).limit(ps)
						.lookup({ from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfo' })
						.lookup({ from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfo' })
						.lookup({ from: 'games', localField: 'game_id', foreignField: '_id', as: 'gameInfo' })
                        .addFields({
                            csNickname: $.arrayElemAt(['$csInfo.nickname', 0]),
                            supplierNickname: $.arrayElemAt(['$supplierInfo.nickname', 0]),
                            gameName: $.arrayElemAt(['$gameInfo.name', 0]),
                        })
						.project({ csInfo: 0, supplierInfo: 0, gameInfo: 0 }).end();

					const totalRes = await db.collection('orders').where(finalDbQuery).count();
					return { code: 200, message: '查询成功', data: list, total: totalRes.total };
				} catch (e) {
					return { code: 500, message: '查询失败: ' + e.message };
				}
			}

		case 'viewOrderDetails':
			{
				if (!orderId) return { code: 400, message: '缺少订单ID' };
				
				// [核心修正]: 使用更稳健的聚合查询获取详情
				const { list } = await db.collection('orders').aggregate().match({ _id: orderId })
					.lookup({ from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfo' })
					.lookup({ from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfo' })
					.lookup({ from: 'games', localField: 'game_id', foreignField: '_id', as: 'gameInfo' })
					.addFields({
						csNickname: $.arrayElemAt(['$csInfo.nickname', 0]),
						supplierNickname: $.arrayElemAt(['$supplierInfo.nickname', 0]),
						gameName: $.arrayElemAt(['$gameInfo.name', 0]),
					})
					.project({
						csInfo: 0,
						supplierInfo: 0,
						gameInfo: 0
					})
					.end();

				if (!list || list.length === 0) {
					return { code: 404, message: '订单不存在' };
				}
				let orderDetail = list[0];
				
				// 权限检查
				if (userInfo.role !== 'admin') {
					if (userInfo.role === 'cs' && (orderDetail.csId !== userInfo._id || orderDetail.game_id !== userInfo.game_id)) {
						return { code: 403, message: '无权查看此订单' };
					}
					if (userInfo.role === 'supplier') {
						if(orderDetail.game_id !== userInfo.game_id) return { code: 403, message: '无权查看此订单' };
						const isAssignedToMe = orderDetail.supplierId === userInfo._id;
						const isUnassignedPending = orderDetail.status === 'pending' && !orderDetail.supplierId;
						if (!isAssignedToMe && !isUnassignedPending) {
							return { code: 403, message: '无权查看此订单' };
						}
					}
				}
				
				return { code: 200, message: '查询成功', data: orderDetail };
			}
			
		case 'processCdkOrder':
		case 'startGiftOrderTimer':
		case 'completeGiftOrder': {
			if (!['admin', 'supplier'].includes(userInfo.role)) return { code: 403, message: '仅管理员或供货商可操作' };
			if (!orderId) return { code: 400, message: '缺少订单ID' };
			const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
			if (!order) return { code: 404, message: '订单不存在' };
			if (userInfo.role === 'supplier' && order.game_id !== userInfo.game_id) return { code: 403, message: '无权操作不属于您的游戏订单' };
			let updateData = {};
			let logDetails = '';
			const operatorInfo = `${userInfo.role} ${userInfo.nickname || userInfo.username}`;
			const now = new Date();

			if (action === 'startGiftOrderTimer') {
				if(order.status !== 'pending') return { code: 400, message: '订单状态不正确，无法开始计时'};
				updateData = { status: 'timing', supplierId: order.supplierId || userInfo._id, startTime: now, expireTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), updateTime: now };
				logDetails = `${operatorInfo} 接单并开始赠送计时`;
			} else {
				if (!screenshots || !screenshots.completionProofFileId) return { code: 400, message: '缺少完成截图' };
				if (action === 'processCdkOrder' && order.status !== 'pending') return { code: 400, message: '订单状态不正确，无法发货'};
				if (action === 'completeGiftOrder' && !['timing', 'ready_to_send'].includes(order.status)) return { code: 400, message: '订单状态不正确，无法完成赠送'};
				
				updateData = { status: 'completed', 'screenshots.completionProofFileId': screenshots.completionProofFileId, completeTime: now, updateTime: now };
				if (action === 'processCdkOrder') updateData.supplierId = order.supplierId || userInfo._id;
				if(costPrice !== undefined && costPrice !== null) updateData.costPrice = costPrice;
				logDetails = action === 'processCdkOrder' ? `${operatorInfo} 完成CDK订单` : `${operatorInfo} 完成皮肤赠送`;
			}

			try {
				await db.collection('orders').doc(orderId).update({ data: updateData });
				await addOrderLog(orderId, userInfo._id, userInfo.role, action.toUpperCase(), logDetails);
				return { code: 200, message: '操作成功' };
			} catch (e) {
				return { code: 500, message: '数据库更新失败' };
			}
		}
		
		case 'getDailyOrderStats': {
			if (userInfo.role !== 'admin') return { code: 403, message: '无权操作' };
			if (!dateString) return { code: 400, message: '缺少日期参数' };
			try {
				const startDate = new Date(dateString + "T00:00:00.000Z");
				const endDate = new Date(dateString + "T23:59:59.999Z");
				if (isNaN(startDate.getTime())) return { code: 400, message: '日期格式无效' };
				const {list: dailyOrdersData} = await db.collection('orders').aggregate().match({ createTime: _.gte(startDate).and(_.lte(endDate))})
					.lookup({ from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfo' })
					.lookup({ from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfo' })
					.project({ 
						csNickname: $.arrayElemAt(['$csInfo.nickname', 0]),
						supplierNickname: $.arrayElemAt(['$supplierInfo.nickname', 0]),
						orderNumber: 1, costPrice: 1, orderType: 1, status: 1, csId: 1, supplierId: 1, createTime: 1
					}).end();
				
				const totalOrders = dailyOrdersData.length;
				let cdkCount = 0, giftCount = 0, pendingCount = 0, timingCount = 0, readyToSendCount = 0, completedCount = 0, totalCost = 0;
				const csPerformance = {}, supplierPerformance = {};

				dailyOrdersData.forEach(order => {
					if (order.orderType === 'cdk') cdkCount++; else if (order.orderType === 'gift') giftCount++;
					if (order.status === 'pending') pendingCount++; else if (order.status === 'timing') timingCount++; else if (order.status === 'ready_to_send') readyToSendCount++; else if (order.status === 'completed') completedCount++;
					if (typeof order.costPrice === 'number') totalCost += order.costPrice;
					if (order.csId) {
						if (!csPerformance[order.csId]) csPerformance[order.csId] = { nickname: order.csNickname || '未知', count: 0 };
						csPerformance[order.csId].count++;
					}
					if (order.supplierId) {
						if (!supplierPerformance[order.supplierId]) supplierPerformance[order.supplierId] = { nickname: order.supplierNickname || '未知', count: 0, totalCost: 0 };
						supplierPerformance[order.supplierId].count++;
						if (typeof order.costPrice === 'number') supplierPerformance[order.supplierId].totalCost += order.costPrice;
					}
				});
				const stats = {
					totalOrders, cdkCount, giftCount, pendingCount, timingCount, readyToSendCount, completedCount, totalCost,
					typeDistribution: { cdk: totalOrders > 0 ? (cdkCount / totalOrders) * 100 : 0, gift: totalOrders > 0 ? (giftCount / totalOrders) * 100 : 0 },
					csPerformance: Object.values(csPerformance).sort((a, b) => b.count - a.count),
					supplierPerformance: Object.values(supplierPerformance).sort((a, b) => b.count - a.count)
				};
				return { code: 200, message: '获取成功', data: dailyOrdersData, stats };
			} catch (e) {
				return { code: 500, message: '查询每日订单统计失败' };
			}
		}

		default:
			return { code: 404, message: '未知的 action' };
	}
};