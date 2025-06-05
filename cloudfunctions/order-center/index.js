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
    dateString,
    costPrice // 新增：用于接收成本价格
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
          completeTime: null,
          costPrice: null // 新增：初始化成本价格字段
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

  // ... (云函数其他部分代码保持不变) ...

  case 'viewOrders': {
    const p = parseInt(page) || 1;
    const ps = parseInt(pageSize) || 10;
    const skip = (p - 1) * ps;

    let baseQuery = {};
    if (statusFilter) baseQuery.status = statusFilter;
    if (typeFilter) baseQuery.orderType = typeFilter;
    
    let finalDbQuery = {};

    if (userInfo.role === 'cs') {
      finalDbQuery = { ...baseQuery, csId: userInfo._id };
    } else if (userInfo.role === 'supplier') {
      const conditionPending = { status: 'pending' }; 
      const conditionAssignedAndProcessing = { 
        supplierId: userInfo._id,
        status: _.in(['timing', 'ready_to_send', 'completed']) 
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
      return { code: 403, message: '无权查看订单列表' };
    }
    
    // 构建基础投影字段
    let projection = {
      _id: 1, orderNumber: 1, buyerGameId: 1, orderType: 1, status: 1,
      screenshots: 1, remarks: 1, csId: 1, supplierId: 1, createTime: 1,
      updateTime: 1, startTime: 1, expireTime: 1, completeTime: 1,
      csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
      supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
    };

    // 根据角色决定是否包含 costPrice
    if (userInfo.role === 'admin' || userInfo.role === 'supplier') {
      projection.costPrice = 1;
    }

    try {
      const aggregateResult = await db.collection('orders')
        .aggregate()
        .match(finalDbQuery)
        .addFields({
          statusSortOrder: { 
            $cond: { if: { $eq: ['$status', 'completed'] }, then: 1, else: 0 }
          },
          primarySortDate: { 
            $cond: {
              if: { $eq: ['$status', 'completed'] },
              then: '$completeTime', 
              else: '$updateTime'    
            }
          }
        })
        .sort({
          statusSortOrder: 1,  
          primarySortDate: -1  
        })
        .skip(skip)
        .limit(ps)
        .lookup({
          from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfoArray',
        })
        .lookup({
          from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfoArray',
        })
        // *** 修改的部分：直接使用 projection 对象 ***
        // 临时的 statusSortOrder 和 primarySortDate 字段，因为没有在 projection 对象中被指定包含，
        // 所以在执行这个包含式投影后，它们将不会出现在最终结果中。
        .project(projection) 
        .end();

      const ordersWithNicknames = aggregateResult.list.map(order => ({
        ...order,
        csNickname: order.csNickname || (order.csId ? '未知客服' : 'N/A'),
        supplierNickname: order.supplierNickname || (order.supplierId ? '未知供货商' : '未分配')
      }));
      
      const totalRes = await db.collection('orders').where(finalDbQuery).count();
      
      return {
        code: 200, message: '查询成功', data: ordersWithNicknames,
        total: totalRes.total, page: p, pageSize: ps
      };
    } catch (e) {
      console.error('[viewOrders] Database query or aggregation failed:', e); 
      return { code: 500, message: '查询订单列表失败 (数据库错误)' };
    }
  }


    case 'viewOrderDetails': { 
      if (!orderId) return { code: 400, message: '缺少订单ID' };
      
      // 构建投影字段，根据角色决定是否包含 costPrice
      let detailProjection = {
        _id: 1, orderNumber: 1, buyerGameId: 1, orderType: 1, status: 1,
        screenshots: 1, remarks: 1, csId: 1, supplierId: 1, createTime: 1,
        updateTime: 1, startTime: 1, expireTime: 1, completeTime: 1,
        csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
        supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
      };
      if (userInfo.role === 'admin' || userInfo.role === 'supplier') {
        detailProjection.costPrice = 1;
      }

      try {
        const aggregateResult = await db.collection('orders')
          .aggregate()
          .match({ _id: orderId }) 
          .lookup({
            from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfoArray',
          })
          .lookup({
            from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfoArray',
          })
          .project(detailProjection) // 使用构建好的投影
          .end();

        if (!aggregateResult.list || aggregateResult.list.length === 0) {
          return { code: 404, message: '订单不存在' };
        }

        let orderDetail = aggregateResult.list[0];
        orderDetail.csNickname = orderDetail.csNickname || (orderDetail.csId ? '未知客服' : 'N/A');
        orderDetail.supplierNickname = orderDetail.supplierNickname || (orderDetail.supplierId ? '未知供货商' : '未分配');

        // 权限检查：客服只能看自己创建的，供货商只能看待处理或自己已接手的
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
      
      // 新增: 成本价格校验 (可选，如果要求必填)
      // if (typeof costPrice !== 'number' || costPrice < 0) {
      //   return { code: 400, message: '成本价格必须为有效的数字' };
      // }

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return { code: 404, message: '订单不存在' };
      if (order.orderType !== 'cdk') return { code: 400, message: '非CDK订单' };
      if (order.status !== 'pending' && order.supplierId !== userInfo._id ) { // 允许供货商处理自己已接单但由于某种原因未完成的。更严格可以是仅pending
           return { code: 400, message: `订单当前状态[${order.status}]不可操作或非您负责` };
      }


      try {
        const updateData = {
          status: 'completed',
          supplierId: userInfo._id, 
          'screenshots.completionProofFileId': screenshots.completionProofFileId,
          completeTime: new Date(),
          updateTime: new Date()
        };
        // 如果提供了成本价格，则更新
        if (costPrice !== undefined && costPrice !== null && typeof costPrice === 'number') {
            updateData.costPrice = costPrice;
        } else if (costPrice !== undefined && costPrice !== null) { // 如果提供了但不是数字
            console.warn(`订单 ${orderId} 提供的成本价格 ${costPrice} 不是有效数字，未保存。`);
        }


        await db.collection('orders').doc(orderId).update({ data: updateData });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_CDK_ORDER', `供货商 ${userInfo.nickname || userInfo.username} 完成CDK订单 #${order.orderNumber}${updateData.costPrice !== undefined ? ', 成本价: '+updateData.costPrice : ''}`);
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
      
      // 新增: 成本价格校验 (可选)
      // if (costPrice !== undefined && (typeof costPrice !== 'number' || costPrice < 0)) {
      //   return { code: 400, message: '成本价格必须为有效的数字' };
      // }

      const order = await db.collection('orders').doc(orderId).get().then(res => res.data);
      if (!order) return { code: 404, message: '订单不存在' };
      if (order.orderType !== 'gift') return { code: 400, message: '非皮肤赠送订单' };
      if (!['timing', 'ready_to_send'].includes(order.status)) return { code: 400, message: `订单当前状态[${order.status}]不可操作` };
      if (order.supplierId !== userInfo._id) return { code: 403, message: '此订单并非由您负责处理' };
      
      try {
        const updateData = {
            status: 'completed',
            'screenshots.completionProofFileId': screenshots.completionProofFileId,
            completeTime: new Date(),
            updateTime: new Date()
        };
        // 如果提供了成本价格，则更新
        if (costPrice !== undefined && costPrice !== null && typeof costPrice === 'number') {
            updateData.costPrice = costPrice;
        } else if (costPrice !== undefined && costPrice !== null) {
            console.warn(`订单 ${orderId} 提供的成本价格 ${costPrice} 不是有效数字，未保存。`);
        }

        await db.collection('orders').doc(orderId).update({ data: updateData });
        await addOrderLog(orderId, userInfo._id, userInfo.role, 'COMPLETE_GIFT_ORDER', `供货商 ${userInfo.nickname || userInfo.username} 完成皮肤赠送 订单 #${order.orderNumber}${updateData.costPrice !== undefined ? ', 成本价: '+updateData.costPrice : ''}`);
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

        // 1. 获取当日的订单列表 (与之前类似，包含costPrice给管理员)
        const ordersAggregate = await db.collection('orders')
          .aggregate()
          .match({
            createTime: _.gte(startDate).and(_.lte(endDate))
          })
          .lookup({ // 关联客服信息
            from: 'users', localField: 'csId', foreignField: '_id', as: 'csInfoArray',
          })
          .lookup({ // 关联供货商信息
            from: 'users', localField: 'supplierId', foreignField: '_id', as: 'supplierInfoArray',
          })
          .project({ // 包含成本价给管理员
            _id: 1, orderNumber: 1, buyerGameId: 1, orderType: 1, status: 1,
            remarks: 1, csId: 1, supplierId: 1, createTime: 1, completeTime: 1,
            costPrice: 1, // 管理员可以看到成本价
            csNickname: $.arrayElemAt(['$csInfoArray.nickname', 0]),
            supplierNickname: $.arrayElemAt(['$supplierInfoArray.nickname', 0])
          })
          .sort({ createTime: -1 }) // 原始订单列表可以按创建时间排序
          .end();

        const dailyOrdersData = ordersAggregate.list.map(order => ({
          ...order,
          csNickname: order.csNickname || (order.csId ? '未知客服' : 'N/A'),
          supplierNickname: order.supplierNickname || (order.supplierId ? '未知供货商' : 'N/A')
        }));

        // 2. 计算统计数据
        const totalOrders = dailyOrdersData.length;
        let cdkCount = 0;
        let giftCount = 0;
        let pendingCount = 0;
        let timingCount = 0;
        let readyToSendCount = 0;
        let completedCount = 0;
        let totalCost = 0;
        
        const csPerformance = {}; // 客服业绩：{ csId: { nickname: 'xxx', count: 0 }, ... }
        const supplierPerformance = {}; // 供货商业绩：{ supplierId: { nickname: 'xxx', count: 0, totalCost: 0 }, ... }
        
        dailyOrdersData.forEach(order => {
          if (order.orderType === 'cdk') cdkCount++;
          else if (order.orderType === 'gift') giftCount++;

          if (order.status === 'pending') pendingCount++;
          else if (order.status === 'timing') timingCount++;
          else if (order.status === 'ready_to_send') readyToSendCount++;
          else if (order.status === 'completed') completedCount++;

          if (typeof order.costPrice === 'number') {
            totalCost += order.costPrice;
          }

          // 客服业绩统计
          if (order.csId) {
            if (!csPerformance[order.csId]) {
              csPerformance[order.csId] = { nickname: order.csNickname || order.csId, count: 0 };
            }
            csPerformance[order.csId].count++;
          }

          // 供货商业绩统计 (只统计已分配或已完成的订单的供货商)
          if (order.supplierId && order.status !== 'pending') { // 或者只统计 completed 状态的？目前是只要有supplierId且非pending
            if (!supplierPerformance[order.supplierId]) {
              supplierPerformance[order.supplierId] = { nickname: order.supplierNickname || order.supplierId, count: 0, totalCost: 0 };
            }
            supplierPerformance[order.supplierId].count++;
            if (typeof order.costPrice === 'number') {
              supplierPerformance[order.supplierId].totalCost += order.costPrice;
            }
          }
        });

        // 类型占比
        const typeDistribution = {
          cdk: totalOrders > 0 ? (cdkCount / totalOrders) * 100 : 0,
          gift: totalOrders > 0 ? (giftCount / totalOrders) * 100 : 0,
        };
        
        // 将对象转换为数组方便前端遍历
        const csPerformanceArray = Object.values(csPerformance).sort((a,b) => b.count - a.count); // 按订单数降序
        const supplierPerformanceArray = Object.values(supplierPerformance).sort((a,b) => b.count - a.count); // 按订单数降序

        const stats = {
          totalOrders,
          cdkCount,
          giftCount,
          pendingCount,
          timingCount,
          readyToSendCount,
          completedCount,
          totalCost,
          typeDistribution, // 新增：类型占比
          csPerformance: csPerformanceArray, // 新增：客服业绩
          supplierPerformance: supplierPerformanceArray, // 新增：供货商业绩
        };

        return {
          code: 200,
          message: '获取成功',
          data: dailyOrdersData, // 当日订单列表
          stats: stats         // 统计数据
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