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
	let port = 9091;

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
	let port = 9092;

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
	let port = 9093;
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

ava.serial('并行请求，有超时失败率', async function (t) {
	let port = 9094;
	await forkServer(port);

	let easysock = createClient(port, 120); // tcp有可能拼两个包一起返回

	const Number = 5;
	let failedTime = 0;
	t.plan(Number)

	for (let i = 0; i < Number; i++) {
		easysock.write('hehe' + i, function (err, data) {
			console.log(err, data)
			if (err) { 
				failedTime += 1;
			}
			t.pass();
		})
	}

	return await new Promise(rs => {
		setTimeout(() => {
			console.log(`失败率：${failedTime/Number}`);
			rs()
		}, 1000);
	})
})

ava.serial('第一次连接超时，在close之前创建新连接，触发死循环', async function (t) {
	let port = 9095;
	await forkServer(port);

	let easysock = createClient(port, 100);
	const Number = 5;
	t.plan(Number)

	easysock.write('first', function (err, data) {
		// 第一个连接超时
		console.log('first', err, data);
	})

	// 卡CPU，保证在触发第一个连接的close事件前创建第二个socket
	let start = Date.now();
	while (Date.now() - start < 400) {
		continue
	}
	setTimeout(() => {
		console.log('client socket begin write ...')
		for (let i = 0; i < Number; i++) {
			easysock.write('hehe' + i, function (err, data) {
				console.log('请求有回调，没有死循环', err, data);
				t.pass()
			})
		}
	})


	await new Promise(rs => {
		setTimeout(() => {
			rs()
		}, 1000);
	})

})