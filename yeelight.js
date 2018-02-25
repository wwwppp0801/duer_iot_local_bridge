const EventEmitter = require("events");
const dgram = require('dgram'); 
const udpSocket = dgram.createSocket('udp4');
const { URL } = require('url');
const net = require("net");
const carrier = require('carrier');

class YeelightController extends EventEmitter{
    static getInstance(){
        if(!YeelightController.instance){
            YeelightController.instance=new YeelightController();
        }
        return YeelightController.instance;
    }
    constructor(){
        super();
        this.devices=[];
        udpSocket.on('message',(buffer,rinfo)=>{
            console.log(`receive message from ${rinfo.address}:${rinfo.port}`);
            let deviceInfo = this.parseDeviceInfo(buffer);
            if(!deviceInfo){
                return;
            }
            for(let device of this.devices){
                let info = device.getInfo();
                if(info.id === deviceInfo.id){
                    if(info.host === deviceInfo.host &&
                        info.port === deviceInfo.port){
                        console.log("ingore device id", info.id);
                        return;
                    }else{
                        this.devices.filter(_device => _device !== device);
                        console.log("replaced device id", info.id);
                    }
                    break;
                }
            }
            console.log(deviceInfo);
            this.connect(deviceInfo);
        });
    }
    getDevices(){
        return this.devices;
    }
    parseDeviceInfo(buffer){
        // buffer example
        /* HTTP/1.1 200 OK
Cache-Control: max-age=3600
Date:
Ext:
Location: yeelight://192.168.1.239:55443
Server: POSIX UPnP/1.0 YGLC/1
id: 0x000000000015243f
model: color
fw_ver: 18
support: get_prop set_default set_power toggle set_bright start_cf stop_cf set_scene cron_add cron_get cron_del set_ct_abx set_rgb
*/
        let rawString=buffer.toString();
        let lines=rawString.split("\r\n");
        let deviceInfo={};
        //console.log(rawString);
        for(let line of lines.slice(1)){
            let idx=line.indexOf(":");
            if(idx===-1){
                //console.error("error line:",line);
                continue;
            }
            let tmp=[line.substr(0,idx).trim(),line.substr(idx+1).trim()];
            if(tmp[0] && tmp[1]){
                deviceInfo[tmp[0]]=tmp[1];
            }
        }
        //console.log(deviceInfo);
        try{
            let url=new URL(deviceInfo["Location"]);
            deviceInfo.host=url.hostname;
            deviceInfo.port=url.port;
            return deviceInfo;
        }catch(e){
            console.log("Location error:",deviceInfo["Location"]);
        }
    }
    connect(deviceInfo){
        let device=YeelightDevice.create(deviceInfo);
        this.devices.push(device);
        this.emit("new_device",device);
        return device;
    }
    discover(){
        return new Promise((resolve,reject)=>{
            let msg = "M-SEARCH * HTTP/1.1\r\n" 
            msg = msg + "HOST: 239.255.255.250:1982\r\n"
            msg = msg + "MAN: \"ssdp:discover\"\r\n"
            msg = msg + "ST: wifi_bulb"
            let intervalId=setInterval(()=>{
                udpSocket.send(Buffer.from(msg),1982,"239.255.255.250");
            },500);
            setTimeout(()=>{
                clearInterval(intervalId);
                resolve();
            },3000);
        });
    }
}

class YeelightDevice extends EventEmitter{
    static create(deviceInfo){
        return new YeelightDevice(deviceInfo);
    }
    constructor(deviceInfo){
        super();
        this.deviceInfo=deviceInfo;
        this.setStatus("not_connect");
        this.connect(deviceInfo.host,deviceInfo.port);
    }
    getInfo(field=null){
        if(field===null){
            return this.deviceInfo;
        }else{
            return this.deviceInfo[field];
        }
    }
    getId(){
        return this.deviceInfo.id;
    }
    
    send(method,...args){
        //{ "id": 1, "method": "set_power", "params":["on", "smooth", 500]}
        this.getConnectedPromise().then(()=>{
            let cmd={
                id:this.getId(),
                method:method,
            };
            if(args && args.length>0){
                cmd.params=args;
            }else{
                cmd.params=[];
            }
            console.log("send msg:",cmd);
            this.socket.write(Buffer.from(JSON.stringify(cmd)+"\r\n"));
        });
    }
    getConnectedPromise(){
        if(this.connectedPromise){
            return this.connectedPromise;
        }else{
            return Promise.reject();
        }
    }
    setStatus(eventName){
        console.log("status changed",this.getId(),eventName);
        this.status=eventName;
        this.emit(eventName);
    }
    connect(host,port){
        this.connectedPromise=new Promise((resolve,reject)=>{
            this.setStatus("connecting");
            let socket = new net.Socket();
            socket.connect(port,host,()=>{
                this.setStatus("connected");
                resolve();
            });
            socket.on("error",reject);
            socket.on("close",reject);
            socket.on("end",reject);
            let my_carrier = carrier.carry(socket);
            my_carrier.on('line',(line)=>{
                let ret;
                try{
                    ret=JSON.parse(line);
                }catch(e){
                    console.log('got one error line: ' , line);
                    return;
                }
                if(ret.method==="props"){
                    this.deviceInfo=Object.assign(this.deviceInfo,ret.params);
                    //console.log(this.deviceInfo);
                }
                this.emit("message",ret);
            });
            this.socket=socket;
        });
    }
}

module.exports=YeelightController;

if(module === require.main) {
    let controller=YeelightController.getInstance();
    controller.discover();
    controller.on("new_device",(device)=>{
        console.log("new_device",device);
        if(device.getInfo("model")==="ceiling3"){
            device.send("set_name","书房的灯");
        }
        if(device.getInfo("model")==="stripe"){
            device.send("set_name","灯带");
        }
        //device.send("toggle");
        //
        //把当前状态设置成默认值
        //device.send("set_default");
        //打开夜灯模式
        //device.send("set_scene","nightlight",100);
        //device.send("set_bright",40);
        device.on("message",(message)=>{
            console.log("on message",message);
        });
    });
}
