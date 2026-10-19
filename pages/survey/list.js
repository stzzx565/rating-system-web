// pages/survey/list.js（网页版）
// 问卷调查首页：展示问卷列表（数据存于 JSONBin 云端，任何网络可用）
(function () {
  'use strict'

  var app = getApp()

  // 页面数据（对应原 data）
  var data = {
    surveys: [], // 视图用问卷列表
    loading: true,
    isAdmin: false, // 是否已通过管理员验证
    showPasswordDialog: false,
    passwordInput: ''
  }

  function $(id) { return document.getElementById(id) }

  // HTML 转义，防止问卷内容破坏结构
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // setData：合并数据并刷新视图
  function setData(patch) {
    Object.keys(patch).forEach(function (k) { data[k] = patch[k] })
    render()
  }

  // 渲染整体（加载态 / 空状态 / 卡片列表 / 密码对话框 / 按钮文案）
  function render() {
    $('loadingBox').style.display = data.loading ? 'flex' : 'none'
    $('surveyBox').style.display = data.loading ? 'none' : 'block'
    $('emptyBox').style.display = (!data.loading && data.surveys.length === 0) ? 'flex' : 'none'
    $('emptySub').textContent = data.isAdmin
      ? '点击下方"管理问卷"创建第一个问卷'
      : '管理员可点击下方"管理问卷"创建'
    $('adminBtn').textContent = data.isAdmin ? '⚙️ 管理问卷' : '⚙️ 管理问卷（管理员）'
    $('pwdDialog').style.display = data.showPasswordDialog ? 'flex' : 'none'
    $('pwdInput').value = data.passwordInput
    if (data.showPasswordDialog) $('pwdInput').focus()
    renderCards()
  }

  // 问卷卡片列表
  function renderCards() {
    $('cardList').innerHTML = data.surveys.map(function (item) {
      var html = '<div class="survey-card">' +
        '<div class="card-main" data-id="' + esc(item.id) + '" onclick="goFill(event)">' +
          '<div class="card-top">' +
            '<span class="card-title">' + esc(item.title) + '</span>' +
            '<span class="status-tag ' + esc(item.status) + '">' + esc(item.statusText) + '</span>' +
          '</div>' +
          (item.description ? '<span class="card-desc">' + esc(item.description) + '</span>' : '') +
          '<div class="card-meta">' +
            '<span class="meta-item">' + item.questionCount + ' 道题</span>' +
            '<span class="meta-item">创建于 ' + esc(item.createdAt) + '</span>' +
          '</div>' +
        '</div>'
      if (data.isAdmin) {
        html += '<div class="card-actions">' +
          '<span class="action-btn" data-id="' + esc(item.id) + '" onclick="goResults(event)">📊 查看结果</span>' +
          '<button class="share-btn" data-id="' + esc(item.id) + '" onclick="shareSurvey(event)">📤 分享问卷</button>' +
          '</div>'
      }
      html += '</div>'
      return html
    }).join('')
  }

  function onLoad() {
    var adminFlag = wx.getStorageSync('surveyAdminVerified')
    if (adminFlag) data.isAdmin = true
    // 原小程序右上角转发菜单在网页版无对应入口（分享走卡片上的复制链接按钮）
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
  }

  function onShow() {
    refreshSurveys()
  }

  // 拉取云端最新数据并渲染问卷列表
  function refreshSurveys() {
    setData({ loading: true })
    app.loadData().then(function () {
      renderList()
    })
  }

  function renderList() {
    var surveys = app.globalData.surveys || {}
    var responses = app.globalData.surveyResponses || {}
    var list = Object.keys(surveys).map(function (id) {
      var s = surveys[id]
      return {
        id: s.id,
        title: s.title,
        description: s.description || '',
        status: s.status || 'open',
        statusText: (s.status === 'closed') ? '已停止' : '收集中',
        questionCount: (s.questions || []).length,
        responseCount: (responses[s.id] || []).length,
        createdAt: formatDate(s.createdAt)
      }
    })
    // 收集中的排前面，其余按创建时间倒序
    list.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      return b.createdAt - a.createdAt
    })
    setData({ surveys: list, loading: false })
  }

  // ========== 分享 ==========
  // 卡片上的“分享问卷”按钮：网页版复制该问卷填写页链接，好友点开直达填写页
  function shareSurvey(e) {
    var id = e.currentTarget.dataset.id
    var base = location.href.replace(/[^/]*$/, '')
    wx.setClipboardData({ data: base + 'fill.html?id=' + encodeURIComponent(id) })
  }

  // 填写问卷
  function goFill(e) {
    var id = e.currentTarget.dataset.id
    var s = (app.globalData.surveys || {})[id]
    if (!s) return
    if (s.status === 'closed') {
      wx.showToast({ title: '该问卷已停止收集', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/survey/fill?id=' + id })
  }

  // 查看统计结果（管理员）
  function goResults(e) {
    if (!data.isAdmin) return
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/survey/results?id=' + id })
  }

  // 管理问卷
  function goManage() {
    if (data.isAdmin) {
      wx.navigateTo({ url: '/pages/survey/manage' })
      return
    }
    setData({ showPasswordDialog: true, passwordInput: '' })
  }

  function onPasswordInput(e) {
    // 输入过程中不触发重绘，避免输入框失焦
    data.passwordInput = e.target.value
  }

  function cancelPasswordInput() {
    setData({ showPasswordDialog: false, passwordInput: '' })
  }

  function verifyPassword() {
    var adminPassword = 'admin123' // 与管理员页面保持一致的密码
    if (data.passwordInput === adminPassword) {
      setData({ isAdmin: true, showPasswordDialog: false })
      wx.setStorageSync('surveyAdminVerified', true)
      wx.navigateTo({ url: '/pages/survey/manage' })
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
    }
  }

  // 打开电脑版完整问卷系统（TDuck，内嵌页）
  function goWebSurvey() {
    wx.navigateTo({ url: '/pages/survey/survey' })
  }

  // 暴露给 HTML 内联事件
  window.goFill = goFill
  window.goResults = goResults
  window.goManage = goManage
  window.onPasswordInput = onPasswordInput
  window.cancelPasswordInput = cancelPasswordInput
  window.verifyPassword = verifyPassword
  window.goWebSurvey = goWebSurvey
  window.shareSurvey = shareSurvey

  // 页面就绪后依次执行原 onLoad / onShow 流程
  function boot() {
    onLoad()
    render()
    onShow()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()

function formatDate(ts) {
  if (!ts) return ''
  var d = new Date(ts)
  var m = d.getMonth() + 1
  var day = d.getDate()
  return m + '月' + day + '日'
}
