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
                        device.setInfo(deviceInfo);
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
        setInterval(()=>{
            this.devices.forEach((device)=>{
                device.getActiveBright();
            });
        },30000);
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
        device.on("error",()=>{
            this.devices=this.devices.filter(d=>d!==device);
            console.log("device error",device.getInfo());
            this.emit("device_error",device);
        });
        this.devices.push(device);
        this.emit("new_device",device);
        return device;
    }
    discover(timeout=3000){
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
            },timeout);
        });
    }
}

class YeelightDevice extends EventEmitter{
    static create(deviceInfo){
        return new YeelightDevice(deviceInfo);
    }
    constructor(deviceInfo){
        super();
        this.on("message",(message)=>{
            console.log("on message",message);
        });
        this.deviceInfo=deviceInfo;
        this.setStatus("not_connect");
        this.connect(deviceInfo.host,deviceInfo.port);
        this.on("error",()=>{
            console.log("device error!!!");
            this.connectedPromise=Promise.reject();
            if(this.socket){
                this.socket.removeAllListeners();
                this.socket=null;
            }
        });
    }
    setInfo(deviceInfo){
        Object.assign(this.deviceInfo,deviceInfo);
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
    getActiveBright(){
        return new Promise((resolve,reject)=>{
            this.once("message",(message)=>{
                // { id: 0, result: [ '40' ] }
                resolve(parseInt(message.result[0],10));
            });
            this.send("get_prop","active_bright");
        });
    }
    
    send(method,...args){
        //{ "id": 1, "method": "set_power", "params":["on", "smooth", 500]}
        let realSend= ()=>{
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
            try{
                this.socket.write(Buffer.from(JSON.stringify(cmd)+"\r\n"));
            }catch(e){
                this.emit("error");
            }
        };
        this.getConnectedPromise().then(realSend);
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
            console.log("connect to ",host,port);
            this.setStatus("connecting");
            let socket = new net.Socket();
            socket.connect(port,host,()=>{
                this.setStatus("connected");
                resolve();
            });
            let onError = ()=>{
                this.emit("error");
            };
            socket.on("error",onError);
            socket.on("close",onError);
            socket.on("end",onError);
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
        this.connectedPromise.catch(e=>{
            console.log("reconnect",host,port);
            this.connect(host,port);
        });
    }
}

module.exports=YeelightController;

if(module === require.main) {
    let controller=YeelightController.getInstance();
    controller.discover();
    controller.on("new_device",(device)=>{
        console.log("new_device",device.getId());
        /*
        if(device.getInfo("model")==="ceiling3"){
            ///device.send("set_name","书房的灯");
            //device.send("get_prop","active_bright");
            device.send("set_power", "on","smooth", 500, 1);
                    
        }
        /*
        if(device.getInfo("model")==="stripe"){
            device.send("set_name","灯带");
        }
        if(device.getInfo("model")!=="ceiling3"){
            return;
        }
        */
        //开关
        //device.send("toggle");
        //
        //把当前状态设置成默认值
        //device.send("set_default");
        //打开夜灯模式
        //device.send("set_scene","nightlight",100);
        //调亮度
        //device.send("set_bright",40);
        //打开
        //device.send("set_power","off");
        //关闭
        //device.send("set_power","off");
        device.on("message",(message)=>{
            console.log("on message",message);
        });
    });
}
module.exports.YeelightController=YeelightController;
module.exports.YeelightDevice=YeelightDevice;
