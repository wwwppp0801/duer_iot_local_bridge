

## 文档地址

[https://www.yeelight.com/en_US/developer](https://www.yeelight.com/en_US/developer)


## 论坛
[http://forum.yeelight.com/c/yeelight-ceiling-light/l/top](http://forum.yeelight.com/c/yeelight-ceiling-light/l/top)

## 协议示例

### 开关

```javascript
{"id":1,"method":"toggle"}
```

### 调亮度

```javascript
{"id":1,"method":"set_bright","params":[40]};
```


### 打开夜灯模式

```javascript
{"id":1,"method":"set_scene", "params": ["nightlight", 100]}



```

### 5种模式

If the client keeps track of the Ceiling's brightness and color temperature info, it could achieve this by set_ct_abx interface. But I assume this is untrue for your case.

There's an extra parameter "mode" for set_power interface though, which can be used to switch to specific mode regardless of current power status.

Example 1: switch or turn on the light to last mode: 
{"method":"set_power","params":["on", "smooth", 500, 0]}
Example 2: switch or turn on the light to normal mode: 
{"method":"set_power","params":["on", "smooth", 500, 1]}
Example 2: switch or turn on the light to nightlight mode: 
{"method":"set_power","params":["on", "smooth", 500, 5]}
Note this interface requires/allows no brightness or color information.

Other values for mode (not supported by Yeelight Ceiling):
    2: switch to RGB mode 
    3: switch to HSV mode
    4. switch to color flow mode

    Hope this helps.
