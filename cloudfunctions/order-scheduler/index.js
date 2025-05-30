'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const functionName = 'order-scheduler';
  console.log(`[${functionName}] 开始执行订单定时检查任务...`);
  const now = new Date();

  try {
    const expiredOrdersRes = await db.collection('orders').where({
      orderType: 'gift',
      status: 'timing',
      expireTime: _.lte(now)
    }).get();

    if (expiredOrdersRes.data.length === 0) {
      console.log(`[${functionName}] 没有到期的计时订单。`);
      return { code: 200, message: '没有到期的计时订单', processedCount: 0 };
    }

    let successCount = 0;

    for (const order of expiredOrdersRes.data) {
      console.log(`[${functionName}] 订单 ${order._id} (订单号: ${order.orderNumber}) 计时已到期。`);
      
      try {
        // 1. 更新订单状态为 'ready_to_send'
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'ready_to_send',
            updateTime: new Date()
          }
        });
        // 可在此处调用 addOrderLog (若已将其设计为可从外部调用或有内部调用机制)
        // await cloud.callFunction({ name: 'order-center', data: { action: '_internalLog', orderId: order._id, ... }})
        console.log(`[${functionName}] 订单 ${order._id} 状态已更新为 'ready_to_send'。`);
        successCount++;

        // 2. 移除微信订阅消息发送逻辑
        // console.log(`[${functionName}] 订单 ${order._id} 已到期，供货商 ${order.supplierId} 将在列表看到更新。`);

      } catch (singleOrderError) {
        console.error(`[${functionName}] 处理单个到期订单 ${order._id} 失败:`, singleOrderError);
      }
    }

    console.log(`[${functionName}] 处理了 ${expiredOrdersRes.data.length} 个原始到期订单，成功更新状态 ${successCount} 个。`);
    return { code: 200, message: `成功更新 ${successCount} 个订单状态为待发货`, processedCount: successCount };

  } catch (e) {
    console.error(`[${functionName}] 订单定时任务执行失败:`, e);
    return { code: 500, message: '订单定时任务执行失败' };
  }
};