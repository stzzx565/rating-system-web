/**
 * 首页（网页版）— 对应原小程序 pages/index/index.js
 * 转换说明：
 *   - Page({ data, onLoad, ... }) 转为 IIFE，data 保留为局部对象
 *   - setData(patch) 合并数据并调用 render() 刷新 DOM
 *   - wx.* / getApp() 由 js/wx-shim.js、js/app.js 提供，业务调用保持原样
 */
(function () {
  'use strict';

  // 默认宣传文字（原页面模板中 homeText 为空时的兜底文案）
  var DEFAULT_HOME_TEXT = '欢迎使用评分系统！这里是评分系统的首页，您可以在这里查看评分结果和管理评分活动。';

  // 页面数据（对应原 data）
  var data = {
    homeText: '',                 // 宣传文字
    isEditing: false,             // 是否处于编辑状态
    passwordInput: '',            // 密码输入
    showPasswordDialog: false,    // 是否显示密码输入对话框
    showVideoPasswordDialog: false, // 视频下载密码弹窗
    videoPasswordInput: ''        // 视频下载密码输入
  };

  // ---------- DOM 引用 ----------
  var textDisplay = document.getElementById('textDisplay');
  var homeTextEl = document.getElementById('homeTextEl');
  var editArea = document.getElementById('editArea');
  var editBtnContainer = document.getElementById('editBtnContainer');
  var textEditor = document.getElementById('textEditor');
  var passwordDialog = document.getElementById('passwordDialog');
  var passwordInput = document.getElementById('passwordInput');
  var videoPasswordDialog = document.getElementById('videoPasswordDialog');
  var videoPasswordInput = document.getElementById('videoPasswordInput');

  // ---------- 渲染 ----------
  // 输入框聚焦时不回写，避免打断用户输入
  function syncValue(el, value) {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  }

  // 根据 data 刷新视图（对应原模板的插值与条件渲染）
  function render() {
    var text = data.homeText || DEFAULT_HOME_TEXT;
    if (homeTextEl.textContent !== text) homeTextEl.textContent = text;
    editArea.style.display = data.isEditing ? 'block' : 'none';        // 原条件：isEditing
    editBtnContainer.style.display = data.isEditing ? 'none' : 'flex';  // 原条件：!isEditing
    syncValue(textEditor, text);
    passwordDialog.style.display = data.showPasswordDialog ? 'flex' : 'none';
    videoPasswordDialog.style.display = data.showVideoPasswordDialog ? 'flex' : 'none';
    syncValue(passwordInput, data.passwordInput);
    syncValue(videoPasswordInput, data.videoPasswordInput);
  }

  // 合并数据并刷新（对应原 setData）
  function setData(patch) {
    Object.assign(data, patch);
    render();
  }

  // ---------- 页面业务逻辑（函数名与原版保持一致） ----------

  // 页面加载时执行
  function onLoad() {
    console.log('首页加载');
    loadHomeText();
  }

  // 页面显示时执行：尝试从云端同步最新数据
  function onShow() {
    console.log('首页显示');
    var app = getApp();
    app.loadData().then(function (success) {
      console.log('首页同步云端数据:', success ? '成功' : '失败');
      // 重新加载宣传文字，确保最新
      loadHomeText();
    });
  }

  // 进入视频下载（需要密码）
  function goVideoDownload() {
    setData({ showVideoPasswordDialog: true, videoPasswordInput: '' });
    videoPasswordInput.focus();
  }

  // 视频密码输入事件
  function onVideoPasswordInput(e) {
    setData({ videoPasswordInput: e.target.value });
  }

  // 验证视频下载密码
  function verifyVideoPassword() {
    var input = data.videoPasswordInput;
    var videoPassword = wx.getStorageSync('videoPassword') || 'ai2026';

    if (input === videoPassword) {
      setData({ showVideoPasswordDialog: false });
      wx.navigateTo({ url: '/pages/video/input/input' });
    } else {
      wx.showToast({ title: '密码错误', icon: 'error' });
    }
  }

  // 取消视频密码输入
  function cancelVideoPassword() {
    setData({ showVideoPasswordDialog: false });
  }

  // 进入问卷调查（原生页面，数据存 JSONBin 云端，任何网络可用）
  function goSurvey() {
    wx.navigateTo({ url: '/pages/survey/list' });
  }

  // 查看网页版入口说明
  function showH5Info() {
    wx.showModal({
      title: '网页版入口',
      content: '问卷与评分的网页版已部署在：\nhttps://zzx565.pages.dev\n\n把问卷/评分链接发给朋友，对方点开即可填写，无需安装小程序。管理员可在网页上复制分享链接和二维码。',
      showCancel: false,
      confirmText: '知道了'
    });
  }

  // 从本地存储加载宣传文字
  function loadHomeText() {
    // 优先从全局数据加载（全局数据在应用启动时会从云端同步）
    var app = getApp();
    var homeText = app.globalData.homeText || '';

    // 如果全局数据中没有，从本地存储加载
    if (!homeText) {
      var savedData = wx.getStorageSync('ratingSystemData') || {};
      homeText = savedData.homeText || '';
    }

    setData({ homeText: homeText });
    console.log('加载宣传文字:', homeText);
  }

  // 启用编辑模式：显示密码输入对话框
  function enableTextEdit() {
    setData({ showPasswordDialog: true, passwordInput: '' });
    passwordInput.focus();
    console.log('显示密码输入对话框');
  }

  // 取消编辑：重新加载文字，恢复原始内容
  function cancelTextEdit() {
    setData({ isEditing: false });
    loadHomeText();
    console.log('取消编辑');
  }

  // 文字输入事件
  function onTextInput(e) {
    var text = e.target.value;
    setData({ homeText: text });
    console.log('文字输入:', text);
  }

  // 密码输入事件
  function onPasswordInput(e) {
    setData({ passwordInput: e.target.value });
  }

  // 验证密码
  function verifyPassword() {
    var inputPassword = data.passwordInput;
    var adminPassword = 'admin123'; // 与管理员页面保持一致的密码

    if (inputPassword === adminPassword) {
      // 密码正确，进入编辑模式
      setData({
        showPasswordDialog: false,
        isEditing: true
      });
      textEditor.focus(); // 对应原 textarea 的 auto-focus
      wx.showToast({ title: '验证成功，进入编辑模式', icon: 'success' });
      console.log('密码验证成功，进入编辑模式');
    } else {
      // 密码错误
      wx.showToast({ title: '密码错误，请重试', icon: 'error' });
      console.log('密码验证失败');
    }
  }

  // 取消密码输入
  function cancelPasswordInput() {
    setData({ showPasswordDialog: false });
    console.log('取消密码输入');
  }

  // 保存宣传文字
  function saveHomeText() {
    var homeText = data.homeText;

    // 保存到本地存储
    var savedData = wx.getStorageSync('ratingSystemData') || {};
    savedData.homeText = homeText;
    wx.setStorageSync('ratingSystemData', savedData);
    console.log('保存宣传文字到本地存储:', homeText);

    // 更新全局数据
    var app = getApp();
    app.globalData.homeText = homeText;
    console.log('更新全局数据');

    // 同步到云端
    app.saveData().then(function (success) {
      console.log('宣传文字同步到云端:', success ? '成功' : '失败');

      // 退出编辑模式
      setData({ isEditing: false });

      if (success) {
        wx.showToast({ title: '宣传文字保存成功并同步到云端', icon: 'success' });
      } else {
        wx.showToast({ title: '宣传文字保存成功，但云端同步失败', icon: 'warning' });
      }
      console.log('保存成功');
    });
  }

  // ---------- 事件绑定（对应原页面的点击/输入事件） ----------
  document.getElementById('entryVideo').addEventListener('click', goVideoDownload);
  document.getElementById('entrySurvey').addEventListener('click', goSurvey);
  document.getElementById('entryH5').addEventListener('click', showH5Info);
  textDisplay.addEventListener('click', enableTextEdit);
  document.getElementById('btnEditText').addEventListener('click', enableTextEdit);
  document.getElementById('btnSaveText').addEventListener('click', saveHomeText);
  document.getElementById('btnCancelText').addEventListener('click', cancelTextEdit);
  textEditor.addEventListener('input', onTextInput);
  passwordInput.addEventListener('input', onPasswordInput);
  document.getElementById('btnVerifyPwd').addEventListener('click', verifyPassword);
  document.getElementById('btnCancelPwd').addEventListener('click', cancelPasswordInput);
  videoPasswordInput.addEventListener('input', onVideoPasswordInput);
  document.getElementById('btnVerifyVideoPwd').addEventListener('click', verifyVideoPassword);
  document.getElementById('btnCancelVideoPwd').addEventListener('click', cancelVideoPassword);

  // ---------- 初始化（对应原 onLoad / onShow） ----------
  onLoad();
  onShow();
  render();
})();
