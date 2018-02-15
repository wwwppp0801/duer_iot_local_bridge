## 整体流程

![流程](design.png)

## bot服务：

[bot服务](http://wangp.org:8081/wangpeng/duer_iot_bot_service)

## bridge 服务

面向用户：

    * 登录、授权
        * 跳转到bot服务，完成登录、授权，最后获得key
        * 设置key到当前用户
    * 登录授权完成的话，带key，发起到bot服务的长连接
    * 发现设备
        * 验证access token

面向bot：

    * 发现设备
        * 返回当前设备列表
    * 控制设备
        * 本地控制（miio等协议）
