const easyServer = require("../../lib/easy_tcp_server");

function create(port, callback = function() {}) {
	let server = easyServer.server(
		{
			decode: function (request) {
				// console.log('server decode', request);
				// 解包头与包体
				let seq = request.readInt32BE(8);
				return {
					error: null,
					result: request.slice(20).toString('utf-8'),
					seq
				}

			},
			encode: function (data, seq) {
				// console.log('server encode', data);
				body = new Buffer(data, 'utf-8');
				// 编好包头返回
				let header = Buffer.alloc(32);
				header.writeUInt8(0x51, 0);
				header.writeUInt8(0x41, 1);
				header.writeUInt32BE(body.length + 4, 4);
				header.writeUInt32BE(seq, 8);
				return Buffer.concat([header, body])

			},
			isReceiveComplete: function (buffer) {
				if (buffer.length < 16) {return}        // 包头至少16
				let length = buffer.readInt32BE(4);     // 读出包体长度
				if (buffer.length >= length + 16) return length + 16;

				return 0
			}

		},

		async function handleRequest(err, data) {

			await new Promise((resolve, reject)=> {
				setTimeout(resolve, 50);
			});

			return data
		}

	);

	server.listen(port, function (err) {
		process.send('listened');
		callback()
	});
	return server;
}

if (process.env.PORT) {
	create(process.env.PORT);
}

module.exports = create;
