// utils/cloud.js
import cloudbase from '@cloudbase/js-sdk';

// 初始化云开发环境
const cloud = cloudbase.init({
  env: 'cloud1-3ggi72rye43633d8' // 替换成你自己的环境ID
});

// 导出数据库和认证实例，方便在其他页面使用
const db = cloud.database();
const auth = cloud.auth();
const _ = db.command; // 用于进行高级查询

export { cloud, db, auth, _ };