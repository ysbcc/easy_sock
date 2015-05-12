# easy_sock

快速开发基于tcp连接的二进制网络协议接口的nodejs模块

A fast way to create TCP based socket apis with nodejs(English version below)

------
easy_sock帮你快速开发基于tcp协议的接口，快速打通nodejs跟其他私有协议server的交互。让你做到像调用本地接口一样调用server api。

easy_sock主要它解决以下问题：
- 处理网络请求中各种复杂的异步调用
- 屏蔽tcp连接细节，像调用本地函数一样调用网络接口
- 支持长连接、socket复用，以及并发请求
- 在合适的时候自动帮你断开连接或重新建立连接

如果你的网络协议符合以下特性，便可以使用easy_sock：
- 基于tcp连接，通过二进制或文本协议封包
- 符合一来一回的应答试请求
- 支持通过请求序列号的方式来接收和返回并发请求包(大部分网络协议都支持，否则无法支持并发)


## 使用方便
下面通过一个基于easy_sock封装的cmem接口，来演示如何使用：
```javascript
var Cmem = require("cmem_core");
var client = new Cmem({
  ip:"127.0.0.1",
  port:9101,
	keepAlive : false
});

client.getData("key1",function(err, data){...});
client.getData("key2",function(err, data){...});
client.getData("key3",function(err, data){
  client.getData("key4",function(err, data){...});
});
```
这是一个短连接的例子(keepAlive=false)。
可以看到，代码里没有connect、close等方法的调用，因为easy_sock已经帮你封装好了，会在第一次请求的时候建立连接，在没有任何请求后断开连接。注意到代码里面实际包含了并发请求和串行请求，不用担心会同时发起多个tcp connection，所有请求只会共享一个tcp连接。

注意到key4是在key3回调后才发起请求的，这时候有可能因为前三个请求已经返回而断开连接。遇到这种情况下，程序会再次发起一个新连接完成请求，然后断开。
当keepAlive=true时，会使用长连接方式，这时候必须主动调用close()方法来断开连接。

## 三步完成接口开发
你只需要实现以下3个方法，便可完成任何一种tcp网络请求：

- **encode**:将需要发送的数据按协议进行二进制编码
- **decode**:将接收到的包进行解码，转换成js可操作的格式
- **isReceiveComplete**:判断当前数据包是否完整

任何类型的tcp协议，只要实现了这3个接口，剩下的事情都一样。这就是为什么easy_sock能存在的原因:)

## 简单例子

下面通过一个demo演示各接口的使用方法：

```javascript
function createSocket(){
	var easysock = new EasySock();
	easysock.setConfig({
		ip : "127.0.0.1",
		port : 9101,	
		keepAlive : false,	
		timeout : 50	//0 by default
	});
	
	//check if the package is received complete
	easysock.isReceiveComplete = function(packet){		
		var len = 0;	
		//your code here..
		
		/* 
		* Check if the package is received complete. If not, return 0.
		* Otherwise return length of the FIRST complete package.
		* If the buffer contains more than one package--it usually happens when package size is small--, 
		* just return the size of first one(not total).
		*/
		return len;
	};
	
	//encode the data to binary 
	easysock.encode = function(data, seq){
		var packet = new Buffer(100);
		packet.writeInt32BE(seq, 0);
		//your code here..

		//Translate the "data"(usually is a json or string) into a Buffer, and return the Buffer
		return packet;		
	};
	
	//decode the buffer
	easysock.decode = function(packet){
		//The packet is a Buffer with a complete response. So decode the buffer to other type of data.
		var seq = packet.readInt32BE(0);
		//do sth else
			
		//must return the result and seq
		return {
			result : {},
			seq : seq
		};
		
	};
	return easysock;
}

var client = createSocket();

client.write({
		key : ""
	}, 
	function(err, data){
		if (err){
			//err is a string
			console.log("fail:" + err);
		}
		else{
			console.log("success");
			console.dir(data);
		}
	}
);
```

##English version
easy_sock helps you to build a reliable, friendly used socket Api, with any kinds of binary protocols. All you need to do is finish the following functions, then an Api is accomplish.

> * encode(data, seq)
> * decode(packet)
> * isReceiveComplete(packet) 

As a matter of fact, no matter what protocol it is, all works are the same except these three functions. That's the reason why easy_sock is writen.
