/**
 * 网页版公共 UI：顶部导航条、底部 tabBar、toast、loading、模态框、动作面板
 * 页面通过以下全局变量配置（在引入本文件前设置）：
 *   window.__ROOT__    相对站点根的路径前缀，如 '../../'（pages/x/y.html 为两层）
 *   window.__NAVBAR__  { title:'页面标题', back:true/false } 不设置则用 document.title，tab页不显示返回
 *   window.__TABBAR__  'index' | 'mobile' | 'admin' 表示当前是 tab 页（会注入底部 tabBar）
 */
(function () {
  'use strict';
  var ROOT = (typeof window.__ROOT__ === 'string') ? window.__ROOT__ : './';

  // ---------------- 站点图标（避免浏览器请求域名根 /favicon.ico 404） ----------------
  (function () {
    if (document.querySelector('link[rel~="icon"]')) return;
    var lk = document.createElement('link');
    lk.rel = 'icon';
    lk.href = ROOT + 'favicon.ico';
    document.head.appendChild(lk);
  })();

  // ---------------- 顶部导航条（对应原生 navigationBar） ----------------
  function injectNavbar() {
    if (document.getElementById('__navbar__')) return;
    var cfg = (typeof window.__NAVBAR__ === 'object' && window.__NAVBAR__) || {};
    var title = cfg.title || document.title.replace(/\s*[-|·].*$/, '') || '评分系统';
    var isTab = typeof window.__TABBAR__ === 'string';
    var showBack = cfg.back !== undefined ? !!cfg.back : !isTab;

    var bar = document.createElement('div');
    bar.id = '__navbar__';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:44px;background:#667eea;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;z-index:1000;font-size:17px;font-weight:500;' +
      'box-shadow:0 1px 4px rgba(102,126,234,.3);';
    if (showBack) {
      var back = document.createElement('div');
      back.setAttribute('aria-label', '返回');
      back.style.cssText = 'position:absolute;left:8px;top:0;bottom:0;display:flex;align-items:center;' +
        'padding:0 8px;cursor:pointer;font-size:24px;font-weight:300;line-height:1;';
      back.innerHTML = '&#8249;';
      back.onclick = function () { window.wx && wx.navigateBack({}); };
      bar.appendChild(back);
    }
    var t = document.createElement('div');
    t.id = '__navbar_title__';
    t.textContent = title;
    bar.appendChild(t);
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.style.paddingTop = '44px';
  }

  // ---------------- 底部 tabBar（对应 app.json tabBar 配置） ----------------
  var TABS = [
    { key: 'index',  text: '首页', icon: '&#127968;', page: 'pages/index/index' },
    { key: 'admin',  text: '管理', icon: '&#9881;',    page: 'pages/admin/admin' },
    { key: 'mobile', text: '评分', icon: '&#11088;',   page: 'pages/mobile/mobile' }
  ];
  function injectTabbar() {
    var cur = window.__TABBAR__;
    if (typeof cur !== 'string') return;
    if (document.getElementById('__tabbar__')) return;
    var nav = document.createElement('nav');
    nav.id = '__tabbar__';
    nav.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:56px;background:#fff;' +
      'display:flex;z-index:1000;border-top:1px solid #e5e7eb;box-shadow:0 -2px 8px rgba(0,0,0,.05);' +
      'padding-bottom:env(safe-area-inset-bottom,0);';
    TABS.forEach(function (tb) {
      var a = document.createElement('a');
      a.href = ROOT + tb.page + '.html';
      var active = tb.key === cur;
      a.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'text-decoration:none;font-size:11px;gap:2px;color:' + (active ? '#667eea' : '#7f8c8d') + ';font-weight:' + (active ? 600 : 400) + ';';
      a.innerHTML = '<span style="font-size:20px;line-height:1;">' + tb.icon + '</span><span>' + tb.text + '</span>';
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
    // 为 tabBar 页留出底部空间
    document.body.style.paddingBottom = '70px';
  }

  // ---------------- toast ----------------
  var toastTimer = null;
  function toast(msg, icon) {
    var el = document.getElementById('__toast__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__toast__';
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3000;' +
        'background:rgba(0,0,0,.75);color:#fff;border-radius:8px;padding:12px 18px;max-width:80%;' +
        'font-size:14px;text-align:center;line-height:1.5;pointer-events:none;opacity:0;transition:opacity .15s;';
      document.body.appendChild(el);
    }
    var prefix = icon === 'success' ? '<div style="font-size:30px;margin-bottom:4px;">&#10004;</div>' : '';
    el.innerHTML = prefix + String(msg || '').replace(/</g, '&lt;');
    el.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, icon === 'success' ? 1200 : 1800);
  }

  // ---------------- loading ----------------
  function loading(show, title) {
    var el = document.getElementById('__loading__');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = '__loading__';
        el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2900;' +
          'background:rgba(0,0,0,.7);color:#fff;border-radius:8px;padding:16px 22px;font-size:14px;' +
          'display:flex;flex-direction:column;align-items:center;gap:10px;';
        el.innerHTML = '<div style="width:26px;height:26px;border:3px solid rgba(255,255,255,.3);' +
          'border-top-color:#fff;border-radius:50%;animation:__spin .8s linear infinite;"></div>' +
          '<div id="__loading_text__">加载中...</div>';
        var st = document.createElement('style');
        st.textContent = '@keyframes __spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
        document.body.appendChild(el);
      }
      document.getElementById('__loading_text__').textContent = title || '加载中...';
      el.style.display = 'flex';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ---------------- 模态框 ----------------
  function modal(opts) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:4000;display:flex;' +
        'align-items:center;justify-content:center;';
      var box = document.createElement('div');
      box.style.cssText = 'width:80%;max-width:320px;background:#fff;border-radius:12px;overflow:hidden;' +
        'text-align:center;animation:__pop .15s ease-out;';
      var showCancel = opts.showCancel !== false;
      box.innerHTML =
        '<div style="padding:22px 18px 16px;">' +
        '<div style="font-size:17px;font-weight:600;color:#333;margin-bottom:8px;">' + String(opts.title || '提示').replace(/</g, '&lt;') + '</div>' +
        (opts.content ? '<div style="font-size:15px;color:#666;line-height:1.6;white-space:pre-wrap;word-break:break-all;">' + String(opts.content).replace(/</g, '&lt;') + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;border-top:1px solid #eee;font-size:16px;">' +
        (showCancel ? '<div id="__m_cancel" style="flex:1;padding:12px 0;color:#999;border-right:1px solid #eee;cursor:pointer;">' + (opts.cancelText || '取消') + '</div>' : '') +
        '<div id="__m_ok" style="flex:1;padding:12px 0;color:#667eea;font-weight:600;cursor:pointer;">' + (opts.confirmText || '确定') + '</div>' +
        '</div>';
      var st = document.createElement('style');
      st.textContent = '@keyframes __pop{from{transform:scale(.9);opacity:.5}to{transform:scale(1);opacity:1}}';
      document.head.appendChild(st);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
      function done(v) { document.body.removeChild(wrap); resolve(v); }
      box.querySelector('#__m_ok').onclick = function () { done(true); };
      var c = box.querySelector('#__m_cancel');
      if (c) c.onclick = function () { done(false); };
    });
  }

  // ---------------- 动作面板 ----------------
  function actionSheet(items) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:4000;display:flex;' +
        'flex-direction:column;justify-content:flex-end;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#f7f7f7;animation:__up .2s ease-out;';
      box.innerHTML = '<div>' + items.map(function (t, i) {
        return '<div data-i="' + i + '" style="padding:14px;text-align:center;font-size:16px;color:#333;' +
          'border-bottom:1px solid #eee;background:#fff;cursor:pointer;">' + String(t).replace(/</g, '&lt;') + '</div>';
      }).join('') + '</div><div data-i="-1" style="padding:14px;text-align:center;font-size:16px;color:#666;cursor:pointer;">取消</div>';
      var st = document.createElement('style');
      st.textContent = '@keyframes __up{from{transform:translateY(100%)}to{transform:translateY(0)}}';
      document.head.appendChild(st);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
      box.onclick = function (e) {
        var t = e.target.getAttribute && e.target.getAttribute('data-i');
        if (t === null || t === undefined) return;
        document.body.removeChild(wrap);
        resolve(parseInt(t, 10));
      };
      wrap.onclick = function (e) { if (e.target === wrap) { document.body.removeChild(wrap); resolve(-1); } };
    });
  }

  function boot() {
    injectNavbar();
    injectTabbar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.UI = { toast: toast, loading: loading, modal: modal, actionSheet: actionSheet };
})();
