'use strict';
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
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
		newNickname,
		userIdToDelete,
		currentPassword,
		newPassword,
		game_id, // 用于修改用户所属游戏
		gameDetails // 用于游戏管理
	} = event;

	let authUser = null;

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
			message: '登录信息无效或已过期'
		};

		authUser = authRes.data[0];
		if (new Date() > new Date(authUser.tokenExpireTime)) {
			return {
				code: 401,
				message: '登录已过期，请重新登录'
			};
		}
	}

	switch (action) {
		case 'login':
			{
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

				if (!verifyPassword(password, user.passwordHash, user.salt)) {
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
				const tokenExpireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

				await db.collection('users').doc(user._id).update({
					data: {
						token: newToken,
						tokenExpireTime,
						updateTime: new Date()
					}
				});

				delete user.passwordHash;
				delete user.salt;
				user.token = newToken;
				return {
					code: 200,
					message: '登录成功',
					data: user
				};
			}

		case 'checkAuth':
			{
				delete authUser.passwordHash;
				delete authUser.salt;
				return {
					code: 200,
					message: 'Token有效',
					data: authUser
				};
			}

		// --- 新增：游戏管理 ---
		case 'getGames':
			{
				if (!authUser || authUser.role !== 'admin') {
					return {
						code: 403,
						message: '无权操作'
					};
				}
				try {
					const gamesRes = await db.collection('games').orderBy('create_time', 'desc').get();
					return {
						code: 200,
						message: '获取游戏列表成功',
						data: gamesRes.data
					};
				} catch (e) {
					return {
						code: 500,
						message: '获取游戏列表失败'
					};
				}
			}

		case 'addGame':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!gameDetails || !gameDetails.name) return {
					code: 400,
					message: '游戏名称不能为空'
				};
				await db.collection('games').add({
					data: {
						name: gameDetails.name,
						description: gameDetails.description || '',
						create_time: new Date()
					}
				});
				return {
					code: 200,
					message: '游戏添加成功'
				};
			}

		case 'updateGame':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!event.gameId || !gameDetails || !gameDetails.name) return {
					code: 400,
					message: '参数不完整'
				};
				await db.collection('games').doc(event.gameId).update({
					data: {
						name: gameDetails.name,
						description: gameDetails.description || ''
					}
				});
				return {
					code: 200,
					message: '游戏更新成功'
				};
			}

		case 'deleteGame':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!event.gameId) return {
					code: 400,
					message: '缺少游戏ID'
				};
				const userCount = await db.collection('users').where({
					game_id: event.gameId
				}).count();
				if (userCount.total > 0) return {
					code: 400,
					message: '仍有用户属于此游戏，无法删除'
				};
				const orderCount = await db.collection('orders').where({
					game_id: event.gameId
				}).count();
				if (orderCount.total > 0) return {
					code: 400,
					message: '仍有订单属于此游戏，无法删除'
				};

				await db.collection('games').doc(event.gameId).remove();
				return {
					code: 200,
					message: '游戏删除成功'
				};
			}

			// --- 用户管理修改 ---
		case 'adminAddUser':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!newUserDetails || !newUserDetails.username || !newUserDetails.password || !newUserDetails.role || !
					newUserDetails.nickname) {
					return {
						code: 400,
						message: '用户信息不完整(账号、密码、角色、昵称必填)'
					};
				}
				if (['cs', 'supplier'].includes(newUserDetails.role) && !newUserDetails.game_id) {
					return {
						code: 400,
						message: '必须为客服或供货商指定一个游戏'
					};
				}

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
						game_id: newUserDetails.game_id || null,
						status: 1,
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

		case 'adminUpdateUser':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!userIdToUpdate) return {
					code: 400,
					message: '缺少目标用户ID'
				};

				const updatePayload = {
					updateTime: new Date()
				};
				if (newRole !== undefined) updatePayload.role = newRole;
				if (newStatus !== undefined) updatePayload.status = newStatus;
				if (newNickname !== undefined) updatePayload.nickname = newNickname;
				if (game_id !== undefined) updatePayload.game_id = game_id; // 修改为 `game_id`

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

		case 'adminDeleteUser':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				if (!userIdToDelete) return {
					code: 400,
					message: '缺少目标用户ID'
				};
				if (userIdToDelete === authUser._id) return {
					code: 400,
					message: '管理员不能删除自己'
				};

				await db.collection('users').doc(userIdToDelete).remove();
				return {
					code: 200,
					message: '用户删除成功'
				};
			}

		case 'adminListUsers':
			{
				if (!authUser || authUser.role !== 'admin') return {
					code: 403,
					message: '无权操作'
				};
				const {
					roleFilter, statusFilter, page = 1, pageSize = 20
				} = event;
				let query = {};
				if (roleFilter) query.role = roleFilter;
				if (statusFilter !== undefined) query.status = statusFilter;

				const usersList = await db.collection('users')
					.where(query)
					.field({
						passwordHash: false,
						salt: false,
						token: false,
						tokenExpireTime: false
					})
					.orderBy('createTime', 'desc')
					.skip((page - 1) * pageSize)
					.limit(pageSize)
					.get();

				const gamesList = await db.collection('games').get();
				const gamesMap = gamesList.data.reduce((acc, cur) => {
					acc[cur._id] = cur.name;
					return acc;
				}, {});

				usersList.data.forEach(user => {
					user.game_name = user.game_id ? gamesMap[user.game_id] : '未分配';
				});

				const total = await db.collection('users').where(query).count();
				return {
					code: 200,
					message: '获取用户列表成功',
					data: usersList.data,
					total: total.total
				};
			}

		case 'changePassword':
			{
				if (!authUser) return {
					code: 401,
					message: '用户未登录'
				};
				if (!currentPassword || !newPassword) return {
					code: 400,
					message: '当前密码和新密码不能为空'
				};

				const userSnapshot = await db.collection('users').doc(authUser._id).get();
				const fullUserRecord = userSnapshot.data;

				if (!verifyPassword(currentPassword, fullUserRecord.passwordHash, fullUserRecord.salt)) {
					return {
						code: 401,
						message: '当前密码错误'
					};
				}

				const {
					salt,
					hash
				} = hashPassword(newPassword);
				await db.collection('users').doc(authUser._id).update({
					data: {
						passwordHash: hash,
						salt: salt,
						updateTime: new Date(),
					}
				});
				return {
					code: 200,
					message: '密码修改成功'
				};
			}

		case 'getActiveSuppliers':
			{
				if (!authUser || !['admin', 'cs'].includes(authUser.role)) {
					return {
						code: 403,
						message: '无权操作'
					};
				}
				const gameIdForFilter = authUser.game_id;
				if (!gameIdForFilter && authUser.role === 'cs') {
					return {
						code: 400,
						message: '当前客服未分配游戏'
					};
				}

				try {
					let query = {
						role: 'supplier',
						status: 1
					};
					if (authUser.role === 'cs') {
						query.game_id = gameIdForFilter;
					}

					const suppliersRes = await db.collection('users')
						.where(query)
						.field({
							username: true,
							nickname: true,
							_id: true
						})
						.orderBy('nickname', 'asc')
						.get();

					return {
						code: 200,
						message: '获取供货商列表成功',
						data: suppliersRes.data
					};
				} catch (e) {
					return {
						code: 500,
						message: '获取供货商列表失败'
					};
				}
			}

		default:
			return {
				code: 404,
				message: '未知的 action'
			};
	}
};