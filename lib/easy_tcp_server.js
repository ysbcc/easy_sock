'use strict';
const debug = require("debug")('easysock-server');

/**
 * @param config
 *  encode
 *  decode
 *  check
 * @param handleResponse:async fn
 *
 *
 * @returns {bindsocket(socket)}
 */
let exportee = module.exports = function (config, handleResponse) {
	let {encode, decode, check} = config;
	if (!check && config.isReceiveComplete) check = config.isReceiveComplete;

	// 缓冲区
	let buffer = null;
	let handleData = async function (buffer) {
		let param = null;
		let result = null;

		try {
			param = decode(buffer);
			result = await handleResponse(param.error, param.result);
			return encode(result, param.seq);
		} catch (e) {
			return debug(e);
		}
	};

	return function bindsocket(socket) {
		debug('socket connected', socket.connection);

		socket.on('data', data=> {
			debug('socket ondata');

			buffer = (buffer && buffer.length > 0) ?
				Buffer.concat([buffer, data]) : // 有遗留数据才做拼接操作
				data;
			let checkLength = null;
			while (buffer && (checkLength = check(buffer))) {
				let requestdata = null;
				let responsedata = null;
				if (checkLength == buffer.length) {
					requestdata = buffer;
					buffer = null;

				} else {
					requestdata = buffer.slice(0, checkLength);
					buffer = buffer.slice(checkLength);
				}

				(async()=> {
					debug('handling data');
					responsedata = await handleData(requestdata);
					debug('response data');
					try {
						responsedata && socket.write(responsedata);
					} catch (e) {
						debug('write error');
					}
				})();
			}
			debug('remain', buffer && buffer.length)
		});

		socket.on('end', e=> {
			debug('socket end');
		});

		return socket;
	};
};

const net = require("net");
/**
 * 直接创建一个server
 * @param config 包含encode、decode、check
 * @param handlerResponse 一个async function，参数为收到的请求结构体，返回是回包的结构体
 */
exportee.server = function (config, handlerResponse) {
	let handleSocket = exportee(config, handlerResponse);
	let socketList = [];

	return Object.assign(
		net.createServer(function (socket) {
			handleSocket(socket);
			socketList.push(socket);
		}),

		{
			closeAllSocket: function () {
				socketList.forEach(socket=> {
					if (!socket.destroyed) {
						socket.destroy();

					}
				})
			}
		}
	)
};