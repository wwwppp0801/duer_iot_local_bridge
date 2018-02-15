const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const config = require('./config');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const ejs = require("ejs");
const utils = require("./utils");
const io = require('socket.io-client');



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
    res.redirect("/");
});

app.get("/",(req,res,next)=>{
    res.render("index",{
        storage:getStorage(),
    });
});

const storageFilename = "storage.json";
let storage;
function getStorage(){
    if(!storage){
        if (fs.existsSync(__dirname + "/" + storageFilename)) {
            storage = require("./" + storageFilename);
            if (storage) {
                config = Object.assign(config, storage);
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

app.get("/",(req,res,next)=>{
    //TODO index, show devices
});


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
    let socket=io(config.bot_service_uri,{
        autoConnect:true,
        reconnection:true,
    });
    console.log("create new socket:",socket.id);
    for(let eventName of ["connect","connect_error","connect_timeout",
        "error","disconnect","reconnect","reconnect_attempt",
        "reconnecting","reconnect_error","reconnect_failed",
        "ping","pong",
    ]){
        socket.on(eventName,()=>{console.log("socket ",socket.id,eventName)})
    }
    socket.emit("login",getStorage().key);
    
    socket.on("login_success",()=>{
        updateDevicesToBotService(socket);
    });

}

let devices=[];

function updateDevicesToBotService(socket){
    socket.emit("update_devices",devices);
}

if(getStorage().key){
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
