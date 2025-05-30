'use strict';
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;

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
      // 校验核心参数
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

      // 【新增】校验指定的 supplierId (如果提供了)
      let assignedSupplierId = null;
      if (orderInput.assignedSupplierId) { // 前端将通过 orderInput.assignedSupplierId 传递
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
          supplierId: assignedSupplierId, // 【修改】保存指派的供货商ID
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
        finalDbQuery = {
          ...baseQuery,
          csId: userInfo._id
        };
      } else if (userInfo.role === 'supplier') {
        console.log(`[viewOrders] Processing for SUPPLIER. UserInfo _id: ${userInfo._id}`);

        // 条件1: 订单状态是 'pending' (所有供货商可见)
        const conditionPending = {
          status: 'pending'
        };

        // 条件2: 订单已分配给当前供货商，并且状态是 'timing' 或 'ready_to_send'
        const conditionAssignedAndProcessing = {
          supplierId: userInfo._id,
          status: _.in(['timing', 'ready_to_send'])
        };

        // 构建 OR 条件
        const orConditions = _.or([conditionPending, conditionAssignedAndProcessing]);

        // 如果 baseQuery (来自前端的通用过滤器如 typeFilter) 为空，则 finalDbQuery 就是 orConditions
        // 如果 baseQuery 不为空，则 finalDbQuery 是 baseQuery 和 orConditions 的 AND 组合
        if (Object.keys(baseQuery).length === 0) {
          finalDbQuery = orConditions; // 直接使用 OR 条件作为查询主体
        } else {
          // 例如，如果 baseQuery 是 { orderType: 'gift' }
          // 最终查询会是： orderType === 'gift' AND ( (status === 'pending') OR (assignedToMe & processing) )
          finalDbQuery = _.and([baseQuery, orConditions]);
        }

      } else if (userInfo.role === 'admin') {
        finalDbQuery = {
          ...baseQuery
        };
      } else {
        console.log('[viewOrders] Permission denied for role:', userInfo.role);
        return {
          code: 403,
          message: '无权查看订单列表'
        };
      }

      console.log(`[viewOrders] Constructed FINAL DB Query (before sending to DB):`, JSON.stringify(finalDbQuery, null, 2)); // 格式化输出，更易读

      try {
        const ordersRes = await db.collection('orders')
          .where(finalDbQuery) // 将构建好的查询对象传递给 where
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(ps)
          .get();

        console.log(`[viewOrders] DB Query returned ${ordersRes.data.length} orders.`);
        if (ordersRes.data.length > 0) {
          console.log(`[viewOrders] First order sample (if any):`, JSON.stringify(ordersRes.data[0]));
        }

        const totalRes = await db.collection('orders').where(finalDbQuery).count();
        return {
          code: 200,
          message: '查询成功',
          data: ordersRes.data,
          total: totalRes.total,
          page: p,
          pageSize: ps
        };
      } catch (e) {
        console.error('[viewOrders] Database query failed:', e);
        return {
          code: 500,
          message: '查询订单列表失败 (数据库错误)'
        };
      }
    }
    case 'viewOrderDetails': {
      if (!orderId) return {
        code: 400,
        message: '缺少订单ID'
      };
      try {
        const orderRes = await db.collection('orders').doc(orderId).get();
        if (!orderRes.data) return {
          code: 404,
          message: '订单不存在'
        };
        const orderDetail = orderRes.data;

        if (userInfo.role === 'cs' && orderDetail.csId !== userInfo._id) {
          return {
            code: 403,
            message: '无权查看此订单(非您创建)'
          };
        }
        if (userInfo.role === 'supplier' && orderDetail.status !== 'pending' && orderDetail.supplierId !== userInfo._id) {
          // 供货商可以查看所有pending状态的订单，或者已经分配给自己的其他状态订单
          const isPendingAndUnassigned = orderDetail.status === 'pending' && !orderDetail.supplierId;
          const isAssignedToMe = orderDetail.supplierId === userInfo._id;
          if (!(isPendingAndUnassigned || isAssignedToMe)) {
            return {
              code: 403,
              message: '无权查看此订单(非待处理或非您处理)'
            };
          }
        }
        // 管理员可以查看任何订单
        return {
          code: 200,
          message: '查询成功',
          data: orderDetail
        };
      } catch (e) {
        console.error('查询订单详情数据库操作失败:', e);
        return {
          code: 500,
          message: '查询订单详情失败'
        };
      }
    }

    case 'processCdkOrder': { // 供货商处理CDK订单
      if (userInfo.role !== 'supplier') return {
        code: 403,
        message: '仅供货商可操作'
      };
      if (!orderId || !screenshots || !screenshots.completionProofFileId) return {
        code: 400,
        message: '订单ID和完成截图不能为空'
      };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return {
        code: 404,
        message: '订单不存在'
      };
      if (order.orderType !== 'cdk') return {
        code: 400,
        message: '非CDK订单'
      };
      if (order.status !== 'pending') return {
        code: 400,
        message: `订单当前状态[${order.status}]不可操作`
      };

      try {
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            supplierId: userInfo._id, // 记录处理人
            'screenshots.completionProofFileId': screenshots.completionProofFileId,
            completeTime: new Date(),
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_CDK_ORDER', `供货商 ${userInfo.nickname} 完成CDK订单 #${order.orderNumber}`);
        return {
          code: 200,
          message: 'CDK订单处理成功'
        };
      } catch (e) {
        console.error('处理CDK订单数据库操作失败:', e);
        return {
          code: 500,
          message: '处理CDK订单失败'
        };
      }
    }

    case 'startGiftOrderTimer': { // 供货商开始皮肤赠送计时
      if (userInfo.role !== 'supplier') return {
        code: 403,
        message: '仅供货商可操作'
      };
      if (!orderId) return {
        code: 400,
        message: '缺少订单ID'
      };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return {
        code: 404,
        message: '订单不存在'
      };
      if (order.orderType !== 'gift') return {
        code: 400,
        message: '非皮肤赠送订单'
      };
      if (order.status !== 'pending') return {
        code: 400,
        message: `订单当前状态[${order.status}]不可操作`
      };

      try {
        const startTime = new Date();
        const expireTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'timing',
            supplierId: userInfo._id, // 记录处理人
            startTime,
            expireTime,
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'START_GIFT_TIMER', `供货商 ${userInfo.nickname} 开始赠送计时 订单 #${order.orderNumber}`);
        return {
          code: 200,
          message: '已开始计时'
        };
      } catch (e) {
        console.error('开始赠送计时数据库操作失败:', e);
        return {
          code: 500,
          message: '开始计时失败'
        };
      }
    }

    case 'completeGiftOrder': { // 供货商完成皮肤赠送
      if (userInfo.role !== 'supplier') return {
        code: 403,
        message: '仅供货商可操作'
      };
      if (!orderId || !screenshots || !screenshots.completionProofFileId) return {
        code: 400,
        message: '订单ID和完成截图不能为空'
      };

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return {
        code: 404,
        message: '订单不存在'
      };
      if (order.orderType !== 'gift') return {
        code: 400,
        message: '非皮肤赠送订单'
      };
      if (!['timing', 'ready_to_send'].includes(order.status)) return {
        code: 400,
        message: `订单当前状态[${order.status}]不可操作`
      };
      if (order.supplierId !== userInfo._id) return {
        code: 403,
        message: '此订单并非由您负责计时'
      };
      // 可选：后端严格校验是否已到期
      // if (new Date() < new Date(order.expireTime)) return { code: 400, message: '计时未满24小时' };

      try {
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            'screenshots.completionProofFileId': screenshots.completionProofFileId,
            completeTime: new Date(),
            updateTime: new Date()
          }
        });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_GIFT_ORDER', `供货商 ${userInfo.nickname} 完成皮肤赠送 订单 #${order.orderNumber}`);
        return {
          code: 200,
          message: '皮肤赠送订单处理成功'
        };
      } catch (e) {
        console.error('完成赠送数据库操作失败:', e);
        return {
          code: 500,
          message: '完成赠送失败'
        };
      }
    }
    case 'getDailyOrderStats': {
      if (userInfo.role !== 'admin') {
        return {
          code: 403,
          message: '无权操作：仅管理员可查看统计'
        };
      }
      if (!dateString) { // YYYY-MM-DD 格式
        return {
          code: 400,
          message: '缺少日期参数'
        };
      }

      try {
        // 解析日期并设置当天的开始和结束时间 (UTC 标准)
        // 前端传来的 dateString (如 "2025-05-30") 被视为UTC日期的开始
        const startDate = new Date(dateString + "T00:00:00.000Z");
        const endDate = new Date(dateString + "T23:59:59.999Z");

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return {
            code: 400,
            message: '日期格式无效'
          };
        }

        console.log(`[getDailyOrderStats] Fetching orders for date: ${dateString}, UTC Start: ${startDate.toISOString()}, UTC End: ${endDate.toISOString()}`);

        const dailyOrdersRes = await db.collection('orders')
          .where({
            createTime: _.gte(startDate).and(_.lte(endDate))
          })
          .orderBy('createTime', 'desc')
          .get();

        const orders = dailyOrdersRes.data;

        // 计算统计数据
        const stats = {
          totalOrders: orders.length,
          cdkCount: orders.filter(o => o.orderType === 'cdk').length,
          giftCount: orders.filter(o => o.orderType === 'gift').length,
          pendingCount: orders.filter(o => o.status === 'pending').length,
          timingCount: orders.filter(o => o.status === 'timing').length,
          readyToSendCount: orders.filter(o => o.status === 'ready_to_send').length,
          completedCount: orders.filter(o => o.status === 'completed').length,
        };

        return {
          code: 200,
          message: '获取成功',
          data: orders,
          stats: stats
        };
      } catch (e) {
        console.error('[getDailyOrderStats] 查询每日订单统计失败:', e);
        return {
          code: 500,
          message: '查询每日订单统计失败'
        };
      }
    }
    default:
      return {
        code: 404, message: '未知的 action'
      };
  }
};