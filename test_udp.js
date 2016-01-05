
var Easyudp = require("./index.js").Udp;

var easyudp = new Easyudp({
	ip : "127.0.0.1",
	port : 1990,
	timeout : 50
});

var encode = function(data, seq){
	var buf = new Buffer(8);
	buf.writeInt32BE(data.num, 0);
	buf.writeInt32BE(seq, 4);
	return buf;
};
easyudp.encode = encode;

var decode = function(buf){
	var num = buf.readInt32BE(0);
	var seq = buf.readInt32BE(4);
	return {
		num : num,
		seq : seq
	}
};
easyudp.decode = decode;


//server start
var	dgram = require("dgram");
var server = dgram.createSocket("udp4");	
server.bind({
	port : 1990
});

server.on("message", function(buf, rinfo){
	var res = decode(buf);
	res.num *= res.num;
	//console.dir(rinfo);
	//rinfo = { address: '127.0.0.1', family: 'IPv4', port: 44175, size: 8 }
	
	var ret = encode(res, res.seq);
	
	server.send(ret, 0, ret.length, rinfo.port, rinfo.address, function(err, bytes){
		if (err) {
			console.log(err);
		}
	});		
});
//server end

//并发测试
var n = 20;
while(--n){
	easyudp.send({
		num : n
	}, function(err, result){
		if (err){
			console.log(err);
		}
		else{
			console.log("success:");
			console.dir(result);
		}
		
		if (server && n==0){
			server.close();
			server = null;
		}
	});
}




