'use strict';
const ava = require("ava");
const cp = require("child_process");
const createClient = require("./lib/simple-seq-client");

function forkServer(port) {
	return new Promise(resolve=> {
		let pcs = cp.fork(__dirname + '/lib/simple-seq-server.js', {
			env: {
				PORT: port
			}
		});
		pcs.on('message', data=> {
			if (data.toString().indexOf('listened') != -1) {
				resolve({
					close: function () {
						return new Promise((resolve, reject)=> {
							pcs.kill();
							pcs.on('close', resolve)
						});
					}
				});
			}
		})
	});
}

ava.serial('正常通信', async function (t) {
	let port = 9090 + Math.floor(Math.random() * 100);

	// 创建服务器和easy_sock
	let server = await forkServer(port);
	let easysock = createClient(port);

	for (var i = 0; i < 10; i++) {
		let data = await easysock.writePromise('hehe');
		t.is(data, 'hehe');
	}

	easysock.close();
	await server.close();
});


ava.serial('服务器进程重启', async function (t) {
	let port = 9090 + Math.floor(Math.random() * 100);

	// 创建服务器和easy_sock
	let server = await forkServer(port);
	let easysock = createClient(port);

	for (let i = 0; i < 5; i++) {
		let data = await easysock.writePromise('hehe');
		t.is(data, 'hehe');
	}

	// 服务器关闭
	await server.close();
	// console.log('start');
	for (let i = 0; i < 5; i++) {
		try {
			let error = await easysock.writePromise('hehe');
		} catch(error) {
			continue;
		}
		t.is(false, true)
		// t.is(error.message, 'easy_sock:TCP connect timeout(600)');
	}

	// 服务器重启完毕
	server = await forkServer(port);

	for (let i = 0; i < 5; i++) {
		let data = await easysock.writePromise('hehe');
		t.is(data, 'hehe');
	}
});

let createServer = require("./lib/simple-seq-server");
ava.serial('服务器主动关闭连接，然后客户端重连', async function (t) {
	let port = 9090 + Math.floor(Math.random() * 100);
	let server = null;

	await new Promise(resolve=> {
		server = createServer(port, resolve)
	});
	let easysock = createClient(port);

	for (let i = 0; i < 5; i++) {
		var prom = easysock.writePromise('hehe');
		let data = await prom
		t.is(data, 'hehe');
	}

	server.closeAllSocket();
	await new Promise((resolve, reject)=> {
		setTimeout(resolve, 1500)
	});

	for (let i = 0; i < 5; i++) {
		let data = await easysock.writePromise('hehe');
		t.is(data, 'hehe');
	}
});