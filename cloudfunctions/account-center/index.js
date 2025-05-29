'use strict';
const cloud = require('wx-server-sdk');
const crypto = require('crypto'); // Node.js 内置加密模块
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;

// 密码加密函数
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return {
    salt,
    hash
  };
}

// 密码验证函数
function verifyPassword(password, storedHash, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

exports.main = async (event, context) => {
  const {
    action,
    username,
    password,
    token,
    newUserDetails,
    userIdToUpdate,
    newStatus,
    newRole,
    newNickname
  } = event;

  let authUser = null; // 用于存储认证后的用户信息

  // 对于需要认证的action (除login和内部调用外)，先验证token
  if (action !== 'login') {
    if (!token) return {
      code: 401,
      message: '缺少token，请先登录'
    };
    const authRes = await db.collection('users').where({
      token
    }).get();
    if (authRes.data.length === 0) return {
      code: 401,
      message: '登录信息无效或已过期(token找不到)'
    };

    authUser = authRes.data[0];
    if (new Date() > new Date(authUser.tokenExpireTime)) {
      return {
        code: 401,
        message: '登录已过期，请重新登录(token过期)'
      };
    }
  }

  switch (action) {
    case 'login': {
      if (!username || !password) return {
        code: 400,
        message: '账号或密码不能为空'
      };
      const userRes = await db.collection('users').where({
        username
      }).get();
      if (userRes.data.length === 0) return {
        code: 401,
        message: '账号或密码错误'
      };
      const user = userRes.data[0];

      if (!verifyPassword(password, user.passwordHash, user.salt)) { // 注意这里是 passwordHash
        return {
          code: 401,
          message: '账号或密码错误'
        };
      }
      if (user.status !== 1) return {
        code: 403,
        message: '账号已被禁用'
      };

      const newToken = crypto.randomBytes(32).toString('hex');
      const tokenExpireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

      await db.collection('users').doc(user._id).update({
        data: {
          token: newToken,
          tokenExpireTime,
          updateTime: new Date()
        }
      });

      delete user.passwordHash;
      delete user.salt; // 不返回敏感信息
      user.token = newToken; // 将新token加入返回
      return {
        code: 200,
        message: '登录成功',
        data: user
      };
    }

    case 'checkAuth': { // 这个action主要给其他云函数内部调用，或者前端简单验证
      // authUser 已在前面通过token获取并验证
      delete authUser.passwordHash;
      delete authUser.salt;
      return {
        code: 200,
        message: 'Token有效',
        data: authUser
      };
    }

    // --- 管理员操作 ---
    case 'adminAddUser': { // 管理员添加用户
      if (!authUser || authUser.role !== 'admin') return {
        code: 403,
        message: '无权操作'
      };
      if (!newUserDetails || !newUserDetails.username || !newUserDetails.password || !newUserDetails.role || !newUserDetails.nickname) {
        return {
          code: 400,
          message: '新用户信息不完整(账号、密码、角色、昵称必填)'
        };
      }
      if (!['cs', 'supplier'].includes(newUserDetails.role)) { // 管理员不能通过此接口创建其他管理员
        return {
          code: 400,
          message: '无效的角色，只能添加客服或供货商'
        };
      }
      // 检查用户名是否已存在
      const existingUser = await db.collection('users').where({
        username: newUserDetails.username
      }).get();
      if (existingUser.data.length > 0) {
        return {
          code: 409,
          message: '用户名已存在'
        };
      }

      const {
        salt,
        hash
      } = hashPassword(newUserDetails.password);
      await db.collection('users').add({
        data: {
          username: newUserDetails.username,
          passwordHash: hash,
          salt: salt,
          role: newUserDetails.role,
          nickname: newUserDetails.nickname,
          status: 1, // 默认启用
          _openid: null,
          token: null,
          tokenExpireTime: null,
          createTime: new Date(),
          updateTime: new Date()
        }
      });
      return {
        code: 200,
        message: '用户添加成功'
      };
    }

    case 'adminUpdateUser': { // 管理员修改用户信息 (角色、状态、昵称)
      if (!authUser || authUser.role !== 'admin') return {
        code: 403,
        message: '无权操作'
      };
      if (!userIdToUpdate) return {
        code: 400,
        message: '缺少目标用户ID'
      };
      if (userIdToUpdate === authUser._id && (newStatus === 0 || (newRole && newRole !== 'admin'))) {
        return {
          code: 400,
          message: '管理员不能禁用自己或改变自己的管理员角色'
        };
      }

      const updatePayload = {
        updateTime: new Date()
      };
      if (newRole !== undefined) {
        if (!['cs', 'supplier', 'admin'].includes(newRole)) return {
          code: 400,
          message: '无效的角色设定'
        };
        updatePayload.role = newRole;
      }
      if (newStatus !== undefined) {
        if (![0, 1].includes(newStatus)) return {
          code: 400,
          message: '无效的状态设定'
        };
        updatePayload.status = newStatus;
      }
      if (newNickname !== undefined) updatePayload.nickname = newNickname;

      if (Object.keys(updatePayload).length === 1) return {
        code: 400,
        message: '没有提供可更新的字段'
      };

      await db.collection('users').doc(userIdToUpdate).update({
        data: updatePayload
      });
      return {
        code: 200,
        message: '用户信息更新成功'
      };
    }

    case 'adminListUsers': {
      if (!authUser || authUser.role !== 'admin') return {
        code: 403,
        message: '无权操作'
      };
      const {
        roleFilter,
        statusFilter,
        page = 1,
        pageSize = 20
      } = event; // 确保从 event 中获取参数
      const skip = (page - 1) * pageSize;
      let query = {};
      if (roleFilter) query.role = roleFilter;
      if (statusFilter !== undefined) query.status = statusFilter;

      const usersList = await db.collection('users')
        .where(query)
        .field({ // <-- 修改为 field()
          passwordHash: false, // 设置为 false 表示不返回此字段
          salt: false, // 设置为 false 表示不返回此字段
          token: false, // 设置为 false 表示不返回此字段
          tokenExpireTime: false // 设置为 false 表示不返回此字段
        })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();
      const total = await db.collection('users').where(query).count();
      return {
        code: 200,
        message: '获取用户列表成功',
        data: usersList.data,
        total: total.total
      };
    }

    case 'getActiveSuppliers': { // 新增 action
      // 权限：只有客服和管理员可以获取供货商列表
      if (!authUser || !['admin', 'cs'].includes(authUser.role)) {
        return {
          code: 403,
          message: '无权操作'
        };
      }
      try {
        const suppliersRes = await db.collection('users')
          .where({
            role: 'supplier',
            status: 1 // 只获取启用状态的供货商
          })
          .field({
            username: true,
            nickname: true,
            _id: true
          })
          .orderBy('nickname', 'asc') // 按昵称排序
          .get();

        return {
          code: 200,
          message: '获取供货商列表成功',
          data: suppliersRes.data
        };
      } catch (e) {
        console.error('获取供货商列表失败:', e);
        return {
          code: 500,
          message: '获取供货商列表失败'
        };
      }
    }

    default:
      return {
        code: 404, message: '未知的 action'
      };
  }
};