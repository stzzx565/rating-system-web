// pages/survey/fill.js（网页版）
// 问卷填写页：动态渲染问卷题目，提交到 JSONBin 云端
// 支持他人通过分享链接直达本问卷填写页
(function () {
  'use strict'

  var app = getApp()

  // 页面数据（对应原 data）
  var data = {
    survey: null,
    questions: [], // 题目视图数据
    answers: {}, // { questionId: value }  radio/text/textarea/rate 为单值，checkbox 为数组
    submitted: false,
    submitting: false,
    missing: false, // 问卷不存在/已删除
    closed: false, // 问卷已停止收集
    alreadyFilled: false // 本设备已填写过（防重复提交）
  }

  function $(id) { return document.getElementById(id) }

  // HTML 转义，防止题目内容破坏结构
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // setData：合并数据并刷新状态视图
  function setData(patch) {
    Object.keys(patch).forEach(function (k) { data[k] = patch[k] })
    render()
  }

  // 渲染四个状态视图 + 填写视图 + 提交按钮状态
  function render() {
    $('missingBox').style.display = data.missing ? 'flex' : 'none'
    $('closedBox').style.display = data.closed ? 'flex' : 'none'
    $('successBox').style.display = data.submitted ? 'flex' : 'none'
    $('alreadyBox').style.display = data.alreadyFilled ? 'flex' : 'none'
    var showMain = !data.submitted && !data.missing && !data.closed && !data.alreadyFilled
    $('mainView').style.display = showMain ? 'block' : 'none'
    if (data.survey) {
      $('surveyTitle').textContent = data.survey.title
      $('surveyDesc').textContent = data.survey.description
      $('surveyDesc').style.display = data.survey.description ? 'block' : 'none'
    }
    var btn = $('submitBtn')
    btn.textContent = data.submitting ? '提交中...' : '提 交 问 卷'
    btn.className = 'submit-btn' + (data.submitting ? ' disabled' : '')
  }

  // 解析地址栏参数
  function getQuery() {
    var q = {}
    var s = location.search.replace(/^\?/, '')
    if (!s) return q
    s.split('&').forEach(function (kv) {
      var i = kv.indexOf('=')
      if (i < 0) q[decodeURIComponent(kv)] = ''
      else q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1))
    })
    return q
  }

  function onLoad(options) {
    var id = options && options.id
    var survey = (app.globalData.surveys || {})[id]
    if (!survey) {
      // 分享直达时可能本地还没同步云端数据，先拉一次再判断
      app.loadData().then(function () {
        var s = (app.globalData.surveys || {})[id]
        if (!s) {
          setData({ missing: true })
          wx.setNavigationBarTitle({ title: '问卷不存在' })
        } else if (s.status === 'closed') {
          setData({ closed: true })
          wx.setNavigationBarTitle({ title: '问卷已停止' })
        } else if (checkAlreadyFilled(s, options)) {
          // 本设备已填写过
        } else {
          initSurvey(s)
        }
      })
      return
    }
    if (survey.status === 'closed') {
      setData({ closed: true })
      wx.setNavigationBarTitle({ title: '问卷已停止' })
      return
    }
    if (checkAlreadyFilled(survey, options)) return
    initSurvey(survey)
  }

  // 防重复：本设备已提交过则显示已填写页；管理员测试可带 redo=1 参数重新填写
  function checkAlreadyFilled(survey, options) {
    if (options && options.redo) return false
    if (wx.getStorageSync('sv_submitted_' + survey.id)) {
      setData({ alreadyFilled: true })
      wx.setNavigationBarTitle({ title: '已填写' })
      return true
    }
    return false
  }

  // 本设备唯一标识（随答卷保存，便于管理员排查重复）
  function getDeviceId() {
    var did = wx.getStorageSync('sv_device_id')
    if (!did) {
      did = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      wx.setStorageSync('sv_device_id', did)
    }
    return did
  }

  function initSurvey(survey) {
    // 题目视图数据：为评分题准备星星数组
    var questions = (survey.questions || []).map(function (q) {
      return {
        id: q.id,
        type: q.type,
        title: q.title,
        required: !!q.required,
        options: q.options || [],
        stars: q.type === 'rate' ? [1, 2, 3, 4, 5] : []
      }
    })
    data.survey = {
      id: survey.id,
      title: survey.title,
      description: survey.description || ''
    }
    data.questions = questions
    renderQuestions()
    render()
    wx.setNavigationBarTitle({ title: survey.title || '问卷填写' })
  }

  // 题型中文提示
  function typeText(type) {
    return type === 'radio' ? '单选题'
      : type === 'checkbox' ? '多选题'
      : type === 'text' ? '简答题'
      : type === 'textarea' ? '问答题'
      : '评分题'
  }

  // 动态渲染题目卡片
  function renderQuestions() {
    $('questionList').innerHTML = data.questions.map(function (item, index) {
      var body = ''
      if (item.type === 'radio' || item.type === 'checkbox') {
        var inputType = item.type === 'radio' ? 'radio' : 'checkbox'
        body = '<div class="option-group" data-qid="' + esc(item.id) + '">' +
          item.options.map(function (opt) {
            return '<label class="option-item">' +
              '<input type="' + inputType + '" name="q_' + esc(item.id) + '" value="' + esc(opt) + '" data-qid="' + esc(item.id) + '">' +
              '<span class="option-text">' + esc(opt) + '</span>' +
              '</label>'
          }).join('') +
          '</div>'
      } else if (item.type === 'text') {
        body = '<input class="text-input" placeholder="请输入" data-qid="' + esc(item.id) + '">'
      } else if (item.type === 'textarea') {
        body = '<textarea class="textarea-input" placeholder="请输入" maxlength="500" data-qid="' + esc(item.id) + '"></textarea>'
      } else if (item.type === 'rate') {
        // 评分（点击星星）
        body = '<div class="rate-row" data-qid="' + esc(item.id) + '">' +
          item.stars.map(function (star) {
            return '<span class="star" data-qid="' + esc(item.id) + '" data-score="' + star + '" onclick="onRate(event)">★</span>'
          }).join('') +
          '<span class="rate-num" style="display:none;"></span>' +
          '</div>'
      }
      return '<div class="question-card">' +
        '<div class="q-title-row">' +
          '<span class="q-index">' + (index + 1) + '.</span>' +
          '<span class="q-title">' + esc(item.title) + '</span>' +
          (item.required ? '<span class="q-required">*</span>' : '') +
        '</div>' +
        '<span class="q-type-hint">' + typeText(item.type) + '</span>' +
        body +
        '</div>'
    }).join('')
  }

  // ========== 答题交互 ==========
  // 单选
  function onRadioChange(qid, value) {
    data.answers[qid] = value
  }

  // 多选
  function onCheckboxChange(qid, values) {
    data.answers[qid] = values
  }

  // 文本输入（单行/多行共用）
  function onTextInput(qid, value) {
    data.answers[qid] = value
  }

  // 评分（点击星星）
  function onRate(e) {
    var el = e.currentTarget
    var qid = el.getAttribute('data-qid')
    var score = Number(el.getAttribute('data-score'))
    data.answers[qid] = score
    // 局部刷新星星高亮与分值，不整体重绘以保留输入内容
    var row = el.parentNode
    Array.prototype.forEach.call(row.querySelectorAll('.star'), function (s) {
      var on = Number(s.getAttribute('data-score')) <= score
      s.className = on ? 'star star-on' : 'star'
    })
    var num = row.querySelector('.rate-num')
    num.style.display = score ? 'inline' : 'none'
    num.textContent = score + ' 分'
  }

  // 题目区事件委托（题目为动态渲染，统一在此挂载）
  function attachDelegates() {
    var list = $('questionList')
    list.addEventListener('change', function (e) {
      var t = e.target
      var qid = t.getAttribute('data-qid')
      if (!qid) return
      if (t.type === 'radio') {
        onRadioChange(qid, t.value)
      } else if (t.type === 'checkbox') {
        var group = t.closest('.option-group')
        var values = []
        Array.prototype.forEach.call(group.querySelectorAll('input[type="checkbox"]'), function (cb) {
          if (cb.checked) values.push(cb.value)
        })
        onCheckboxChange(qid, values)
      }
    })
    list.addEventListener('input', function (e) {
      var t = e.target
      if (t.type === 'radio' || t.type === 'checkbox') return
      var qid = t.getAttribute('data-qid')
      if (!qid) return
      onTextInput(qid, t.value)
    })
  }

  // 提交前校验必填
  function validate() {
    var questions = data.questions
    var answers = data.answers
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i]
      var v = answers[q.id]
      if (q.required) {
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
          wx.showToast({ title: '请完成第 ' + (i + 1) + ' 题', icon: 'none' })
          return false
        }
      }
    }
    return true
  }

  // 提交问卷：拉取云端最新 -> 合并 -> 写回（避免覆盖他人提交）
  function submitSurvey() {
    if (data.submitting || data.submitted) return
    if (!validate()) return

    var surveyId = data.survey.id
    data.submitting = true
    render()

    wx.showLoading({ title: '提交中...', mask: true })

    // 1. 先拉取云端最新数据，把别人刚提交的答卷合进来
    app.globalData.surveyResponses = app.globalData.surveyResponses || {}
    app.loadData().then(function () {
      var responses = app.globalData.surveyResponses || {}
      var list = responses[surveyId] || []
      list.push({
        name: wx.getStorageSync('surveyUserName') || '微信用户',
        did: getDeviceId(),
        answers: data.answers,
        submitTime: Date.now()
      })
      responses[surveyId] = list
      app.globalData.surveyResponses = responses
      // 2. 写回云端
      app.saveData().then(function () {
        wx.hideLoading()
        // 标记本设备已提交，防止重复填写
        wx.setStorageSync('sv_submitted_' + surveyId, 1)
        data.submitted = true
        data.submitting = false
        render()
        wx.showToast({ title: '提交成功，感谢参与！', icon: 'success' })
      }).catch(function (err) {
        wx.hideLoading()
        console.error('[问卷] 提交失败:', err)
        data.submitting = false
        render()
        wx.showModal({
          title: '提交失败',
          content: '网络异常，请检查网络后重试',
          showCancel: false
        })
      })
    })
  }

  function backToList() {
    // 分享直达时没有上级页面，回首页
    if (history.length <= 1) {
      wx.switchTab({ url: '/pages/index/index' })
    } else {
      wx.navigateBack()
    }
  }

  // 暴露给 HTML 内联事件
  window.onRate = onRate
  window.submitSurvey = submitSurvey
  window.backToList = backToList

  // 页面就绪后执行原 onLoad 流程
  function boot() {
    attachDelegates()
    render()
    onLoad(getQuery())
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
