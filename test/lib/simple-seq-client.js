'use strict';
const EasySock = require("../../index");

module.exports = function (port) {
	let easysock = new EasySock();
	easysock.setConfig({
		ip: "127.0.0.1",
		port: port,
		keepAlive: true,
		timeout: 200    //0 by default
	});
	Object.assign(easysock, {
		encode: function (data, seq) {
			// console.log('client encode', data);
			let body = new Buffer(data, 'utf-8');

			let packet = new Buffer(20);
			//包头-start
			packet.writeInt8(81, 0);	// Q
			packet.writeInt8(86, 1);	// A

			packet.writeInt16BE(1, 2);	// version
			packet.writeInt32BE(body.length + 4, 4); // 长度
			packet.writeInt32BE(seq, 8);
			packet.writeInt32BE(10001, 12);
			packet.writeInt32BE(body.length, 16);
			//包头-end

			packet = Buffer.concat([packet, body]);

			return packet;
		},

		decode: function (packet) {
			// console.log('client decode', data);
			let seq = packet.readUInt32BE(8);

			let body = packet.slice(32);
			let msg = body.toString('utf-8');
			return {
				result: msg,
				seq: seq,
				error: null
			};
		},

		isReceiveComplete: function (packet) {
			if (packet.length < 28)
				return 0;

			var len = packet.readUInt32BE(4);
			if (packet.length < len + 28)
				return 0;
			return len + 28;
		}
	});

	easysock.writePromise = (function (write) {

	    return function (data) {
		    return new Promise(function (resolve, reject) {
			    write.call(easysock, data, function (err, data) {
				    err ? reject(err) : resolve(data);
			    })
		    });
	    };
	})(easysock.write);

	return easysock
};