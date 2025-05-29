// generateUserCredentials.js
const crypto = require('crypto');

function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
	return {
		salt,
		hash
	};
}

// --- 您需要修改下面的信息 ---
const usernameToGenerate = 'sp02'; // 每次生成不同用户时修改这里
const passwordToGenerate = 'sp02000'; // 每次生成不同用户时修改这里

// --- 执行生成 ---
if (!passwordToGenerate || passwordToGenerate.length < 6) {
	console.error('错误：密码不能为空且长度至少为6位！');
} else {
	const credentials = hashPassword(passwordToGenerate);
	console.log(`为用户 "${usernameToGenerate}" 生成的凭据:`);
	console.log(`  passwordHash: '${credentials.hash}',`);
	console.log(`  salt: '${credentials.salt}',`);
	console.log(`请将以上 passwordHash 和 salt 值用于数据库记录。`);
}