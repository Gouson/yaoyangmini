'use strict';
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command; // 用于查询条件
const $ = db.command.aggregate; // 用于聚合操作符

// 辅助函数：记录订单操作日志
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
  const authRes = await cloud.callFunction({
    name: 'account-center',
    data: {
      action: 'checkAuth',
      token: event.token
    }
  });

  if (authRes.result.code !== 200) return authRes.result;
  const userInfo = authRes.result.data;

  const {
    action,
    orderInput,
    orderId,
    statusFilter,
    typeFilter,
    page,
    pageSize,
    screenshots,
    dateString
  } = event;

  switch (action) {
    case 'createOrder': {
      if (userInfo.role !== 'cs') return {
        code: 403,
        message: '仅客服可创建订单'
      };
      if (!orderInput || !orderInput.orderNumber || !orderInput.buyerGameId || !orderInput.orderType || !orderInput.screenshots || !orderInput.screenshots.orderContentFileId || !orderInput.screenshots.buyerIdPageFileId) {
        return {
          code: 400,
          message: '订单参数不完整'
        };
      }
      if (!['cdk', 'gift'].includes(orderInput.orderType)) return {
        code: 400,
        message: '无效订单类型'
      };

      let assignedSupplierId = null;
      if (orderInput.assignedSupplierId) {
        try {
          const supplierCheck = await db.collection('users')
            .where({
              _id: orderInput.assignedSupplierId,
              role: 'supplier',
              status: 1
            })
            .count();
          if (supplierCheck.total === 1) {
            assignedSupplierId = orderInput.assignedSupplierId;
          } else {
            return {
              code: 400,
              message: '指定的供货商无效或已被禁用'
            };
          }
        } catch (e) {
          console.error("校验供货商ID失败:", e);
          return {
            code: 500,
            message: '校验供货商信息时出错'
          };
        }
      }

      try {
        const newOrderData = {
          orderNumber: orderInput.orderNumber,
          buyerGameId: orderInput.buyerGameId,
          orderType: orderInput.orderType,
          status: 'pending',
          screenshots: {
            orderContentFileId: orderInput.screenshots.orderContentFileId,
            buyerIdPageFileId: orderInput.screenshots.buyerIdPageFileId,
            completionProofFileId: null
          },
          remarks: orderInput.remarks || '',
          csId: userInfo._id,
          supplierId: assignedSupplierId,
          createTime: new Date(),
          updateTime: new Date(),
          startTime: null,
          expireTime: null,
          completeTime: null
        };
        const addResult = await db.collection('orders').add({
          data: newOrderData
        });
        await addOrderLog(addResult._id, userInfo._id, userInfo.role, 'CREATE_ORDER',
          `客服 ${userInfo.nickname || userInfo.username} 创建订单 #${orderInput.orderNumber}${assignedSupplierId ? ', 指派给供货商ID:'+assignedSupplierId : ''}`
        );
        return {
          code: 200,
          message: '订单创建成功',
          orderId: addResult._id
        };
      } catch (e) {
        console.error('创建订单数据库操作失败:', e);
        return {
          code: 500,
          message: '订单创建失败，请重试'
        };
      }
    }

    case 'viewOrders': {
      const p = parseInt(page) || 1;
      const ps = parseInt(pageSize) || 10;
      const skip = (p - 1) * ps;

      let baseQuery = {};
      if (statusFilter) baseQuery.status = statusFilter;
      if (typeFilter) baseQuery.orderType = typeFilter;

      console.log(`[viewOrders] Called by User Role: ${userInfo.role}, User _id: ${userInfo._id}`);
      console.log(`[viewOrders] Received event data:`, JSON.stringify(event));
      console.log(`[viewOrders] Initial baseQuery from filters:`, JSON.stringify(baseQuery));

      let finalDbQuery = {};

      if (userInfo.role === 'cs') {
        finalDbQuery = { ...baseQuery, csId: userInfo._id };
      } else if (userInfo.role === 'supplier') {
        const conditionPending = { status: 'pending' };
        const conditionAssignedAndProcessing = {
          supplierId: userInfo._id,
          status: _.in(['timing', 'ready_to_send'])
        };
        const orConditions = _.or([conditionPending, conditionAssignedAndProcessing]);
        if (Object.keys(baseQuery).length === 0) {
          finalDbQuery = orConditions;
        } else {
          finalDbQuery = _.and([baseQuery, orConditions]);
        }
      } else if (userInfo.role === 'admin') {
        finalDbQuery = { ...baseQuery };
      } else {
        console.log('[viewOrders] Permission denied for role:', userInfo.role);
        return { code: 403, message: '无权查看订单列表' };
      }
      console.log(`[viewOrders] Constructed FINAL DB Query (for match stage):`, JSON.stringify(finalDbQuery, null, 2));

      try {
        const aggregateResult = await db.collection('orders')
          .aggregate()
          .match(finalDbQuery)
          .sort({ createTime: -1 })
          .skip(skip)
          .limit(ps)
          .lookup({
            from: 'users',
            localField: 'csId',
            foreignField: '_id',
            as: 'csInfoArray',
          })
          .lookup({
            from: 'users',
            localField: 'supplierId',
            foreignField: '_id',
            as: 'supplierInfoArray',
          })
          .project({
            _id: 1,
            orderNumber: 1,
            buyerGameId: 1,
            orderType: 1,
            status: 1,
            screenshots: 1,
            remarks: 1,
            csId: 1,
            supplierId: 1,
            createTime: 1,
            updateTime: 1,
            startTime: 1,
            expireTime: 1,
            completeTime: 1,
            csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
            supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
          })
          .end();

        const ordersWithNicknames = aggregateResult.list.map(order => ({
          ...order,
          csNickname: order.csNickname || (order.csId ? '未知客服' : 'N/A'),
          supplierNickname: order.supplierNickname || (order.supplierId ? '未知供货商' : '未分配')
        }));
        
        console.log(`[viewOrders] DB Query returned ${ordersWithNicknames.length} orders.`);
        if (ordersWithNicknames.length > 0) {
          console.log(`[viewOrders] First order sample (if any):`, JSON.stringify(ordersWithNicknames[0]));
        }

        const totalRes = await db.collection('orders').where(finalDbQuery).count();
        
        return {
          code: 200,
          message: '查询成功',
          data: ordersWithNicknames,
          total: totalRes.total,
          page: p,
          pageSize: ps
        };
      } catch (e) {
        console.error('[viewOrders] Database query or aggregation failed:', e);
        return { code: 500, message: '查询订单列表失败 (数据库错误)' };
      }
    }

    case 'viewOrderDetails': { 
      if (!orderId) return { code: 400, message: '缺少订单ID' };
      try {
        const aggregateResult = await db.collection('orders')
          .aggregate()
          .match({ _id: orderId }) 
          .lookup({
            from: 'users',
            localField: 'csId',
            foreignField: '_id',
            as: 'csInfoArray',
          })
          .lookup({
            from: 'users',
            localField: 'supplierId',
            foreignField: '_id',
            as: 'supplierInfoArray',
          })
          .project({ 
            _id: 1,
            orderNumber: 1,
            buyerGameId: 1,
            orderType: 1,
            status: 1,
            screenshots: 1,
            remarks: 1,
            csId: 1,
            supplierId: 1,
            createTime: 1,
            updateTime: 1,
            startTime: 1,
            expireTime: 1,
            completeTime: 1,
            csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
            supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
          })
          .end();

        if (!aggregateResult.list || aggregateResult.list.length === 0) {
          return { code: 404, message: '订单不存在' };
        }

        let orderDetail = aggregateResult.list[0];
        orderDetail.csNickname = orderDetail.csNickname || (orderDetail.csId ? '未知客服' : 'N/A');
        orderDetail.supplierNickname = orderDetail.supplierNickname || (orderDetail.supplierId ? '未知供货商' : '未分配');

        if (userInfo.role === 'cs' && orderDetail.csId !== userInfo._id) {
          return { code: 403, message: '无权查看此订单(非您创建)' };
        }
        if (userInfo.role === 'supplier') {
             if (orderDetail.status !== 'pending' && orderDetail.supplierId !== userInfo._id) {
                return { code: 403, message: '无权查看此订单(非待处理或非您处理)' };
             }
        }
        
        return { code: 200, message: '查询成功', data: orderDetail };
      } catch (e) {
        console.error('查询订单详情数据库操作或聚合失败:', e);
        return { code: 500, message: '查询订单详情失败' };
      }
    }

    case 'processCdkOrder': {
      if (userInfo.role !== 'supplier') return { code: 403, message: '仅供货商可操作' };
      if (!orderId || !screenshots || !screenshots.completionProofFileId) return { code: 400, message: '订单ID和完成截图不能为空' };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return { code: 404, message: '订单不存在' };
      if (order.orderType !== 'cdk') return { code: 400, message: '非CDK订单' };
      if (order.status !== 'pending') return { code: 400, message: `订单当前状态[${order.status}]不可操作` };

      try {
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            supplierId: userInfo._id, 
            'screenshots.completionProofFileId': screenshots.completionProofFileId,
            completeTime: new Date(),
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_CDK_ORDER', `供货商 ${userInfo.nickname || userInfo.username} 完成CDK订单 #${order.orderNumber}`);
        return { code: 200, message: 'CDK订单处理成功' };
      } catch (e) {
        console.error('处理CDK订单数据库操作失败:', e);
        return { code: 500, message: '处理CDK订单失败' };
      }
    }

    case 'startGiftOrderTimer': {
      if (userInfo.role !== 'supplier') return { code: 403, message: '仅供货商可操作' };
      if (!orderId) return { code: 400, message: '缺少订单ID' };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return { code: 404, message: '订单不存在' };
      if (order.orderType !== 'gift') return { code: 400, message: '非皮肤赠送订单' };
      if (order.status !== 'pending') return { code: 400, message: `订单当前状态[${order.status}]不可操作` };

      try {
        const startTime = new Date();
        const expireTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000); 
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'timing',
            supplierId: userInfo._id, 
            startTime,
            expireTime,
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'START_GIFT_TIMER', `供货商 ${userInfo.nickname || userInfo.username} 开始赠送计时 订单 #${order.orderNumber}`);
        return { code: 200, message: '已开始计时' };
      } catch (e) {
        console.error('开始赠送计时数据库操作失败:', e);
        return { code: 500, message: '开始计时失败' };
      }
    }

    case 'completeGiftOrder': {
      if (userInfo.role !== 'supplier') return { code: 403, message: '仅供货商可操作' };
      if (!orderId || !screenshots || !screenshots.completionProofFileId) return { code: 400, message: '订单ID和完成截图不能为空' };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return { code: 404, message: '订单不存在' };
      if (order.orderType !== 'gift') return { code: 400, message: '非皮肤赠送订单' };
      if (!['timing', 'ready_to_send'].includes(order.status)) return { code: 400, message: `订单当前状态[${order.status}]不可操作` };
      if (order.supplierId !== userInfo._id) return { code: 403, message: '此订单并非由您负责计时' };
      
      try {
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            'screenshots.completionProofFileId': screenshots.completionProofFileId,
            completeTime: new Date(),
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_GIFT_ORDER', `供货商 ${userInfo.nickname || userInfo.username} 完成皮肤赠送 订单 #${order.orderNumber}`);
        return { code: 200, message: '皮肤赠送订单处理成功' };
      } catch (e) {
        console.error('完成赠送数据库操作失败:', e);
        return { code: 500, message: '完成赠送失败' };
      }
    }
    case 'getDailyOrderStats': {
      if (userInfo.role !== 'admin') {
        return { code: 403, message: '无权操作：仅管理员可查看统计' };
      }
      if (!dateString) {
        return { code: 400, message: '缺少日期参数' };
      }

      try {
        const startDate = new Date(dateString + "T00:00:00.000Z");
        const endDate = new Date(dateString + "T23:59:59.999Z");

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return { code: 400, message: '日期格式无效' };
        }

        console.log(`[getDailyOrderStats] Fetching orders for date: ${dateString}, UTC Start: ${startDate.toISOString()}, UTC End: ${endDate.toISOString()}`);

        // 【修改】使用聚合查询来包含昵称
        const aggregateResult = await db.collection('orders')
          .aggregate()
          .match({ // 筛选当日订单
            createTime: _.gte(startDate).and(_.lte(endDate))
          })
          .sort({ createTime: -1 }) // 按创建时间降序
          .lookup({ // 关联客服信息
            from: 'users',
            localField: 'csId',
            foreignField: '_id',
            as: 'csInfoArray',
          })
          .lookup({ // 关联供货商信息
            from: 'users',
            localField: 'supplierId',
            foreignField: '_id',
            as: 'supplierInfoArray',
          })
          .project({ // 选择并重塑输出字段
            _id: 1,
            orderNumber: 1,
            buyerGameId: 1,
            orderType: 1,
            status: 1,
            screenshots: 1, // 统计页面列表可能不需要截图详情，可以考虑移除
            remarks: 1,
            csId: 1,
            supplierId: 1,
            createTime: 1,
            updateTime: 1,
            startTime: 1,
            expireTime: 1,
            completeTime: 1,
            csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
            supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
          })
          .end();

        const ordersWithNicknames = aggregateResult.list.map(order => ({
          ...order,
          csNickname: order.csNickname || (order.csId ? '未知客服' : 'N/A'),
          supplierNickname: order.supplierNickname || (order.supplierId ? '未知供货商' : '未分配')
        }));

        // 计算统计数据 (基于原始订单数据或处理后的数据均可，这里用处理后的)
        const stats = {
          totalOrders: ordersWithNicknames.length,
          cdkCount: ordersWithNicknames.filter(o => o.orderType === 'cdk').length,
          giftCount: ordersWithNicknames.filter(o => o.orderType === 'gift').length,
          pendingCount: ordersWithNicknames.filter(o => o.status === 'pending').length,
          timingCount: ordersWithNicknames.filter(o => o.status === 'timing').length,
          readyToSendCount: ordersWithNicknames.filter(o => o.status === 'ready_to_send').length,
          completedCount: ordersWithNicknames.filter(o => o.status === 'completed').length,
        };

        return {
          code: 200,
          message: '获取成功',
          data: ordersWithNicknames, // 返回包含昵称的订单列表
          stats: stats
        };
      } catch (e) {
        console.error('[getDailyOrderStats] 查询每日订单统计失败:', e);
        return { code: 500, message: '查询每日订单统计失败 (数据库错误)' };
      }
    }
    default:
      return { code: 404, message: '未知的 action' };
  }
};