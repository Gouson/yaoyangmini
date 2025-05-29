'use strict';
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  console.log('[Scheduler] 开始执行订单定时检查任务...');
  try {
    const now = new Date();
    const expiredOrdersRes = await db.collection('orders').where({
      orderType: 'gift',
      status: 'timing',
      expireTime: _.lte(now)
    }).get();

    if (expiredOrdersRes.data.length === 0) {
      console.log('[Scheduler] 没有到期的计时订单。');
      return { code: 200, message: '没有到期的计时订单' };
    }

    const updatePromises = expiredOrdersRes.data.map(async (order) => {
      console.log(`[Scheduler] 订单 ${order._id} (订单号: ${order.orderNumber}) 计时已到期。`);
      // 1. 更新订单状态为 'ready_to_send' (可选，防止重复通知或标记为待发货)
      await db.collection('orders').doc(order._id).update({
        data: {
          status: 'ready_to_send',
          updateTime: new Date()
        }
      });
      await cloud.callFunction({ // 调用 order-center 内部的日志记录
          name: 'order-center',
          data: {
              // 需要一个内部调用或直接使用 addOrderLog 的方式，但跨函数直接调用辅助函数不方便
              // 此处简化，实际项目中可考虑将 addOrderLog 也做成一个独立可调用的action或独立函数
              // 或者在 order-center 中增加一个内部 action 来记录日志
              // 这里暂时不记录日志，或通过 event 传递一个 system 角色
          }
      });


      // 2. 【发送通知逻辑 - 重点】
      //    实际发送通知需要前端用户授权订阅消息，并在这里获取供货商的 OpenID 进行推送
      const supplierUserRes = await db.collection('users').doc(order.supplierId).get();
      if (supplierUserRes.data && supplierUserRes.data._openid) {
        const supplierOpenid = supplierUserRes.data._openid;
        const messageContent = `您的订单 #${order.orderNumber} (买家ID: ${order.buyerGameId}) 皮肤赠送已到期，请及时处理！`;
        console.log(`[Scheduler] 准备向供货商 ${supplierUserRes.data.nickname} (OpenID: ${supplierOpenid}) 发送通知: ${messageContent}`);
        
        // 实际发送订阅消息的示例 (需替换为您的模板ID和参数)
        // try {
        //   await cloud.openapi.subscribeMessage.send({
        //     touser: supplierOpenid,
        //     page: `pages/orderDetail/orderDetail?id=${order._id}`, // 用户点击通知后跳转的页面
        //     lang: 'zh_CN',
        //     data: { // 根据你的模板字段来配置
        //       thing1: { value: '订单到期提醒' }, // 示例
        //       thing2: { value: `订单号 ${order.orderNumber}` },
        //       thingyszerk: { value: `买家ID ${order.buyerGameId}` },
        //       time4: { value: new Date(order.expireTime).toLocaleString() }
        //     },
        //     templateId: 'YOUR_SUBSCRIBE_MESSAGE_TEMPLATE_ID' 
        //   });
        //   console.log(`[Scheduler] 已成功向 ${supplierOpenid} 发送订单 ${order._id} 的到期提醒。`);
        // } catch (sendError) {
        //   console.error(`[Scheduler] 发送订阅消息给 ${supplierOpenid} 失败 for order ${order._id}:`, sendError.errMsg, sendError.errCode);
        // }

      } else {
        console.warn(`[Scheduler] 订单 ${order._id} 的供货商 ${order.supplierId} 未找到或未绑定OpenID，无法发送通知。`);
      }
      return true;
    });

    await Promise.all(updatePromises);
    console.log(`[Scheduler] 处理了 ${expiredOrdersRes.data.length} 个到期订单。`);
    return { code: 200, message: `处理了 ${expiredOrdersRes.data.length} 个到期订单` };

  } catch (e) {
    console.error('[Scheduler] 订单定时任务执行失败:', e);
    return { code: 500, message: '订单定时任务执行失败' };
  }
};