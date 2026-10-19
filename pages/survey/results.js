// pages/survey/results.js（网页版）
// 问卷结果统计页（管理员）：选择题计次、评分均值、文本答案列表
(function () {
  'use strict'

  var app = getApp()

  // 页面数据（对应原 data）
  var data = {
    survey: null,
    total: 0,
    statQuestions: [] // 统计视图数据
  }

  // 当前问卷 id（对应原实例属性）
  var surveyId = ''

  function $(id) { return document.getElementById(id) }

  // HTML 转义，防止答案内容破坏结构
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

  // 渲染头部、空状态与统计卡片
  function render() {
    $('headTitle').textContent = data.survey ? data.survey.title : ''
    $('headTotal').textContent = '共 ' + data.total + ' 份答卷'
    $('emptyBox').style.display = data.total === 0 ? 'flex' : 'none'
    $('statList').innerHTML = data.statQuestions.map(statCardHTML).join('')
  }

  // 单个题目的统计卡片
  function statCardHTML(item, index) {
    var html = '<div class="stat-card">' +
      '<div class="q-head">' +
        '<span class="q-title">' + (index + 1) + '. ' + esc(item.title) + '</span>' +
        '<span class="q-tag">' + item.typeText + '</span>' +
      '</div>'

    // 单选/多选：选项计次条
    if (item.type === 'radio' || item.type === 'checkbox') {
      if (item.optionStats.length === 0) {
        html += '<span class="no-answer">暂无数据</span>'
      } else {
        html += item.optionStats.map(function (opt) {
          return '<div class="opt-stat">' +
            '<div class="opt-line">' +
              '<span class="opt-label">' + esc(opt.label) + '</span>' +
              '<span class="opt-count">' + opt.count + ' 票 · ' + opt.percent + '%</span>' +
            '</div>' +
            '<div class="bar-bg"><div class="bar-fill" style="width:' + opt.width + '%;"></div></div>' +
            '</div>'
        }).join('')
      }
    } else if (item.type === 'rate') {
      // 评分：均值 + 星级分布
      html += '<div class="avg-row">' +
        '<span class="avg-score">' + esc(item.avgScore) + '</span>' +
        '<span class="avg-unit">平均分（5 分制）</span>' +
        '</div>'
      if (item.rateDist.length === 0) {
        html += '<span class="no-answer">暂无数据</span>'
      } else {
        html += item.rateDist.map(function (r) {
          return '<div class="opt-stat">' +
            '<div class="opt-line">' +
              '<span class="opt-label">' + r.star + ' 星</span>' +
              '<span class="opt-count">' + r.count + ' 次 · ' + r.percent + '%</span>' +
            '</div>' +
            '<div class="bar-bg rate-bg"><div class="bar-fill rate-fill" style="width:' + r.percent + '%;"></div></div>' +
            '</div>'
        }).join('')
      }
    } else {
      // 文本：答案列表
      if (item.textAnswers.length === 0) {
        html += '<span class="no-answer">暂无数据</span>'
      } else {
        html += item.textAnswers.map(function (ans) {
          return '<div class="text-answer">' +
            '<span class="ans-name">' + esc(ans.name) + '：</span>' +
            '<span class="ans-text">' + esc(ans.text) + '</span>' +
            '</div>'
        }).join('')
      }
    }
    return html + '</div>'
  }

  function onLoad(options) {
    surveyId = options && options.id
  }

  function onShow() {
    // 每次进入都拉取云端最新答卷
    app.loadData().then(function () {
      renderStats()
    })
  }

  function renderStats() {
    var survey = (app.globalData.surveys || {})[surveyId]
    if (!survey) {
      wx.showToast({ title: '问卷不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
      return
    }
    var responses = (app.globalData.surveyResponses || {})[surveyId] || []
    var total = responses.length

    var statQuestions = (survey.questions || []).map(function (q) {
      var stat = {
        id: q.id,
        title: q.title,
        type: q.type,
        typeText: q.type === 'radio' ? '单选题' : q.type === 'checkbox' ? '多选题' : q.type === 'text' ? '简答题' : q.type === 'textarea' ? '问答题' : '评分题',
        // 选择题：选项计次
        optionStats: [],
        // 评分题
        avgScore: 0,
        rateDist: [],
        // 文本题
        textAnswers: []
      }

      if (q.type === 'radio' || q.type === 'checkbox') {
        var counts = {}
        for (var i = 0; i < responses.length; i++) {
          var v = responses[i].answers[q.id]
          if (v === undefined) continue
          var arr = Array.isArray(v) ? v : [v]
          for (var j = 0; j < arr.length; j++) {
            counts[arr[j]] = (counts[arr[j]] || 0) + 1
          }
        }
        var maxCount = Math.max.apply(null, [0].concat(Object.keys(counts).map(function (k) { return counts[k] })))
        stat.optionStats = (q.options || []).map(function (opt) {
          var c = counts[opt] || 0
          return {
            label: opt,
            count: c,
            percent: total ? Math.round(c * 100 / total) : 0,
            width: maxCount ? Math.round(c * 100 / maxCount) : 0
          }
        })
      } else if (q.type === 'rate') {
        var sum = 0
        var n = 0
        var dist = [0, 0, 0, 0, 0]
        for (var i2 = 0; i2 < responses.length; i2++) {
          var v2 = Number(responses[i2].answers[q.id])
          if (!v2) continue
          sum += v2
          n++
          if (v2 >= 1 && v2 <= 5) dist[v2 - 1]++
        }
        stat.avgScore = n ? (sum / n).toFixed(1) : '0.0'
        stat.rateDist = dist.map(function (c2, idx) {
          return { star: idx + 1, count: c2, percent: n ? Math.round(c2 * 100 / n) : 0 }
        }).reverse()
      } else {
        for (var i3 = responses.length - 1; i3 >= 0; i3--) {
          var v3 = responses[i3].answers[q.id]
          if (v3) stat.textAnswers.push({ name: responses[i3].name || '匿名', text: v3 })
        }
      }
      return stat
    })

    setData({
      survey: { title: survey.title },
      total: total,
      statQuestions: statQuestions
    })
  }

  // 页面就绪后依次执行原 onLoad / onShow 流程
  function boot() {
    render()
    onLoad(getQuery())
    onShow()
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
