var Easyudp = require("./../index.js").Udp;

var easyudp = new Easyudp({
	ip: "127.0.0.1",
	port: 1990,
	timeout: 100
});

var encode = function (data, seq) {
	var buf = new Buffer(8);
	buf.writeInt32BE(data.num, 0);
	buf.writeInt32BE(seq, 4);
	return buf;
};
easyudp.encode = encode;

var decode = function (buf) {
	var num = buf.readInt32BE(0);
	var seq = buf.readInt32BE(4);
	return {
		num: num,
		seq: seq
	}
};
easyudp.decode = decode;


//server start
var dgram = require("dgram");
var server = dgram.createSocket("udp4");

if (process.version.indexOf('v0.1') >= 0) {
	server.bind(1990);
}
else {
	server.bind({
		port: 1990
	});
}

server.on("message", function (buf, rinfo) {

	//在这个测试程序中，如果并发量大的话接受就会丢包，node还是处理不过来
	var res = decode(buf);
	res.num *= res.num;
	//console.dir(rinfo)  { address: '127.0.0.1', family: 'IPv4', port: 44175, size: 8 }

	var ret = encode(res, res.seq);

	server.send(ret, 0, ret.length, rinfo.port, rinfo.address, function (err, bytes) {
		if (err) {
			console.log("server error");
			console.log(err);
		}
	});
});
//server end

var succ_cnt = 0;
var send = function (num) {
	easyudp.send({
		num: num
	}, function (err, result) {
		if (err) {
			//在nodejs 0.1版本下运行会偶尔出现这类错，即是促发了nodejs的bug “easyudp: 发送的请求跟回调不匹配. send seq=26, received seq=23”
			console.log(err);
		}
		else {
			console.log((num * num == result.num ? "YES " : "NO!!!!! ") + "send" + num + ", return " + result.num);
		}
		succ_cnt++;

		if (succ_cnt == 200) {
			server.close();
			server = null;
		}
	});
}

//并发测试
var n = 0;
while (n++ < 200) {
	send(n);
}




