//这是用protobuf服务器的一个简单实例，其中的encode和decode没有具体实现，只是展示easy_sock用法

var EasySock = require("./index.js");

function createSocket(){
	var easysock = new EasySock();
	easysock.setConfig({
		ip : "10.209.6.12",
		port : 8886,
		keepAlive : true,
		timeout : 50
	});
		
	easysock.isReceiveComplete = function(packet){
		if (packet.length < 28)
			return 0;
		var Q = packet.readUInt8(0);
		var A = packet.readUInt8(1);
		if (Q != 0x51 || A != 0x41) 
			return -1;			
		
		var len = packet.readUInt32BE(4);
		if (packet.length < len + 28)
			return 0;
		return len + 28;				
	};
		
	easysock.encode = function(data, seq){
		
		//do some encode		
		//The body is 2001,['d0013tdrleb'],[ 'vid',  'title',  'second_title']
		var body = new Buffer([16,209,15,26,11,100,48,48,49,51,116,100,114,108,101,98,34,3,118,105,100,34,5,116,105,116,108,101,34,12,115,101,99,111,110,100,95,116,105,116,108,101,42,6,110,111,100,101,106,115,50,16,98,48,102,51,48,55,53,100,56,99,98,56,100,55,102,50,72,251,225,196,9,64,1]);
				
		var packet = new Buffer(20);
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
		
	};
	
	easysock.decode = function(packet){
		//到这里，一定是一个完整的包
		var seq = packet.readUInt32BE(8);
		
		var body = packet.slice(32);
		var msg = {};
		
		//do some decode
		
		msg.result = body.toString();
		msg.seq = seq;
		
		return msg;
		
	};
	return easysock;
}

var sock = createSocket();

function test(){
        sock.write({}, function(err, data){
        if (err){
            console.log("fail:" + err);
        }
        else{
            console.log("success");
            console.dir(data);
        }

    });
}

test();
test();
test();
test();
test();
sock.close();
//setInterval(test, 2000);
