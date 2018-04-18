## koa2-ueditor-qiniu

koa2 版的 UEditor 百度编辑器，支持修改 UEditor 的配置，并可传入七牛云对象存储的配置，同时将图片文件传送到七牛云对象存储上。

基于sealice的koa2-ueditor修改，koa2-ueditor项目地址：https://github.com/sealice/koa2-ueditor。
### Installation

```
 npm install koa2-ueditor-qiniu --save
```

### Usage


使用时需传入三个参数，path、option、qiniuConf，分别是静态目录、UEditor配置对象和七牛配置对象
```javascript
// 直接写路由
// 然后修改 web 端的 ueditor.config.js 配置 serverUrl 为对应路由地址
// serverUrl: "/editor/controller"
//修改静态目录等，cos配置根据cos的API修改 https://cloud.tencent.com/document/product/436/8629

const router = require('koa-router')()
const ueditor = require('koa2-ueditor')

router.all('/editor/controller', ueditor('public',{
	"imageAllowFiles": [".png", ".jpg", ".jpeg"]
	"imagePathFormat": "/upload/ueditor/image/{yyyy}{mm}{dd}/{filename}"  // 保存为原文件名
},{
	ACCESS_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 
	SECRET_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
	DOMAIN: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXX',	//外链域名
	BUCKET: 'vino'
}))
```
