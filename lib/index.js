const fs = require('fs')
const path = require('path')
const upload = require('./upload')
const config = require('./config')
const qiniu = require('qiniu')

// 同步遍历文件
function eachFileSync(dir, findOneFile){
    const stats = fs.statSync(dir)
    if(stats.isDirectory()){
        fs.readdirSync(dir).forEach(file => {
            eachFileSync(path.join(dir, file), findOneFile)
        })
    }else{
        findOneFile(dir, stats)
    }
}

// 处理Ueditor上传保存路径
function setFullPath(dest) {
    const date = new Date()

    const map = {
        't': date.getTime(), // 时间戳
        'm': date.getMonth() + 1, // 月份
        'd': date.getDate(), // 日
        'h': date.getHours(), // 时
        'i': date.getMinutes(), // 分
        's': date.getSeconds(), // 秒
    };

    dest = dest.replace(/\{([ymdhis])+\}|\{time\}|\{rand:(\d+)\}/g, function(all, t, r){
        let v = map[t];
        if(v !== undefined){
            if(all.length > 1){
                v = '0' + v
                v = v.substr(v.length-2)
            }
            return v;
        }else if(t === 'y'){
            return (date.getFullYear() + '').substr(6 - all.length);
        }else if(all === '{time}'){
            return map['t']
        }else if(r >= 0){
            return Math.random().toString().substr(2, r)
        }
        return all
    });

    return dest
}

/**
 * ueditor上传方法
 * @param  {string/array} dir    静态目录，若是数组[dir, UEconfig]第2个为Ueditor配置
 * @param  {object} options      upload方法参数
 * @param  {object} qiniuConf      七牛云对象储存配置
 * @return {function}            Ueditor Controller
 */
const ueditor = function(dir, options, qiniuConf) {
    const publicDir = path.resolve(dir)
    const conf = Object.assign({}, config, options || {}) //ueditor配置
    const uploadType = {
        [conf.imageActionName]: 'image',
        [conf.scrawlActionName]: 'scrawl',
        [conf.catcherActionName]: 'catcher',
        [conf.videoActionName]: 'video',
        [conf.fileActionName]: 'file',
    }
    const listType = {
        [conf.imageManagerActionName]: 'image',
        [conf.fileManagerActionName]: 'file',
    }
    
    // Ueditor Controller
    return async (ctx, next) => {
        let {action, start = 0} = ctx.query
        start = parseInt(start)

        // 上传文件
        if(Object.keys(uploadType).includes(action)){
            let pathFormat = setFullPath(conf[uploadType[action] + 'PathFormat']).split('/')
            let filename = pathFormat.pop()
            let FilePath = ''
            let fileRes = {}
            
            try {
                // 涂鸦类型图片
                if(action === conf.scrawlActionName){
                    const base64Data = ctx.request.body[conf[uploadType[action] + 'FieldName']]
                    if(base64Data.length > conf[uploadType[action] + 'MaxSize']){
                        throw new Error('File too large')
                    }
                    ctx.req.file = upload.base64Image(base64Data, publicDir, {
                        destination: path.join(publicDir, ...pathFormat),
                        filename: filename
                    })
                    ctx.body = Object.assign({state: 'SUCCESS'}, upload.fileFormat(ctx.req.file))
                }else{
                    await upload(publicDir, {
                        storage: upload.diskStorage({
                            destination: path.join(publicDir, ...pathFormat),
                            filename (req, file, cb) {
                                if(filename === '{filename}'){
                                    filename = file.originalname
                                }else{
                                    filename += upload.getSuffix(file.originalname)
                                }
                                FilePath = filename
                                cb(null, filename)
                            }
                        }),
                        limits: {
                            fileSize: conf[uploadType[action] + 'MaxSize']
                        },
                        allowfiles: conf[uploadType[action] + 'AllowFiles']
                    }, options || {}).single(conf[uploadType[action] + 'FieldName'])(ctx,next)
                    fileRes = upload.fileFormat(ctx.req.file);

                    if(qiniuConf && typeof qiniuConf === 'object') {
                        const {ACCESS_KEY, SECRET_KEY,DOMAIN, BUCKET} = qiniuConf
                        //要长传文件的本地路径
                        FilePath = path.join(publicDir, ...pathFormat) + '\\' + FilePath;
                        console.log(FilePath);
                        //需要填写你的 Access Key 和 Secret Key，定义鉴权对象mac
                        
                        var mac = new qiniu.auth.digest.Mac(ACCESS_KEY, SECRET_KEY);
                       
                        // 生成上传凭证
                        var options = {
                            scope: BUCKET,
                        };
                        var putPolicy = new qiniu.rs.PutPolicy(options);
                        var uploadToken=putPolicy.uploadToken(mac);
                        
                        var config = new qiniu.conf.Config();
                        // 空间对应的机房
                        config.zone = qiniu.zone.Zone_z0;
                        //构造上传函数
                        // function uploadFile(uptoken, key, localFile) {
                        //     var extra = new qiniu.io.PutExtra();
                        //     qiniu.io.putFile(uptoken, key, localFile, extra, function(err, ret) {
                        //         if(!err) {
                        //         // 上传成功， 处理返回值
                        //         console.log(ret.hash, ret.key, ret.persistentId);       
                        //         } else {
                        //         // 上传失败， 处理返回代码
                        //         console.log(err);
                        //         }
                        //     });
                        // }
                        function uploadFile(uploadToken, key, localFile) {
                            return new Promise(function(resolve, reject) {
                                var formUploader = new qiniu.form_up.FormUploader(config);
                                var putExtra = new qiniu.form_up.PutExtra();
                                // 文件上传
                                formUploader.putFile(uploadToken, key, localFile, putExtra, function(respErr, respBody, respInfo) {
                                if (respErr) {
                                    reject(respErr);
                                }
                                if (respInfo.statusCode == 200) {
                                    resolve(respBody);
                                } else {
                                    console.log(respInfo.statusCode);
                                    console.log(respBody);
                                }
                                });
                            })
                        }
                        var resp = await uploadFile(uploadToken, filename, FilePath);
                        fileRes.url = DOMAIN + resp.key;
                        console.log('resp' + JSON.stringify(resp));
                        // await cos.sliceUploadFile({
                        //     Bucket,
                        //     Region,
                        //     FilePath,
                        //     Key: filename
                        // }, function(err, data) {
                        //     if(err) {
                        //         throw new Error(err)
                        //     } else {
                        //         fileRes.url = 'http://' + data.Location
                        //     }
                        // })
                    }
                    console.log('fileres' + JSON.stringify(fileRes));
                    ctx.body = Object.assign({state: 'SUCCESS'}, fileRes)
                }
                              
            } catch (err) {
                ctx.body = {state: err.message}
            }
        }
        // 获取图片/文件列表
        else if(Object.keys(listType).includes(action)){
            let files = []
            eachFileSync(path.join(publicDir, conf[listType[action] + 'ManagerListPath']), (file, stat) => {
                if(conf[listType[action] + 'ManagerAllowFiles'].includes(upload.getSuffix(file))){
                    const url = file.replace(publicDir, '').replace(/\\/g, '\/')
                    const mtime = stat.mtimeMs
                    files.push({url, mtime})
                }
            })
            ctx.body = {
                list: files.slice(start, start + conf[listType[action] + 'ManagerListSize']),
                start: start,
                total: files.length,
                state: 'SUCCESS'
            }
        }
        // 返回Ueditor配置给前端
        else if(action === 'config'){
            ctx.body = conf
        }
        else{
            ctx.body = {state: 'FAIL'}
        }
    }
}

exports = module.exports = ueditor
exports.eachFileSync = eachFileSync
exports.setFullPath = setFullPath
