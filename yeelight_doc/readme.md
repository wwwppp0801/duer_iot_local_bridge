

## 文档地址

[https://www.yeelight.com/en_US/developer](https://www.yeelight.com/en_US/developer)


## 论坛
[http://forum.yeelight.com/c/yeelight-ceiling-light/l/top](http://forum.yeelight.com/c/yeelight-ceiling-light/l/top)

## 协议示例

### 开关

```javascript
{"id":1,"method":"toggle"}
```

### 打开/关闭

```javascript
{"id":1,"method":"set_power","params":["on"]};
{"id":1,"method":"set_power","params":["off"]};
```


### 调亮度

```javascript
{"id":1,"method":"set_bright","params":[40]};
```



### 打开夜灯模式

```javascript
{"id":1,"method":"set_scene", "params": ["nightlight", 100]}
```
