// test.js
const crypto = require('crypto');

function hashPassword(password) {
  // 1. 创建一个随机的盐
  const salt = crypto.randomBytes(16).toString('hex');
  // 2. 使用盐和密码进行哈希
  // 参数：密码, 盐, 迭代次数, 输出长度, 哈希算法
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

// 你想设置的密码
const myPassword = 'admin_password123'; // 替换成你想设置的复杂密码
const result = hashPassword(myPassword);

console.log('请将以下信息手动添加到云数据库 users 集合中:');
console.log('username:', 'admin'); // 或者你想要的管理员用户名
console.log('password:', `'${result.hash}'`); // 这是加密后的密码
console.log('salt:', `'${result.salt}'`);   // 这是盐