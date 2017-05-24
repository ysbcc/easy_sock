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

// ava.serial('正常通信', async function (t) {
// 	let port = 9090 + Math.floor(Math.random() * 100);
//
// 	// 创建服务器和easy_sock
// 	let server = await forkServer(port);
// 	let easysock = createClient(port);
//
// 	for (var i = 0; i < 10; i++) {
// 		let data = await new Promise((resolve, reject)=> {
// 			easysock.write('hehe', function (err, data) {
// 				err ? reject(err) : resolve(data);
// 			});
// 		});
// 		t.is(data, 'hehe');
// 	}
//
// 	easysock.close();
// 	await server.close();
// });


ava.serial('服务器重启', async function (t) {
	let port = 9090 + Math.floor(Math.random() * 100);

	// 创建服务器和easy_sock
	let server = await forkServer(port);
	let easysock = createClient(port);

	for (let i = 0; i < 5; i++) {
		let data = await new Promise((resolve, reject)=> {
			easysock.write('hehe', function (err, data) {
				err ? reject(err) : resolve(data);
			});
		});
		t.is(data, 'hehe');
	}

	// 服务器关闭
	await server.close();
	await new Promise((resolve, reject)=> {
		setTimeout(resolve, 500)
	});
	console.log('start');
	for (let i = 0; i < 5; i++) {
		let error = await t.throws(new Promise((resolve, reject)=> {
			easysock.write('hehe', function (err, data) {
				err ? reject(err) : resolve(data);
			});
		}));
		console.error(error.message);
		t.is(error.message, 'easy_sock:TCP connect timeout(600)');
	}

	// 服务器重启完毕
	server = await forkServer(port);

	for (let i = 0; i < 5; i++) {
		let data = await new Promise((resolve, reject)=> {
			easysock.write('hehe', function (err, data) {
				err ? reject(err) : resolve(data);
			});
		});
		t.is(data, 'hehe');
	}
});