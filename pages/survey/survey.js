// pages/survey/survey.js（网页版）
// 问卷调查页面：内嵌 TDuck 填鸭问卷系统（原小程序为 web-view，网页版用 iframe 承载）
// 用法：
//   1) 从问卷列表进入 -> 加载 app.js globalData.TDUCK_BASE_URL 指向的问卷系统
//   2) 也可携带 url 参数跳转，直接打开某个问卷的填写链接：
//      wx.navigateTo({ url: '/pages/survey/survey?url=' + encodeURIComponent('http://192.168.3.40:8999/s/xxxxxx') })
(function () {
  'use strict'

  var app = getApp()

  // 页面数据（对应原 data）
  var data = {
    webviewUrl: '', // 内嵌区最终加载的地址
    targetUrl: '', // 目标地址（用于重试）
    loading: true, // 是否正在检测服务器
    serverOk: false // 问卷服务器是否可达
  }

  function $(id) { return document.getElementById(id) }

  // setData：合并数据并刷新视图
  function setData(patch) {
    Object.keys(patch).forEach(function (k) { data[k] = patch[k] })
    render()
  }

  // 渲染三种状态视图（对应原条件渲染）
  function render() {
    $('loadingView').style.display = data.loading ? 'flex' : 'none'
    var ok = !data.loading && data.serverOk
    var wrap = $('webviewWrap')
    wrap.style.display = ok ? 'block' : 'none'
    $('errView').style.display = (!data.loading && !data.serverOk) ? 'flex' : 'none'
    if (ok) {
      // 加时间戳避免内嵌区缓存旧页面；地址不变时不重复赋值，防止重复加载
      var frame = $('webviewFrame')
      if (frame.getAttribute('src') !== data.webviewUrl) frame.setAttribute('src', data.webviewUrl)
    }
  }

  // 解析地址栏参数（值在此已解码，等价于原 options.url 再解码一次的结果）
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
    // 优先使用页面参数携带的地址（可直达某个问卷的填写页），否则使用全局配置
    var target = ''
    if (options && options.url) {
      target = options.url
    } else {
      target = app.globalData.TDUCK_BASE_URL || ''
    }

    if (!target) {
      console.error('[问卷] 未配置问卷系统地址，请在 app.js 的 globalData.TDUCK_BASE_URL 中配置')
      setData({ loading: false, serverOk: false, targetUrl: '' })
      return
    }

    // 去掉末尾多余的斜杠，统一拼接
    if (target.charAt(target.length - 1) === '/') {
      target = target.slice(0, -1)
    }
    setData({ targetUrl: target })
    checkServer(target)
  }

  // 检测问卷服务器是否可达，可达才渲染内嵌区，避免白屏
  function checkServer(target) {
    setData({ loading: true })
    wx.request({
      url: target + '/',
      method: 'GET',
      timeout: 5000,
      success: function (res) {
        console.log('[问卷] 服务器可达:', res.statusCode)
        setData({
          serverOk: true,
          // 加时间戳避免内嵌区缓存旧页面
          webviewUrl: target + '/?_t=' + Date.now()
        })
      },
      fail: function (err) {
        console.error('[问卷] 无法连接问卷服务器:', err)
        setData({ serverOk: false })
      },
      complete: function () {
        setData({ loading: false })
      }
    })
  }

  // 重试连接
  function onRetry() {
    if (data.targetUrl) checkServer(data.targetUrl)
  }

  // 暴露给 HTML 内联事件
  window.onRetry = onRetry

  // 页面就绪后执行原 onLoad 流程
  function boot() {
    render()
    onLoad(getQuery())
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
