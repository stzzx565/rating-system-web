/**
 * 视频解析输入页（网页版）— 对应原小程序 pages/video/input/input.js
 * 转换说明：
 *   - Page({ data, onLoad, ... }) 转为 IIFE，data 保留为局部对象
 *   - setData(patch) 合并数据并调用 render() 刷新 DOM
 *   - 历史列表为动态渲染，点击用事件委托
 *   - videoApi 使用全局 window.VideoApi（由 js/videoApi.js 提供）
 */
(function () {
  'use strict';

  // 网页版视频解析 API（原为 require 引入的 utils/videoApi.js）
  var videoApi = window.VideoApi;

  // 页面数据（对应原 data）
  var data = {
    inputUrl: '',
    loading: false,
    history: [],
    backendOk: true,
    showPasswordDialog: false,
    oldPwd: '',
    newPwd: '',
    confirmPwd: ''
  };

  // ---------- DOM 引用 ----------
  var urlInput = document.getElementById('urlInput');
  var btnParse = document.getElementById('btnParse');
  var btnParseText = document.getElementById('btnParseText');
  var historySection = document.getElementById('historySection');
  var historyList = document.getElementById('historyList');
  var statusSection = document.getElementById('statusSection');
  var passwordDialog = document.getElementById('passwordDialog');
  var oldPwdEl = document.getElementById('oldPwd');
  var newPwdEl = document.getElementById('newPwd');
  var confirmPwdEl = document.getElementById('confirmPwd');

  // 转义 HTML 特殊字符（历史标题来自视频描述，防止破坏结构）
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 输入框聚焦时不回写，避免打断用户输入
  function syncValue(el, value) {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  }

  // 模拟原生 textarea 的 auto-height：随内容增高
  function autoGrow() {
    urlInput.style.height = 'auto';
    urlInput.style.height = urlInput.scrollHeight + 'px';
  }

  // 渲染历史记录列表
  function renderHistory() {
    historySection.style.display = data.history.length > 0 ? 'block' : 'none';
    historyList.innerHTML = data.history.map(function (item, index) {
      return '<div class="history-item" data-index="' + index + '">' +
        '<span class="history-platform">' + escapeHtml(item.platform) + '</span>' +
        '<span class="history-title">' + escapeHtml(item.title) + '</span>' +
        '<span class="history-time">' + escapeHtml(item.time) + '</span>' +
        '</div>';
    }).join('');
  }

  // 根据 data 刷新视图
  function render() {
    // 输入框
    if (document.activeElement !== urlInput && urlInput.value !== data.inputUrl) {
      urlInput.value = data.inputUrl;
      autoGrow();
    }
    // 解析按钮状态与文案
    btnParse.disabled = !data.inputUrl || data.loading;
    btnParse.classList.toggle('btn-disabled', !data.inputUrl);
    btnParseText.textContent = data.loading ? '⏳ 解析中...' : '🔍 解析视频';
    // 后端状态提示
    statusSection.style.display = data.backendOk ? 'none' : 'block';
    // 修改密码弹窗
    passwordDialog.style.display = data.showPasswordDialog ? 'flex' : 'none';
    syncValue(oldPwdEl, data.oldPwd);
    syncValue(newPwdEl, data.newPwd);
    syncValue(confirmPwdEl, data.confirmPwd);
    // 历史记录
    renderHistory();
  }

  // 合并数据并刷新（对应原 setData）
  function setData(patch) {
    Object.assign(data, patch);
    render();
  }

  // ---------- 页面业务逻辑（函数名与原版保持一致） ----------

  function onLoad() {
    loadHistory();
    checkBackend();
  }

  function onShow() {
    loadHistory();
  }

  // 输入链接
  function onUrlInput(e) {
    setData({ inputUrl: e.target.value });
    autoGrow();
  }

  // 检查后端是否可用
  function checkBackend() {
    var baseUrl = videoApi.getBaseUrl();
    // 网页版说明：baseUrl 为空串表示同源代理模式（serve.js 已把 /api 转发到解析服务），视为可用；
    // 与原版一致，仅当配置指向本机 127.0.0.1 时提示未连接
    if (baseUrl === 'http://127.0.0.1:8080') {
      setData({ backendOk: false });
    }
  }

  // 开始解析
  function startParse() {
    var raw = data.inputUrl.trim();
    if (!raw) {
      wx.showToast({ title: '请输入链接', icon: 'none' });
      return;
    }

    // 支持整段分享文字直接粘贴:自动提取第一个链接
    var match = raw.match(/https?:\/\/[^\s"'<>，。！？；、）【】']+/);
    var url = match ? match[0] : raw;

    // 简单校验是否为链接
    if (url.indexOf('http') !== 0) {
      wx.showToast({ title: '请输入有效的链接', icon: 'none' });
      return;
    }

    // 输入框同步为提取后的纯链接(历史记录也存纯链接)
    setData({ inputUrl: url });
    urlInput.value = url; // 按钮点击后输入框已失焦，这里强制同步纯链接
    autoGrow();

    setData({ loading: true });
    wx.showLoading({ title: '解析中...', mask: true });

    videoApi.parseVideo(url)
      .then(function (d) {
        wx.hideLoading();
        setData({ loading: false });

        // 保存到历史
        addToHistory(d, url);

        // 跳转到结果页（shim 会把地址转换为 .html）
        var resultData = encodeURIComponent(JSON.stringify(d));
        wx.navigateTo({
          url: '/pages/video/result/result?data=' + resultData + '&sourceUrl=' + encodeURIComponent(url)
        });
      })
      .catch(function (err) {
        wx.hideLoading();
        setData({ loading: false });
        wx.showToast({ title: err.message || '解析失败', icon: 'none', duration: 3000 });
      });
  }

  // 添加到历史记录
  function addToHistory(d, url) {
    var history = wx.getStorageSync('videoParseHistory') || [];

    var platformMap = {
      'douyin': '抖音',
      'tiktok': 'TikTok',
      'bilibili': 'B站',
      'kuaishou': '快手',
      'xhs': '小红书',
      'wxchannels': '视频号'
    };

    var item = {
      url: url,
      platform: platformMap[d.platform] || d.platform || '未知',
      title: (d.desc || d.title || '无标题').substring(0, 50),
      time: formatTime(new Date())
    };

    // 去重
    history = history.filter(function (h) { return h.url !== url; });
    history.unshift(item);
    // 最多保留 20 条
    if (history.length > 20) history = history.slice(0, 20);

    wx.setStorageSync('videoParseHistory', history);
    setData({ history: history });
  }

  // 加载历史记录
  function loadHistory() {
    var history = wx.getStorageSync('videoParseHistory') || [];
    setData({ history: history });
  }

  // 使用历史记录（事件委托传入索引）
  function useHistory(index) {
    var item = data.history[index];
    if (!item) return;
    setData({ inputUrl: item.url });
    urlInput.value = item.url;
    autoGrow();
  }

  // 清空历史
  function clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有解析历史吗？',
      success: function (res) {
        if (res.confirm) {
          wx.removeStorageSync('videoParseHistory');
          setData({ history: [] });
        }
      }
    });
  }

  // 格式化时间
  function formatTime(date) {
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    var hour = date.getHours().toString().padStart(2, '0');
    var minute = date.getMinutes().toString().padStart(2, '0');
    return month + '-' + day + ' ' + hour + ':' + minute;
  }

  // 显示修改密码弹窗
  function showChangePassword() {
    setData({ showPasswordDialog: true, oldPwd: '', newPwd: '', confirmPwd: '' });
    oldPwdEl.focus(); // 对应原输入框的 focus 属性
  }

  function onOldPwdInput(e) { setData({ oldPwd: e.target.value }); }
  function onNewPwdInput(e) { setData({ newPwd: e.target.value }); }
  function onConfirmPwdInput(e) { setData({ confirmPwd: e.target.value }); }

  function cancelChangePassword() {
    setData({ showPasswordDialog: false });
  }

  function confirmChangePassword() {
    var oldPwd = data.oldPwd, newPwd = data.newPwd, confirmPwd = data.confirmPwd;
    var currentPwd = wx.getStorageSync('videoPassword') || 'ai2026';

    if (!oldPwd || !newPwd || !confirmPwd) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    if (oldPwd !== currentPwd) {
      wx.showToast({ title: '当前密码错误', icon: 'error' });
      return;
    }
    if (newPwd !== confirmPwd) {
      wx.showToast({ title: '两次新密码不一致', icon: 'error' });
      return;
    }
    if (newPwd.length < 4) {
      wx.showToast({ title: '密码至少4位', icon: 'none' });
      return;
    }

    wx.setStorageSync('videoPassword', newPwd);
    setData({ showPasswordDialog: false });
    wx.showToast({ title: '密码修改成功', icon: 'success' });
  }

  // ---------- 事件绑定 ----------
  document.getElementById('settingsBtn').addEventListener('click', showChangePassword);
  btnParse.addEventListener('click', startParse);
  document.getElementById('btnClearHistory').addEventListener('click', clearHistory);
  urlInput.addEventListener('input', onUrlInput);

  // 历史记录点击（事件委托，对应原列表项的点击）
  historyList.addEventListener('click', function (e) {
    var node = e.target.closest ? e.target.closest('.history-item') : null;
    if (node && node.dataset.index !== undefined && node.dataset.index !== '') {
      useHistory(parseInt(node.dataset.index, 10));
    }
  });

  oldPwdEl.addEventListener('input', onOldPwdInput);
  newPwdEl.addEventListener('input', onNewPwdInput);
  confirmPwdEl.addEventListener('input', onConfirmPwdInput);
  document.getElementById('btnCancelPwd').addEventListener('click', cancelChangePassword);
  document.getElementById('btnConfirmPwd').addEventListener('click', confirmChangePassword);

  // ---------- 初始化（对应原 onLoad / onShow） ----------
  onLoad();
  onShow();
  render();
})();
