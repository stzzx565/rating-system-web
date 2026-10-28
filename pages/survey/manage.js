// pages/survey/manage.js（网页版）
// 问卷管理页（管理员）：创建问卷、编辑题目、开启/停止收集、删除
(function () {
  'use strict'

  var app = getApp()

  var TYPE_OPTIONS = ['单选题', '多选题', '简答题', '问答题', '评分题']
  var TYPE_MAP = { '单选题': 'radio', '多选题': 'checkbox', '简答题': 'text', '问答题': 'textarea', '评分题': 'rate' }

  // 页面数据（对应原 data）
  var data = {
    verified: false, // 管理员验证
    passwordInput: '',
    surveys: [], // 列表视图
    editing: false, // 是否处于编辑视图
    editSurvey: null, // 正在编辑的问卷（含 questions）
    // 新建问卷表单
    creating: false,
    newTitle: '',
    newDesc: '',
    // 添加题目表单
    showQForm: false,
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
    qTitle: '',
    qRequired: false,
    qOptions: ['', ''], // 单选/多选的选项输入
    saving: false
  }

  function $(id) { return document.getElementById(id) }

  // HTML 转义，防止问卷内容破坏结构
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // setData：支持 'editSurvey.title' 路径写入；silent 为真时只更新数据不重绘（输入过程中保持焦点）
  function setData(patch, silent) {
    Object.keys(patch).forEach(function (key) {
      var path = key.split('.')
      var obj = data
      for (var i = 0; i < path.length - 1; i++) obj = obj[path[i]]
      obj[path[path.length - 1]] = patch[key]
    })
    if (!silent) render()
  }

  // ========== 视图渲染 ==========
  // 题目卡片（编辑视图）
  function qCardHTML(item, index) {
    var typeText = item.type === 'radio' ? '单选'
      : item.type === 'checkbox' ? '多选'
      : item.type === 'text' ? '简答'
      : item.type === 'textarea' ? '问答'
      : '评分'
    var html = '<div class="q-card">' +
      '<div class="q-head">' +
        '<span class="q-no">' + (index + 1) + '. ' + esc(item.title) + '</span>' +
        '<span class="q-del" data-index="' + index + '" onclick="removeQuestion(event)">✕</span>' +
      '</div>' +
      '<div class="q-info">' +
        '<span class="q-tag">' + typeText + '</span>' +
        '<span class="q-req">' + (item.required ? '必填' : '选填') + '</span>' +
      '</div>'
    if ((item.options || []).length > 0) {
      html += '<div class="q-options">' + item.options.map(function (opt) {
        return '<span class="q-opt">· ' + esc(opt) + '</span>'
      }).join('') + '</div>'
    }
    return html + '</div>'
  }

  // 问卷卡片（列表视图）
  function manageCardHTML(item) {
    return '<div class="survey-card">' +
      '<div class="card-row">' +
        '<span class="card-title">' + esc(item.title) + '</span>' +
        '<span class="status-tag ' + esc(item.status) + '">' + esc(item.statusText) + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="meta-item">' + item.questionCount + ' 道题</span>' +
        '<span class="meta-item">' + item.responseCount + ' 份答卷</span>' +
      '</div>' +
      '<div class="card-actions">' +
        '<span class="act-btn primary" data-id="' + esc(item.id) + '" onclick="goEdit(event)">✏️ 编辑</span>' +
        '<span class="act-btn" data-id="' + esc(item.id) + '" onclick="toggleStatus(event)">' +
          (item.status === 'open' ? '⏸ 停止收集' : '▶️ 开启收集') + '</span>' +
        '<span class="act-btn danger" data-id="' + esc(item.id) + '" onclick="deleteSurvey(event)">🗑 删除</span>' +
      '</div>' +
      '</div>'
  }

  // 添加题目表单中的选项行
  function renderQForm() {
    var label = data.typeOptions[data.typeIndex]
    var isChoice = label === '单选题' || label === '多选题'
    $('optWrap').style.display = isChoice ? 'block' : 'none'
    $('typeSelect').value = String(data.typeIndex)
    $('qTitleInput').value = data.qTitle
    $('qRequiredSwitch').checked = !!data.qRequired
    $('optRows').innerHTML = data.qOptions.map(function (opt, i) {
      return '<div class="opt-row">' +
        '<input class="form-input opt-input" placeholder="选项 ' + (i + 1) + '" value="' + esc(opt) +
          '" data-index="' + i + '" oninput="onOptionInput(event)">' +
        '<span class="opt-del" data-index="' + i + '" onclick="removeOptionRow(event)">✕</span>' +
        '</div>'
    }).join('')
  }

  // 整体渲染：验证页 / 列表 / 新建 / 编辑 四块的显示切换
  function render() {
    $('verifyBox').style.display = data.verified ? 'none' : 'flex'
    $('mainWrap').style.display = data.verified ? 'block' : 'none'
    if (!data.verified) return

    $('listView').style.display = (!data.editing && !data.creating) ? 'block' : 'none'
    $('createView').style.display = data.creating ? 'block' : 'none'
    $('editView').style.display = data.editing ? 'block' : 'none'

    // 列表视图
    $('emptyBox').style.display = data.surveys.length === 0 ? 'flex' : 'none'
    $('manageList').innerHTML = data.surveys.map(manageCardHTML).join('')

    // 新建表单值回填
    $('newTitleInput').value = data.newTitle
    $('newDescInput').value = data.newDesc

    // 编辑视图
    if (data.editing && data.editSurvey) {
      $('editTitleInput').value = data.editSurvey.title || ''
      $('editDescInput').value = data.editSurvey.description || ''
      $('qList').innerHTML = (data.editSurvey.questions || []).map(qCardHTML).join('')
      $('addqBtn').style.display = data.showQForm ? 'none' : 'block'
      $('qForm').style.display = data.showQForm ? 'block' : 'none'
      if (data.showQForm) renderQForm()
      $('saveBtn').className = 'form-btn ok' + (data.saving ? ' disabled' : '')
    }
  }

  function onLoad() {
    var adminFlag = wx.getStorageSync('surveyAdminVerified')
    if (adminFlag) setData({ verified: true })
  }

  function onShow() {
    // 冷启动直开本页时 globalData 可能尚未完成云端同步，先拉取再渲染，避免列表显示为空
    if (data.verified) {
      app.loadData().then(function () { renderList() })
    }
  }

  // ========== 管理员验证 ==========
  function onPasswordInput(e) {
    // 输入过程中不重绘，避免输入框失焦
    data.passwordInput = e.target.value
  }

  function verifyPassword() {
    var adminPassword = 'admin123' // 与管理员页面保持一致的密码
    if (data.passwordInput === adminPassword) {
      setData({ verified: true, passwordInput: '' })
      wx.setStorageSync('surveyAdminVerified', true)
      // 验证通过后先等云端数据到位再渲染列表
      app.loadData().then(function () { renderList() })
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
    }
  }

  // ========== 列表视图 ==========
  function renderList() {
    var surveys = app.globalData.surveys || {}
    var responses = app.globalData.surveyResponses || {}
    var list = Object.keys(surveys).map(function (id) {
      var s = surveys[id]
      return {
        id: s.id,
        title: s.title,
        status: s.status || 'open',
        statusText: (s.status === 'closed') ? '已停止' : '收集中',
        questionCount: (s.questions || []).length,
        responseCount: (responses[s.id] || []).length
      }
    })
    setData({ surveys: list, editing: false, creating: false })
  }

  // 开始创建问卷
  function startCreate() {
    setData({ creating: true, newTitle: '', newDesc: '' })
  }

  function onNewTitle(e) { setData({ newTitle: e.target.value }, true) }
  function onNewDesc(e) { setData({ newDesc: e.target.value }, true) }

  // 创建问卷（先保存到云端，再进入编辑题目）
  function createSurvey() {
    var title = (data.newTitle || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写问卷标题', icon: 'none' })
      return
    }
    var id = 'sv_' + Date.now()
    var surveys = app.globalData.surveys || {}
    surveys[id] = {
      id: id,
      title: title,
      description: (data.newDesc || '').trim(),
      status: 'open',
      questions: [],
      createdAt: Date.now()
    }
    app.globalData.surveys = surveys
    setData({ saving: true })
    app.saveData().then(function () {
      setData({ saving: false })
      wx.showToast({ title: '已创建，请添加题目', icon: 'success' })
      enterEdit(id)
    }).catch(function (err) {
      console.error('[问卷] 创建失败:', err)
      setData({ saving: false })
      wx.showToast({ title: '保存到云端失败，请重试', icon: 'none' })
    })
  }

  function cancelCreate() {
    setData({ creating: false })
  }

  // 切换收集状态
  function toggleStatus(e) {
    var id = e.currentTarget.dataset.id
    var s = (app.globalData.surveys || {})[id]
    if (!s) return
    s.status = (s.status === 'closed') ? 'open' : 'closed'
    app.saveData().then(function () {
      wx.showToast({ title: s.status === 'open' ? '已开启收集' : '已停止收集', icon: 'success' })
      renderList()
    }).catch(function () {
      wx.showToast({ title: '云端保存失败', icon: 'none' })
    })
  }

  // 删除问卷（含答卷）
  function deleteSurvey(e) {
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除问卷',
      content: '将同时删除该问卷的所有答卷，确定删除？',
      confirmColor: '#e74c3c',
      success: function (res) {
        if (!res.confirm) return
        delete app.globalData.surveys[id]
        delete app.globalData.surveyResponses[id]
        app.saveData().then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          renderList()
        }).catch(function () {
          wx.showToast({ title: '云端保存失败', icon: 'none' })
        })
      }
    })
  }

  // ========== 编辑视图 ==========
  function enterEdit(id) {
    var s = (app.globalData.surveys || {})[id]
    if (!s) return
    // 深拷贝编辑，保存时才写回
    setData({
      editing: true,
      creating: false,
      showQForm: false,
      editSurvey: JSON.parse(JSON.stringify(s))
    })
  }

  function goEdit(e) {
    enterEdit(e.currentTarget.dataset.id)
  }

  function onEditTitle(e) {
    setData({ 'editSurvey.title': e.target.value }, true)
  }

  function onEditDesc(e) {
    setData({ 'editSurvey.description': e.target.value }, true)
  }

  // 删除已有题目
  function removeQuestion(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var qs = data.editSurvey.questions
    qs.splice(idx, 1)
    setData({ 'editSurvey.questions': qs })
  }

  // ===== 添加题目表单 =====
  function showQFormTap() {
    setData({ showQForm: true, typeIndex: 0, qTitle: '', qRequired: false, qOptions: ['', ''] })
  }

  function hideQForm() {
    setData({ showQForm: false })
  }

  function onTypeChange(e) {
    setData({ typeIndex: Number(e.target.value) })
  }

  function onQTitle(e) {
    setData({ qTitle: e.target.value }, true)
  }

  function onQRequired(e) {
    setData({ qRequired: e.target.checked }, true)
  }

  function onOptionInput(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var opts = data.qOptions
    opts[idx] = e.target.value
    setData({ qOptions: opts }, true)
  }

  function addOptionRow() {
    var opts = data.qOptions
    opts.push('')
    setData({ qOptions: opts })
  }

  function removeOptionRow(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var opts = data.qOptions
    if (opts.length <= 2) {
      wx.showToast({ title: '至少保留两个选项', icon: 'none' })
      return
    }
    opts.splice(idx, 1)
    setData({ qOptions: opts })
  }

  // 确认添加题目
  function confirmAddQuestion() {
    var type = TYPE_MAP[TYPE_OPTIONS[data.typeIndex]]
    var title = (data.qTitle || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写题目内容', icon: 'none' })
      return
    }
    var options = []
    if (type === 'radio' || type === 'checkbox') {
      options = data.qOptions.map(function (o) { return (o || '').trim() }).filter(function (o) { return o })
      if (options.length < 2) {
        wx.showToast({ title: '请至少填写两个选项', icon: 'none' })
        return
      }
    }
    var q = {
      id: 'q_' + Date.now(),
      type: type,
      title: title,
      required: data.qRequired,
      options: options
    }
    var qs = data.editSurvey.questions
    qs.push(q)
    setData({ 'editSurvey.questions': qs, showQForm: false })
    wx.showToast({ title: '题目已添加', icon: 'success' })
  }

  // 保存编辑（标题/描述/题目改动写回云端）
  function saveEdit() {
    var s = data.editSurvey
    if (!(s.title || '').trim()) {
      wx.showToast({ title: '问卷标题不能为空', icon: 'none' })
      return
    }
    setData({ saving: true })
    app.globalData.surveys[s.id] = JSON.parse(JSON.stringify(s))
    app.saveData().then(function () {
      wx.hideLoading()
      setData({ saving: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
      renderList()
    }).catch(function (err) {
      console.error('[问卷] 保存失败:', err)
      setData({ saving: false })
      wx.showModal({ title: '保存失败', content: '网络异常，请检查网络后重试', showCancel: false })
    })
  }

  function backToList() {
    renderList()
  }

  // 暴露给 HTML 内联事件
  window.onPasswordInput = onPasswordInput
  window.verifyPassword = verifyPassword
  window.startCreate = startCreate
  window.onNewTitle = onNewTitle
  window.onNewDesc = onNewDesc
  window.createSurvey = createSurvey
  window.cancelCreate = cancelCreate
  window.goEdit = goEdit
  window.toggleStatus = toggleStatus
  window.deleteSurvey = deleteSurvey
  window.onEditTitle = onEditTitle
  window.onEditDesc = onEditDesc
  window.removeQuestion = removeQuestion
  window.showQFormTap = showQFormTap
  window.hideQForm = hideQForm
  window.onTypeChange = onTypeChange
  window.onQTitle = onQTitle
  window.onQRequired = onQRequired
  window.onOptionInput = onOptionInput
  window.addOptionRow = addOptionRow
  window.removeOptionRow = removeOptionRow
  window.confirmAddQuestion = confirmAddQuestion
  window.backToList = backToList
  window.saveEdit = saveEdit

  // 页面就绪后依次执行原 onLoad / onShow 流程
  function boot() {
    render()
    onLoad()
    onShow()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
