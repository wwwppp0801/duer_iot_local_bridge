const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const config = require('./config');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const ejs = require("ejs");
const utils = require("./utils");
const io = require('socket.io-client');
const YeelightController = require('./yeelight');





let app = express();


app.set('views',__dirname + '/views');
app.engine('.html', ejs.__express);
app.set("view engine", "html"); 
app.use(express.static(__dirname + '/webroot'));

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(cookieParser());



app.get("/get_control_key",(req,res,next)=>{
    let redirect_uri="http://"+config.local_ip+":"+config.local_port+"/control_key_callback";
    res.redirect(config.bot_service_uri+"/get_control_key?redirect_uri="+encodeURIComponent(redirect_uri));
});

app.get("/control_key_callback",(req,res,next)=>{
    //store req.query.key
    if(!req.query.key){
        res.send(JSON.stringify( {
            "status":-1,
            "msg":"no key"
        }));
        return;
    }
    setStorage("key",req.query.key);
    initConnection();
    res.redirect("/");
});

app.post("/change_name",async (req,res,next)=>{
    //store req.query.key

    YeelightController.getInstance().getDevices().forEach((device)=>{
        //console.log("compare device;",device.getId(),command.device_id);
        if(device.getId()!=req.body.id){
            return;
        }
        device.send("set_name",req.body.name);
    });
    await YeelightController.getInstance().discover(1100);
    updateDevicesToBotService();
    res.redirect("/");
});

app.get("/refresh_devices",async (req,res,next)=>{
    await YeelightController.getInstance().discover(2000);
    updateDevicesToBotService();
    res.redirect("/");
});

app.get("/",(req,res,next)=>{
    res.render("index",{
        storage:getStorage(),
        devices:YeelightController.getInstance().getDevices(),
    });
});

const storageFilename = "storage.json";
let storage;
function getStorage(){
    if(!storage){
        if (fs.existsSync(__dirname + "/" + storageFilename)) {
            storage = require("./" + storageFilename);
            if (storage) {
                Object.assign(config, storage);
            }
        }else{
            storage={};
        }
    }
    return storage;
}
function setStorage(key, value) {
    let storage=getStorage();
    storage[key] = value;
    if (value === null) {
        delete(storage[key]);
    }
    fs.writeFileSync(__dirname + "/" + storageFilename, JSON.stringify(storage));
    return storage;
}



let server = require('http').Server(app);
/*
let io = require('socket.io')(server);
io.on('connection', function (socket) {
    //socket.emit('to_client', message.getJSON());
    socket.on('disconnect', function () {
        //TODO remove connetion from connetion manager
    });
    socket.on('login', function (request) {
        if(request.key){
            //TODO  check key, add to connetion manager
        }
    });
});
*/

console.log("listen at:",config.local_ip,":",config.local_port);
server.listen(config.local_port,config.local_ip);



let socket;
function initConnection(){
    if(socket){
        socket.removeAllListeners();
        socket.close();
    }
    socket=io(config.bot_service_uri,{
        autoConnect:true,
        reconnection:true,
    });
    socket.id=utils.uuid();
    console.log("create new socket:",socket.id);
    for(let eventName of ["connect","connect_error","connect_timeout",
        "error","disconnect","reconnect","reconnect_attempt",
        "reconnecting","reconnect_error","reconnect_failed",
        //"ping","pong",
    ]){
        socket.on(eventName,()=>{
            console.log("socket ",socket.id,eventName);
            if(["connect","reconnect"].indexOf(eventName)!=-1){
                socket.emit("login",{key:getStorage().key});
            }
        });
    }
    socket.on("login_success",async ()=>{
        console.log("on login_success!");
        let controller=YeelightController.getInstance();
        await controller.discover();
        updateDevicesToBotService();
    });
    socket.on("login_fail",()=>{
        console.log("on login_fail!");
    });
    socket.on("command",(command)=>{
        console.log("on command",command);
        YeelightController.getInstance().getDevices().forEach(async (device)=>{
            //console.log("compare device;",device.getId(),command.device_id);
            if(device.getId()!=command.device_id){
                return;
            }
            console.log("find device",device.getId());
            if(command.request.header.name=="TurnOnRequest"){
                console.log("send power on");
                device.send("set_power","on");
            }
            if(command.request.header.name=="TurnOffRequest"){
                console.log("send power off");
                device.send("set_power","off");
            }
            if(command.request.header.name=="IncrementBrightnessPercentageRequest"){
                //console.log("send power off");
                //device.send("set_power","off");
                let bright = await device.getActiveBright();
                if(bright==100){
                    device.send("set_power", "on","smooth", 500, 1);
                }
                device.send("set_bright",Math.min(bright+30,100));
            }
            if(command.request.header.name=="DecrementBrightnessPercentageRequest"){
                //console.log("send power off");
                //device.send("set_power","off");
                let bright = await device.getActiveBright();
                if(bright<=10){
                    device.send("set_power", "on","smooth", 500, 5);
                }
                
                
                //device.send("set_scene","nightlight",100);
                
                device.send("set_bright",Math.max(bright-30,0));
            }
        });
    });

}


async function updateDevicesToBotService(){
    //update devices
    let controller=YeelightController.getInstance();
    controller.getDevices();
    if(socket){
        console.log("update_devices: ",{devices:controller.getDevices().map(device=>device.getInfo())});
        socket.emit("update_devices",{devices:controller.getDevices().map(device=>device.getInfo())});
    }
}

if(getStorage().key){
    console.log("connection key:",getStorage().key);
    initConnection();
}

//跳转流程：
//http://local.bridge/get_control_key
//http://bot.service/get_control_key?redirect_uri={http://local.bridge/control_key_callback}
//http://bot.service/login?redirect_uri={http://bot.service/get_control_key?redirect_uri={http://local.bridge/control_key_callback}}
//http://openapi.baidu.com/oauth?redirect_uri={http://bot.service/baidu_oauth_callback}&state={redirect_uri="http://bot.service/get_control_key?redirect_uri={http://local.bridge/control_key_callback}"}
//http://bot.service/baidu_oauth_callback?code={code}&state={redirect_uri="http://bot.service/get_control_key?redirect_uri={http://local.bridge/control_key_callback}"}
//http://bot.service/get_control_key?redirect_uri={http://local.bridge/control_key_callback}
//http://local.bridge/control_key_callback?key={key}
//
//
//http://192.168.1.101:8080/control_key_callback
//test url: http://duer-iot.wangp.org/get_control_key?redirect_uri=http%3A%2F%2F192.168.1.101%3A8080%2Fcontrol_key_callback
//
