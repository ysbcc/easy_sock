/**
 * @fileoverview 一个方便进行socket网络操作的模块，解决socket复用，长连接、短连接，并发请求等问题
 * @author vicyao
 *
 */

'use strict';

var net = require('net');
var debug = require("debug")('easy_sock');

//需要通过创建实例来使用
var Easysock = module.exports = function(conf){
	//并发请求时的会话标识
	this.seq = 0;

	//保存请求的回调函数
	this.context = {};

	//全局唯一的一个socket
	this.socket = null;

	this.between_connect = false;
	this.between_close = false;

	this.calling_close = false;

	this.currentSession = 0;
	this.tmpGetTaskList = [];

	this.config = {
		ip:"",
		port : 0,
		/*
		* 是否保持连接状态，如果为false，则每次socket空闲下来后就会关闭连接
		*/
		keepAlive : false,
		timeout : 0
	};
	
	if (conf){
		this.setConfig(conf);
	}
	
	this.isReceiveComplete = null;
	this.encode = null;
	this.decode = null;
};

/**
 * 设置配置信息
 * @param {[Object]} obj   [description]
 */
Easysock.prototype.setConfig = function(conf){
	this.config = this.config || {};
	
	if(typeof(conf) == 'object'){
		for(var key in conf){
			this.config[key] = conf[key];
		}
	}	
};

/**
 * 当前是否已连接(或正在连接)
 * @type {Bool}
 */
Easysock.prototype.isAlive = false;

/**
 * 对外的获取数据的接口方法
 * @param  {[Array]} data   [任意类型，会直接传给encode函数]
 * @param  {[Function]} callback [回调函数(err, data)] 
 * @return {[string]}        [发送方式，wait等待socket连接，create创建socket，write复用socket]
 */
Easysock.prototype.write = function(data, callback){
	var self = this;
	//当在这两个状态的时候，先保留请求，等连接成功后再执行
	if (this.between_connect || this.between_close){

		this.tmpGetTaskList.push(function(err){
			if (err){
				callback(err);
			}
			else{
				self.write(data, callback);
			}			
		});
		return 'wait';
	}

	if (!this.config || !this.config.ip || !this.config.port){
		callback(new Error("needs config info:ip,port"));
	}
	else{
		
		if (this.socket){				
			//并发情况下靠这个序列标识哪个返回是哪个请求
			var seq = this.seq = (this.seq+1) % 10000;
			
			//编码
			try {
				var buf = this.encode(data, this.seq);
			} catch(e) {
				return callback(e);
			}
			if (!Buffer.isBuffer(buf)){
				callback(new Error("encode error"));
				return;
			}
			
			var timer = null;
			if(this.config.timeout){
				timer = setTimeout(function(){
					//返回超时
					self.context[seq] = null;
					self.currentSession--;
					
					tryCloseSocket(self);
					callback(new Error("request or decode timeout(" + self.config.timeout + "ms)"));
				}, this.config.timeout);
			}
			
			//保存当前上下文，都是为了并发
			this.context[this.seq] = {
				seq : this.seq,
				cb : function(err, result){
					if (timer){
						clearTimeout(timer);
					}
					callback(err, result);
				}
			};
			this.currentSession++;				
			
			//真正的写socket
			this.socket.write(buf);
			return 'write';
		}
		else{
			//第一次请求，初始化			
			this.tmpGetTaskList.push(function(err){
				if (err) {
					callback(err);
				}
				else {
					self.write(data, callback);
				}	
			});			
			initSocket(self);
			return 'create'
		}
	}
};

/**
 * 关闭连接
 */
Easysock.prototype.close = function(){
	if (this.socket && this.currentSession == 0 && this.tmpGetTaskList.length == 0 && (!this.between_close)){
		this.between_close = true;
		this.isAlive = false;
		this.socket.end();
	}
	else{
		//等所有请求处理完再关闭
		this.calling_close = true;
	}
}

/**
 * 初始化socket方法
 */
function initSocket(cur){
	var totalData = new Buffer('');
	
	var socket = cur.socket = new net.Socket({
		writable : true,
		readable : true
	});
	
	//socket.setTimeout(cur.config.timeout);
    socket.setKeepAlive(cur.config.keepAlive);
    
	var errorCall = function(msg){		
		//Timeout while connection or some connection error
		debug(msg);
		clearTimeout(connect_timer);
		
		//actually, I don't know which request is error and which cb function I shall call. So call them all.
		var cb;		
		while(cb = cur.tmpGetTaskList.shift()){
			cb(msg);
		}
		
		for (var key in cur.context){
			var ctx = cur.context[key];
			if (ctx && typeof(ctx.cb) == "function"){
				ctx.cb(msg);
                cur.context[key] = null;
                cur.currentSession--;
			}            
		}
		
		socket.destroy();		
	};
	
	var connect_timeout = cur.config.timeout ? cur.config.timeout * 3 : 3000;
	
	var connect_timer = setTimeout(function(){
		errorCall(new Error("easy_sock:TCP connect timeout(" + connect_timeout + ")"));
		cur.socket = null;
		cur.between_connect = false;
	}, connect_timeout);
	
	
	socket.on('connect',function(){
		//连接成功，把等待的数据发送掉
		debug("easy_sock connected");
		clearTimeout(connect_timer);
		cur.between_connect = false;
		
		//外部有可能会在发起连接但还没完成的时候发起请求，所以，把积累的请求都发了
		/* let get;
		while(get = cur.tmpGetTaskList.shift()) {
			get();
		} */

		function asyncWhile() {
			cur.tmpGetTaskList.shift()();
			setImmediate(function () {
				if (cur.tmpGetTaskList.length) {
					asyncWhile();
				}
			})
		}
		asyncWhile();
		
	}).on('data', function(data) {	
		if (!data || !Buffer.isBuffer(data) || data.length <= 0 ){
			//error
			debug("buffer error:" + data);
			errorCall(new Error("receive error, illegal data"));
			socket.end();						
		}
		else{

			totalData = Buffer.concat([totalData, data]);
			var packageSize = cur.isReceiveComplete(totalData);
			if(packageSize){				
				//网络有可能一次返回n个结果包，需要做判断，是不是很bt。。
				var totalSize = totalData.length;
				if (packageSize == totalSize){
					//只有一个包，这是大多数情况					
					handleData(cur, totalData, errorCall);
				}
				else{
					//存在多个包，这里要做一些buffer复制的操作，会消耗一定性能					
					
					while(true){
						var buf = totalData.slice(0, packageSize);
						handleData(cur, buf, errorCall);						
						totalData = totalData.slice(packageSize, totalData.length);
						packageSize = cur.isReceiveComplete(totalData);
						
						if (packageSize >= totalData.length){
							//last one
							handleData(cur, totalData, errorCall);
							break;
						}
						else if (packageSize == 0){
							//包还没接收完
							return;
						}
					}					
				}
				
				//清空buffer，给下一次请求使用
				totalData = new Buffer('');				
			}
			else{
				//没接收完的话继续接收
				//console.log("keep looking");
			}
			
		}					
		
	}).on('error',function(e){
		errorCall(e);
		socket.destroy();
		cur.socket = null;
		cur.between_connect = false;
       
	}).on('close',function(){
		cur.between_close = false;
		cur.socket = null;
        cur.isAlive = false;
		cur.currentSession = 0;
		debug("easy_sock closed");
		if (cur.tmpGetTaskList.length){
			//刚关闭socket，又来新请求
			cur.tmpGetTaskList.shift()();
		}
	});
		
	//连接也有可能会超时阻塞
	socket.connect({
		port : cur.config.port,
		host : cur.config.ip
	});
	
	cur.between_connect = true;
	cur.isAlive = true;
}

/**
 * 处理返回数据，回调
 */
function handleData(cur, buf, errorCal){
	var obj;
	try {
		obj = cur.decode(buf);
	} catch(e) {
		//error
		debug("decode error:");
		cur.socket.destroy();
	}
	
	if (typeof obj != "object"){
		//error
		debug("easy_sock:handle error:" + obj);
		cur.socket.destroy();
		return;
	}
	
	var ctx = cur.context[obj.seq];
	if (!ctx){
		//找不到上下文，可能是因为超时，callback已执行，直接放弃当前数据
		//console.log("Can't find context. This should never happened!" + obj.seq);
		//socket.destroy();
		return;
	}

	cur.context[obj.seq] = null;
	cur.currentSession--;
	
	tryCloseSocket(cur);

	//遵循nodejs最佳实践，第一个参数是err，第二个才是返回结果
	if (!obj.result && obj.error) {
		ctx.cb(obj.error, null);

	} else {
		ctx.cb(null, obj.result);
	}
}

/**
 * 尝试关闭socket
 */
function tryCloseSocket(cur){

	if ((cur.calling_close || !cur.config.keepAlive) && cur.currentSession == 0 && cur.tmpGetTaskList.length == 0){	
		cur.between_close = true;
		cur.calling_close = false;
		cur.isAlive = false;
		//调用end()之后sock会自动close，消息回调会先触发end，再触发close
		cur.socket.end();
	}
}