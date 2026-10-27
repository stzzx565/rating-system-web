/**
 * 视频解析 API 封装（网页版）
 * 对应原小程序 utils/videoApi.js，调用本机自建免费解析服务（不依赖腾讯云）
 * 全局对象：window.VideoApi（页面用 const videoApi = require(...) 也可，wx-shim 会兜底）
 */
(function () {
  'use strict';

  // 后端 API 地址（js/app.js 的 globalData.VIDEO_API_BASE）
  // ''（空串）= 同源相对路径，由 serve.js 代理；外网由 loadVideoApiConfig() 自动填入隧道地址
  function getBaseUrl() {
    var base = window.App && window.App.globalData.VIDEO_API_BASE;
    return (base === undefined || base === null) ? 'http://192.168.1.12:8080' : base;
  }

  // 等待接口地址就绪（本机立即完成；外网等待云端配置返回）
  function readyBase() {
    var p = window.App && window.App._configPromise;
    return Promise.resolve(p).catch(function () {}).then(function () { return getBaseUrl(); });
  }

  // 外网且尚未配置接口地址时的友好提示
  function connErrorDetail(rawMsg) {
    var isLocal = window.App && window.App.isLocalHost && window.App.isLocalHost();
    if (!isLocal && !getBaseUrl()) {
      return '视频解析服务暂未开启（管理员电脑未开机或外网隧道未启动），请稍后再试';
    }
    if (!isLocal) return '无法连接视频解析服务，请稍后重试';
    return rawMsg;
  }

  // 解析视频链接
  async function parseVideo(url) {
    var base = await readyBase();
    return new Promise(function (resolve, reject) {
      wx.request({
        url: base + '/api/hybrid/video_data',
        method: 'GET',
        data: { url: url, minimal: true },
        timeout: 60000,
        success: function (res) {
          if (res.statusCode === 200 && res.data && res.data.code === 200) {
            resolve(res.data.data);
          } else {
            const msg = (res.data && (res.data.message || res.data.data)) || '解析失败，请检查链接是否正确';
            reject(new Error(typeof msg === 'string' ? msg : '解析失败，请检查链接是否正确'));
          }
        },
        fail: function (err) {
          const errMsg = (err && err.errMsg) || '';
          if (errMsg.indexOf('timeout') !== -1) {
            reject(new Error('请求超时:解析服务未启动或网络慢，请检查服务后重试'));
          } else {
            reject(new Error(connErrorDetail('无法连接解析服务:' + (errMsg.slice(0, 80) || '请确认已运行 视频解析服务.bat 且在同一网络'))));
          }
        }
      });
    });
  }

  // 下载文件（网页版经 wx-shim 的 fetch 实现）
  function doDownload(url) {
    return new Promise(function (resolve, reject) {
      wx.downloadFile({
        url: url,
        success: function (res) {
          if (res.statusCode === 200 || res.statusCode === 206) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error('下载失败，HTTP ' + res.statusCode));
          }
        },
        fail: function (err) {
          const errMsg = (err && err.errMsg) || '';
          reject(new Error('下载失败:' + (errMsg.slice(0, 150) || '请检查网络')));
        }
      });
    });
  }

  // 防盗链严格、必须走后端代理的 CDN（直链必被拒）
  function needsProxy(u) {
    return /douyinvod\.com|douyinpic\.com|douyin\.com|tiktokv\.com|tiktokcdn/.test(u);
  }

  // 下载媒体到临时路径。
  // 速度优化:非防盗链域名直连优先(浏览器直连 CDN,完全不占隧道,实测快 4~5 倍),
  // 失败(防盗链/CORS/网络)自动回退后端代理;douyin 等严格防盗链域名仍代理优先。
  async function fetchMedia(directUrl) {
    var base = await readyBase();
    var proxiedUrl = base + '/proxy?url=' + encodeURIComponent(directUrl);
    var order = needsProxy(directUrl) ? [proxiedUrl, directUrl] : [directUrl, proxiedUrl];
    var lastErr;
    for (var i = 0; i < order.length; i++) {
      try {
        return await doDownload(order[i]);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('保存失败:' + ((lastErr && lastErr.message) || '').slice(0, 150));
  }

  // 下载视频：网页版 = 触发浏览器下载（微信内可直接长按页面视频保存相册）
  async function saveVideoToAlbum(videoUrl) {
    wx.showLoading({ title: '正在下载...', mask: true });
    try {
      const tempFilePath = await fetchMedia(videoUrl);
      await new Promise(function (resolve, reject) {
        wx.saveVideoToPhotosAlbum({
          filePath: tempFilePath,
          success: resolve,
          fail: function (err) {
            reject(new Error('保存失败:' + ((err && err.errMsg) || '').slice(0, 80)));
          }
        });
      });
      wx.hideLoading();
      wx.showToast({ title: '已开始保存', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      throw err;
    }
  }

  window.VideoApi = {
    parseVideo: parseVideo,
    saveVideoToAlbum: saveVideoToAlbum,
    fetchMedia: fetchMedia,
    getBaseUrl: getBaseUrl
  };
})();
