/**
 * 浏览器端 wx.* API 最小兼容层
 * 目的：让原微信小程序页面 JS 尽量少改动即可在网页版中运行
 * 必须在页面业务 JS 之前加载
 */
(function () {
  'use strict';

  // ---------- 本地存储 ----------
  function getStorageSync(key) {
    try {
      var v = localStorage.getItem('wx_' + key);
      if (v === null) return '';
      try { return JSON.parse(v); } catch (e) { return v; }
    } catch (e) { return ''; }
  }
  function setStorageSync(key, value) {
    try { localStorage.setItem('wx_' + key, JSON.stringify(value === undefined ? null : value)); } catch (e) {}
  }
  function removeStorageSync(key) {
    try { localStorage.removeItem('wx_' + key); } catch (e) {}
  }

  // ---------- 网络请求 ----------
  function request(opt) {
    opt = opt || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = opt.timeout || 30000;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
    var method = (opt.method || 'GET').toUpperCase();
    var headers = {};
    headers['Content-Type'] = 'application/json';
    var url = opt.url;
    var body;
    if (opt.data !== undefined && opt.data !== null) {
      if (method === 'GET' || method === 'HEAD') {
        var qs = [];
        Object.keys(opt.data).forEach(function (k) {
          var v = opt.data[k];
          if (v !== undefined && v !== null) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
      } else {
        body = JSON.stringify(opt.data);
      }
    }
    Object.keys(opt.header || {}).forEach(function (k) { headers[k] = opt.header[k]; });

    var init = { method: method, headers: headers };
    if (body !== undefined) init.body = body;
    if (ctrl) init.signal = ctrl.signal;

    fetch(url, init).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = text; }
        var res = { statusCode: r.status, data: data, header: {}, cookies: [] };
        if (opt.success) opt.success(res);
        if (opt.complete) opt.complete(res);
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      var msg = (err && err.name === 'AbortError') ? 'request:fail timeout' : ('request:fail ' + (err && err.message ? err.message : 'error'));
      var e2 = { errMsg: msg, errno: -1, err: err };
      if (opt.fail) opt.fail(e2);
      if (opt.complete) opt.complete(e2);
    });
    return { abort: function () { if (ctrl) ctrl.abort(); } };
  }

  // ---------- 提示类（由 ui.js 提供实现，这里做转发） ----------
  function uiSafe(fn) {
    try { return window.UI && typeof window.UI[fn] === 'function'; } catch (e) { return false; }
  }

  // ---------- 剪贴板 ----------
  function writeClip(text, success, fail) {
    var done = function () {
      if (uiSafe('toast')) window.UI.toast('已复制');
      if (success) success({ data: text });
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacy(); });
    } else { legacy(); }
    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { if (fail) fail({ errMsg: 'setClipboardData:fail ' + e.message }); }
    }
  }

  // ---------- 导航 ----------
  function resolveUrl(raw) {
    // 'pages/video/input/input?url=xx' -> ROOT + 'pages/video/input/input.html?url=xx'
    var root = (typeof window.__ROOT__ === 'string') ? window.__ROOT__ : './';
    var parts = String(raw).split('?');
    var page = parts[0].replace(/^\/+/, '');
    if (!/\.html?$/.test(page)) page += '.html';
    var query = parts[1] ? ('?' + parts[1]) : '';
    return root + page + query;
  }
  function navigate(opt) {
    var to = resolveUrl((opt && opt.url) || '');
    if (opt && opt.fail) { /* 页面跳转在网页中总是“成功” */ }
    location.href = to;
  }

  // ---------- 下载文件到"相册/文件" ----------
  // tempFilePath 为 objectURL，记下 blob 以便保存时取回
  var tempFiles = {};
  function downloadFile(opt) {
    fetch(opt.url).then(function (r) {
      if (r.status === 200 || r.status === 206) {
        return r.blob().then(function (blob) {
          var u = URL.createObjectURL(blob);
          tempFiles[u] = blob;
          if (opt.success) opt.success({ statusCode: r.status, tempFilePath: u, blob: blob });
          if (opt.complete) opt.complete({ statusCode: r.status, tempFilePath: u });
        });
      }
      var e = { statusCode: r.status, errMsg: 'downloadFile:fail HTTP ' + r.status };
      if (opt.fail) opt.fail(e);
      if (opt.complete) opt.complete(e);
    }).catch(function (err) {
      var e = { errMsg: 'downloadFile:fail ' + (err && err.message || '网络错误') };
      if (opt.fail) opt.fail(e);
      if (opt.complete) opt.complete(e);
    });
    return { abort: function () {} };
  }

  function saveMedia(filePath, filename, success, fail) {
    var isWeChat = /micromessenger/i.test(navigator.userAgent);
    function triggerDownload(blob) {
      var u = blob ? URL.createObjectURL(blob) : filePath;
      var a = document.createElement('a');
      a.href = u;
      a.download = filename || 'video.mp4';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 500);
      // 微信内置浏览器 download 属性可能只支持"在浏览器打开"，给出提示
      if (isWeChat && uiSafe('toast')) {
        window.UI.toast('已发起下载，可长按页面视频直接保存相册');
      }
      if (success) success();
    }
    if (tempFiles[filePath]) { triggerDownload(tempFiles[filePath]); return; }
    fetch(filePath).then(function (r) { return r.blob(); })
      .then(function (b) { triggerDownload(b); })
      .catch(function () {
        // 兜底：直接打开，让用户长按/另存
        window.open(filePath, '_blank');
        if (success) success();
      });
  }

  // ---------- 导出 ----------
  window.wx = {
    // 存储
    getStorageSync: getStorageSync,
    setStorageSync: setStorageSync,
    removeStorageSync: removeStorageSync,
    getStorage: function (o) { var v = getStorageSync(o.key); if (o.success) o.success({ data: v }); },
    setStorage: function (o) { setStorageSync(o.key, o.data); if (o.success) o.success({}); },

    // 网络
    request: request,
    downloadFile: downloadFile,
    uploadFile: function (o) { if (o.fail) o.fail({ errMsg: 'uploadFile:fail 网页版暂不支持' }); },

    // 提示
    showToast: function (o) { if (uiSafe('toast')) window.UI.toast(o.title || '', o.icon); },
    hideToast: function () {},
    showLoading: function (o) { if (uiSafe('loading')) window.UI.loading(true, (o && o.title) || '加载中...'); },
    hideLoading: function () { if (uiSafe('loading')) window.UI.loading(false); },
    showModal: function (o) {
      if (window.UI && window.UI.modal) {
        window.UI.modal({
          title: o.title || '提示',
          content: o.content || '',
          confirmText: o.confirmText || '确定',
          cancelText: o.cancelText || '取消',
          showCancel: o.showCancel !== false
        }).then(function (ok) {
          if (o.success) o.success({ confirm: ok, cancel: !ok });
        });
      } else if (o.success) { o.success({ confirm: true, cancel: false }); }
    },
    showActionSheet: function (o) {
      if (window.UI && window.UI.actionSheet) {
        window.UI.actionSheet(o.itemList || []).then(function (i) {
          if (i >= 0 && o.success) o.success({ tapIndex: i });
        });
      }
    },

    // 导航
    navigateTo: navigate,
    redirectTo: navigate,
    reLaunch: navigate,
    switchTab: navigate,
    navigateBack: function (o) {
      if (history.length > 1) history.back();
      else location.href = ((typeof window.__ROOT__ === 'string') ? window.__ROOT__ : './') + 'pages/index/index.html';
    },

    // 剪贴板
    setClipboardData: function (o) { writeClip(o.data, o.success, o.fail); },
    getClipboardData: function (o) {
      var done = function (t) { if (o.success) o.success({ data: t || '' }); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.readText().then(done).catch(function () { done(''); });
      } else done('');
    },

    // 系统信息
    getSystemInfo: function (o) {
      var info = {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        statusBarHeight: 0,
        safeArea: { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight },
        platform: /android/i.test(navigator.userAgent) ? 'android' : 'ios',
        version: navigator.userAgent,
        language: (navigator.language || 'zh-CN'),
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight
      };
      if (o && o.success) o.success(info);
      if (o && o.complete) o.complete(info);
      return info;
    },
    getMenuButtonBoundingClientRect: function () {
      return { top: 28, left: window.innerWidth - 88, width: 87, height: 32, bottom: 60, right: window.innerWidth - 1 };
    },
    getNetworkType: function (o) {
      var t = navigator.onLine ? 'wifi' : 'none';
      if (o && o.success) o.success({ networkType: t });
      if (o && o.complete) o.complete({ networkType: t });
    },
    onNetworkStatusChange: function () {},

    // 登录/授权：网页版为匿名，直接给空结果，保证回调链不中断
    login: function (o) { if (o && o.success) o.success({ code: '' }); },
    checkSession: function (o) { if (o && o.success) o.success({}); if (o && o.fail) o.fail({ errMsg: 'checkSession:fail' }); },
    getSetting: function (o) { if (o && o.success) o.success({ authSetting: { 'scope.userInfo': true, 'scope.writePhotosAlbum': true } }); },
    getUserInfo: function (o) { if (o && o.success) o.success({ userInfo: { nickName: '网页用户', avatarUrl: '' } }); },
    authorize: function (o) { if (o && o.success) o.success({}); },

    // 分享：网页版复制链接
    showShareMenu: function () {},
    hideShareMenu: function () {},
    setClipboardDataForShare: function () {},

    // 画布：网页版请改用原生 canvas API（ctx = document.getElementById(id).getContext('2d')）
    createCanvasContext: function () {
      console.warn('[wx-shim] createCanvasContext 已弃用，请改用原生 canvas 2D API');
      return null;
    },
    createSelectorQuery: function () {
      console.warn('[wx-shim] createSelectorQuery 已弃用，请改用 document.querySelector');
      return { select: function () { return this; }, boundingClientRect: function () { return this; }, exec: function () {} };
    },
    setScreenBrightness: function (o) { if (o && o.success) o.success(); },
    vibrateShort: function () {},
    pageScrollTo: function (o) { window.scrollTo({ top: o.scrollTop || 0, behavior: 'smooth' }); },
    createIntersectionObserver: function () { return { observe: function () {}, disconnect: function () {} }; },

    // 相册保存（网页版 = 触发浏览器下载；微信内可长按视频直接保存）
    saveVideoToPhotosAlbum: function (o) {
      saveMedia(o.filePath, 'video_' + Date.now() + '.mp4', o.success, o.fail);
    },
    saveImageToPhotosAlbum: function (o) {
      saveMedia(o.filePath, 'image_' + Date.now() + '.jpg', o.success, o.fail);
    },

    // 窗口
    setNavigationBarTitle: function (o) {
      document.title = (o && o.title) || document.title;
      var el = document.getElementById('__navbar_title__');
      if (el && o && o.title) el.textContent = o.title;
    },
    setNavigationBarColor: function (o) {
      var bar = document.getElementById('__navbar__');
      if (bar && o && o.backgroundColor) bar.style.backgroundColor = o.backgroundColor;
    },
    setTabBarItem: function () {},
    showTabBarRedDot: function () {},
    hideTabBar: function () {},
    showTabBar: function () {}
  };

  // 让页面 JS 里的 require('../../utils/videoApi.js') 语句不报错：
  // 网页版通过 <script src="js/videoApi.js"> 引入 VideoApi 全局
  window.require = window.require || function (path) {
    if (/videoApi/.test(path)) return window.VideoApi;
    console.warn('[wx-shim] require 不支持: ' + path);
    return {};
  };
})();
