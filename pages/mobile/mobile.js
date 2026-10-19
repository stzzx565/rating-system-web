/**
 * 评分页（评委端）网页版
 * 由小程序 pages/mobile/mobile.js 转换而来：
 * - Page({ data, onLoad, onShow, ... }) → IIFE，DOM 就绪后依次执行 onLoad / onShow
 * - setData → 合并 data 后调用 render() 重绘对应区域
 * - wx.* 由 js/wx-shim.js 提供，getApp() 由 js/app.js 提供
 * - 动态区域（组别、评分维度、我的评分、详情）由渲染函数生成，事件用委托
 */
(function () {
  'use strict';

  // ==================== 页面数据（对应原 Page 的 data） ====================
  var data = {
    currentPage: 'group',
    currentGroup: '',
    currentSchemeId: 'scheme1',
    isSubmitting: false,
    completedCount: 0,
    totalCount: 0,
    groups: [],
    dimensions: [],
    totalScore: 0,
    reRatingRequests: [],
    showMessage: false,
    message: '',
    messageType: 'success',
    schemeName: '默认评分方案',
    // 评委相关数据
    userId: '',
    userName: '',
    judgeName: '', // 评委姓名
    requireJudgeName: true, // 是否要求填写姓名
    allowJudgeViewDetails: true, // 是否允许查看详情
    hasStartedRating: false, // 是否已开始评分
    // 所有评分情况
    allRatings: [],
    // 评分详情
    showRatingDetails: false,
    detailDimensions: []
  };

  // ==================== 渲染工具 ====================

  // HTML 转义，防止组别名/描述里的特殊字符破坏结构
  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  function $(id) {
    return document.getElementById(id);
  }

  // setData：合并数据并重绘（对应原小程序 setData）
  function setData(patch, callback) {
    Object.keys(patch || {}).forEach(function (key) {
      data[key] = patch[key];
    });
    render();
    if (typeof callback === 'function') callback();
  }

  // 总渲染：逐块幂等重绘
  function render() {
    renderPages();
    renderStat();
    renderGroups();
    renderReRatingRequests();
    renderUserInfo();
    renderSchemeInfo();
    renderDimensions();
    renderTotalScore();
    renderButtons();
    renderReview();
    renderAllRatings();
    renderRatingDetails();
    renderMessage();
  }

  // 页面切换（原页面三页的 active/hidden 切换）
  function renderPages() {
    var map = { group: 'mobileGroupPage', rating: 'mobileRatingPage', review: 'mobileReviewPage' };
    Object.keys(map).forEach(function (key) {
      var el = $(map[key]);
      if (!el) return;
      if (data.currentPage === key) {
        el.classList.add('active');
        el.classList.remove('hidden');
      } else {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });
    // 评分页标题：组名 + " 评分"
    $('ratingHeaderTitle').textContent = data.currentGroup + ' 评分';
  }

  // 已评分进度（已完成数/总数）
  function renderStat() {
    $('statValue').textContent = data.completedCount + '/' + data.totalCount;
  }

  // 组别按钮列表
  function renderGroups() {
    $('groupSelectionContainer').innerHTML = data.groups.map(function (item) {
      return '<div class="group-btn' + (item.completed ? ' completed' : '') + '" data-group="' + esc(item.name) + '">' +
        '<span class="group-icon">' + esc(item.icon) + '</span>' +
        '<span class="group-name">' + esc(item.name) + '</span>' +
        '<span class="group-status">' + (item.completed ? '已评分 ✓' : '待评分') + '</span>' +
        '</div>';
    }).join('');
  }

  // 我的重评请求列表
  function renderReRatingRequests() {
    var list = data.reRatingRequests;
    if (!list || list.length === 0) {
      $('myReRatingRequests').innerHTML = '<div class="empty-requests"><span class="empty-text">暂无重评请求</span></div>';
      return;
    }
    $('myReRatingRequests').innerHTML = list.map(function (item) {
      var cls = item.status === 'pending' ? 'pending' : item.status === 'approved' ? 'approved' : 'rejected';
      var text = item.status === 'pending' ? '⏳ 待审批' : item.status === 'approved' ? '✅ 已批准' : '❌ 已拒绝';
      return '<div class="request-item">' +
        '<div class="request-info">' +
        '<span class="request-group">' + esc(item.groupName) + '</span>' +
        '<span class="request-time">' + esc(item.requestTime) + '</span>' +
        '</div>' +
        '<span class="request-status ' + cls + '">' + text + '</span>' +
        '</div>';
    }).join('');
  }

  // 个人信息：用户名、姓名输入框（requireJudgeName 控制是否显示、hasStartedRating 控制禁用）
  function renderUserInfo() {
    var app = getApp();
    $('userNameText').textContent = data.userName;

    var wrap = $('judgeNameInputWrap');
    wrap.style.display = data.requireJudgeName ? '' : 'none';

    var input = $('judgeNameInput');
    var placeholder = (app && app.globalData && app.globalData.judgeNamePlaceholder) || '请输入您的姓名';
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    if (input.value !== data.judgeName) input.value = data.judgeName;

    var disabled = !!data.hasStartedRating;
    if (input.disabled !== disabled) input.disabled = disabled;
    input.style.backgroundColor = disabled ? '#f5f5f5' : '';
    input.style.color = disabled ? '#999' : '';

    $('judgeNameHint').style.display = data.hasStartedRating ? 'block' : 'none';
  }

  // 评分方案名称
  function renderSchemeInfo() {
    $('schemeName').textContent = data.schemeName;
  }

  // 构建评分明细（结构变化时重建，避免拖动滑块时打断交互）
  function buildDimensions() {
    $('dimensionsContainer').innerHTML = data.dimensions.map(function (item, index) {
      return '<div class="dimension-item">' +
        '<div class="dimension-header">' +
        '<span class="dimension-name">' + esc(item.name) + '</span>' +
        '<span class="dimension-weight">' + esc(item.weight) + '%</span>' +
        '</div>' +
        '<div class="score-slider">' +
        '<span class="score-min">' + esc(item.minScore) + '</span>' +
        '<input type="range" class="slider" id="score' + index + '" data-index="' + index + '" ' +
        'min="' + esc(item.minScore) + '" max="' + esc(item.maxScore) + '" value="' + esc(item.value) + '">' +
        '<span class="slider-value">' + esc(item.value) + '</span>' +
        '<span class="score-max">' + esc(item.maxScore) + '</span>' +
        '</div>' +
        '<div class="score-description">' + esc(item.description) + '</div>' +
        '</div>';
    }).join('');
  }

  // 评分维度（滑块 + 快捷分值描述）
  function renderDimensions() {
    var container = $('dimensionsContainer');
    var dims = data.dimensions || [];
    var sig = dims.length + '|' + dims.map(function (d) {
      return [d.name, d.weight, d.minScore, d.maxScore].join(':');
    }).join(';');

    if (container.getAttribute('data-sig') !== sig) {
      buildDimensions();
      container.setAttribute('data-sig', sig);
    }

    dims.forEach(function (d, i) {
      var item = container.children[i];
      if (!item) return;
      var value = String(d.value);
      var range = item.querySelector('input[type="range"]');
      if (range && range.value !== value) range.value = value;
      var valueEl = item.querySelector('.slider-value');
      if (valueEl && valueEl.textContent !== value) valueEl.textContent = value;
      var descEl = item.querySelector('.score-description');
      var desc = d.description === undefined || d.description === null ? '' : String(d.description);
      if (descEl && descEl.textContent !== desc) descEl.textContent = desc;
    });
  }

  // 总分
  function renderTotalScore() {
    $('totalScore').textContent = data.totalScore;
  }

  // 提交/重评按钮状态
  function renderButtons() {
    var submitBtn = $('submitBtn');
    submitBtn.disabled = !!data.isSubmitting;
    submitBtn.textContent = data.isSubmitting ? '提交中...' : '📤 提交评分';
    $('reRateBtn').disabled = !!data.isSubmitting;
  }

  // 评分结果页头部信息
  function renderReview() {
    $('reviewGroup').textContent = data.currentGroup;
    $('reviewScore').textContent = '您的评分：' + data.totalScore;
  }

  // 我的所有评分列表
  function renderAllRatings() {
    $('allRatingsList').innerHTML = (data.allRatings || []).map(function (item) {
      var dis = !data.allowJudgeViewDetails;
      return '<div class="rating-item">' +
        '<div class="rating-item-header">' +
        '<span class="rating-group-name">' + esc(item.groupName) + '</span>' +
        '<span class="rating-score">' + esc(item.totalScore) + '分</span>' +
        '</div>' +
        '<span class="rating-time">评分时间：' + esc(item.timestamp) + '</span>' +
        '<button class="btn btn-small btn-primary' + (dis ? ' disabled' : '') + '" ' +
        'data-group="' + esc(item.groupName) + '"' + (dis ? ' disabled' : '') + '>查看详情</button>' +
        '</div>';
    }).join('');
  }

  // 评分详情（allowJudgeViewDetails 控制）
  function renderRatingDetails() {
    var section = $('ratingDetailsSection');
    section.style.display = data.showRatingDetails ? 'block' : 'none';
    if (!data.showRatingDetails) return;

    $('detailsGroupName').textContent = '组别：' + data.currentGroup;
    $('detailDimensions').innerHTML = (data.detailDimensions || []).map(function (item) {
      return '<div class="dimension-score-item">' +
        '<div class="dimension-name">' + esc(item.name) + '</div>' +
        '<div class="dimension-score">' +
        '<span class="score-value">' + esc(item.value) + '分</span>' +
        '<span class="score-description">' + esc(item.description) + '</span>' +
        '</div></div>';
    }).join('');
    $('detailsTotalValue').textContent = data.totalScore + '分';
  }

  // 提示消息
  function renderMessage() {
    var el = $('pageMessage');
    el.className = 'message' + (data.showMessage ? ' active' : '') + (data.messageType ? ' ' + data.messageType : '');
    $('messageText').textContent = data.message;
  }

  // ==================== 页面生命周期与业务逻辑（函数名与原版一致） ====================

  // 页面加载
  function onLoad(options) {
    console.log('评委端页面加载');

    var app = getApp();

    // 加载设置
    setData({
      requireJudgeName: app.globalData.requireJudgeName,
      allowJudgeViewDetails: app.globalData.allowJudgeViewDetails
    });

    // 从本地存储加载评委姓名
    var savedJudgeName = wx.getStorageSync('ratingJudgeName');
    if (savedJudgeName) {
      setData({
        judgeName: savedJudgeName
      });
    }

    // 生成或获取用户ID
    generateUserId();

    // 初始化页面
    initPage();
  }

  // 页面显示
  function onShow() {
    console.log('评委端页面显示');

    // 重新加载设置
    var app = getApp();
    setData({
      requireJudgeName: app.globalData.requireJudgeName,
      allowJudgeViewDetails: app.globalData.allowJudgeViewDetails
    });

    // 重新加载数据
    initPage();
  }

  // 生成用户ID
  function generateUserId() {
    var userId = wx.getStorageSync('ratingUserId');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      wx.setStorageSync('ratingUserId', userId);
    }

    // 优先使用评委姓名作为userName
    var userName = data.judgeName || '评委' + userId.slice(-4);

    setData({
      userId: userId,
      userName: userName // 使用评委姓名或生成的用户名
    });

    console.log('用户ID:', userId);
    console.log('用户名称:', userName);
  }

  // 获取用户信息
  function getUserInfo() {
    wx.getUserProfile({
      desc: '用于显示评委名称',
      success: function (res) {
        console.log('获取用户信息成功:', res.userInfo);

        // 更新全局用户信息
        var app = getApp();
        app.globalData.userInfo = res.userInfo;

        // 更新本地用户名称
        setData({
          userName: res.userInfo.nickName
        });

        console.log('已更新用户名为微信昵称:', res.userInfo.nickName);
        showMessage('✅ 已成功获取微信昵称！', 'success');
      },
      fail: function (err) {
        console.error('获取用户信息失败:', err);
        showMessage('⚠️ 获取微信昵称失败，请稍后重试', 'warning');
      }
    });
  }

  // 初始化页面
  function initPage() {
    var app = getApp();

    // 加载全局数据
    var scheme = app.globalData.ratingSchemes[app.globalData.currentSchemeId];
    setData({
      currentSchemeId: app.globalData.currentSchemeId,
      schemeName: (scheme && scheme.name) || '默认评分方案'
    });

    // 更新组别选择
    updateGroupSelection();

    // 更新我的重评请求
    updateMyReRatingRequests();
  }

  // 显示页面（支持字符串参数与原事件对象两种形式）
  function showMobilePage(e) {
    var target = 'group';
    if (typeof e === 'string') {
      target = e;
    } else if (e && e.currentTarget && e.currentTarget.dataset) {
      target = e.currentTarget.dataset.page || 'group';
    }

    setData({ currentPage: target });
  }

  // 更新组别选择
  function updateGroupSelection() {
    var app = getApp();

    // 生成组别列表
    var groups = app.globalData.groupNames.map(function (groupName, index) {
      var hasRated = hasUserRated(groupName);
      var icon = index === 0 ? '🧴' : '💆';

      return {
        name: groupName,
        icon: icon,
        completed: hasRated
      };
    });

    // 计算完成数量
    var completedCount = groups.filter(function (group) { return group.completed; }).length;
    var totalCount = groups.length;

    setData({
      groups: groups,
      completedCount: completedCount,
      totalCount: totalCount
    });

    // 检查是否所有组都已评分完成
    if (totalCount > 0 && completedCount === totalCount) {
      // 所有组都已评分完成，清空姓名和标记
      setData({
        judgeName: '',
        hasStartedRating: false
      });

      // 清除本地存储的姓名
      wx.removeStorageSync('ratingJudgeName');

      // 更新userName
      generateUserId();

      console.log('所有组评分完成，已清空姓名');
    }
  }

  // 检查用户是否已评分
  function hasUserRated(groupName) {
    var app = getApp();
    var userId = data.userId;
    var group = app.globalData.groupsData[groupName] || { scores: [] };

    return group.scores.some(function (score) { return score.userId === userId; });
  }

  // 选择组别
  function selectGroup(e) {
    var groupName = e.currentTarget.dataset.group;

    setData({
      currentGroup: groupName
    });

    var app = getApp();

    // 检查是否要求填写姓名
    if (data.requireJudgeName && !data.judgeName) {
      showMessage('⚠️ 请先填写您的姓名', 'warning');
      return;
    }

    // 检查是否已评分（基于本地数据）
    var hasRated = hasUserRated(groupName);

    if (hasRated) {
      // 已评分，显示结果页面
      showRatingResult(groupName);
      setData({ currentPage: 'review' });
    } else {
      // 未评分，先从云端加载最新评分方案
      app.loadData().then(function (success) {
        console.log('加载云端数据:', success ? '成功' : '失败');

        // 更新当前方案ID
        var scheme = app.globalData.ratingSchemes[app.globalData.currentSchemeId];
        setData({
          currentSchemeId: app.globalData.currentSchemeId,
          schemeName: (scheme && scheme.name) || '默认评分方案',
          hasStartedRating: true // 标记已开始评分
        });

        // 显示评分页面
        setData({ currentPage: 'rating' });
        loadRatingScheme();
      });
    }
  }

  // 加载评分方案
  function loadRatingScheme() {
    var app = getApp();
    var scheme = app.globalData.ratingSchemes[data.currentSchemeId];

    if (scheme) {
      // 初始化维度数据
      var dimensions = scheme.dimensions.map(function (dimension) {
        return {
          name: dimension.name,
          weight: dimension.weight,
          minScore: dimension.minScore,
          maxScore: dimension.maxScore,
          value: Math.floor((dimension.minScore + dimension.maxScore) / 2), // 默认中间值
          description: dimension.scoreLevels[Math.floor(dimension.scoreLevels.length / 2)].description
        };
      });

      // 计算总分
      var totalScore = calculateTotalScore(dimensions);

      setData({
        dimensions: dimensions,
        totalScore: totalScore,
        schemeName: scheme.name
      });
    }
  }

  // 计算总分
  function calculateTotalScore(dimensions) {
    var total = 0;
    dimensions.forEach(function (dim) {
      total += dim.value;
    });
    return total.toFixed(2);
  }

  // 滑块变化事件
  function onSliderChange(e) {
    var index = e.currentTarget.dataset.index;
    var value = parseFloat(e.detail.value);

    var dimensions = data.dimensions.slice();
    dimensions[index].value = value;

    // 更新维度描述
    var scheme = getApp().globalData.ratingSchemes[data.currentSchemeId];
    if (scheme && scheme.dimensions[index]) {
      var scoreLevels = scheme.dimensions[index].scoreLevels;
      // 查找最接近的评分描述
      var closestLevel = scoreLevels[0];
      var minDiff = Math.abs(value - scoreLevels[0].score);

      scoreLevels.forEach(function (level) {
        var diff = Math.abs(value - level.score);
        if (diff < minDiff) {
          minDiff = diff;
          closestLevel = level;
        }
      });

      dimensions[index].description = closestLevel.description;
    }

    // 更新总分
    var totalScore = calculateTotalScore(dimensions);

    setData({
      dimensions: dimensions,
      totalScore: totalScore
    });
  }

  // 提交评分
  function submitRating() {
    if (data.isSubmitting) {
      showMessage('⚠️ 正在提交中，请稍候...', 'warning');
      return;
    }

    if (!data.currentGroup) {
      showMessage('⚠️ 请先选择要评分的组别', 'warning');
      return;
    }

    // 检查是否已填写姓名（如果管理端要求）
    if (data.requireJudgeName && !data.judgeName) {
      showMessage('⚠️ 请先填写您的姓名', 'warning');
      return;
    }

    // 直接提交评分
    doSubmitRating();
  }

  // 处理评委姓名输入
  function onJudgeNameInput(e) {
    var judgeName = e.detail.value;
    setData({
      judgeName: judgeName
    });

    // 保存到本地存储
    wx.setStorageSync('ratingJudgeName', judgeName);

    // 更新userName
    generateUserId();

    console.log('评委姓名已更新:', judgeName);
  }

  // 强制获取微信昵称
  function forceGetUserInfo(callback) {
    wx.showModal({
      title: '需要微信昵称',
      content: '为了确保评分的可追溯性，系统需要获取您的微信昵称。请点击下方按钮授权。',
      showCancel: false,
      confirmText: '授权获取微信昵称',
      success: function () {
        wx.getUserProfile({
          desc: '用于显示评委名称，确保评分可追溯',
          success: function (res) {
            console.log('强制获取用户信息成功:', res.userInfo);

            // 更新全局用户信息
            var app = getApp();
            app.globalData.userInfo = res.userInfo;

            // 更新本地用户名称
            setData({
              userName: res.userInfo.nickName
            });

            console.log('已更新用户名为微信昵称:', res.userInfo.nickName);
            showMessage('✅ 已成功获取微信昵称！', 'success');

            // 回调继续提交
            if (callback) {
              callback();
            }
          },
          fail: function (err) {
            console.error('强制获取用户信息失败:', err);
            showMessage('⚠️ 授权失败，无法提交评分。请重新进入页面并授权获取微信昵称。', 'error');
          }
        });
      }
    });
  }

  // 执行提交评分的实际操作
  function doSubmitRating() {
    setData({ isSubmitting: true });

    var app = getApp();
    var groupName = data.currentGroup;
    var scheme = app.globalData.ratingSchemes[data.currentSchemeId];

    if (!scheme) {
      showMessage('⚠️ 评分方案未找到', 'error');
      setData({ isSubmitting: false });
      return;
    }

    // 收集评分数据
    var rating = {
      timestamp: Date.now(),
      schemeId: data.currentSchemeId,
      total: parseFloat(data.totalScore),
      userId: data.userId,
      userName: data.userName
    };

    // 添加各维度分数
    data.dimensions.forEach(function (dimension, index) {
      rating['dimension' + index] = parseFloat(dimension.value);
    });

    console.log('提交评分:', rating);

    // 保存评分到云端
    if (!app.globalData.groupsData[groupName]) {
      app.globalData.groupsData[groupName] = {
        scores: [],
        finalScore: 0,
        lastUpdate: Date.now()
      };
    }

    // 添加评分
    var group = app.globalData.groupsData[groupName];
    group.scores.push(rating);
    group.lastUpdate = Date.now();

    // 记录评分历史（ratingHistory 随 saveData 一并云同步）
    if (!app.globalData.ratingHistory) app.globalData.ratingHistory = [];
    app.globalData.ratingHistory.push({
      timestamp: rating.timestamp,
      schemeId: rating.schemeId,
      total: rating.total,
      userId: rating.userId,
      userName: rating.userName,
      groupName: groupName
    });

    // 重新计算最终得分
    calculateFinalScores();

    // 保存数据到云端
    app.saveData().then(function (success) {
      if (success) {
        showMessage('✅ ' + groupName + ' 评分提交成功！', 'success');
      } else {
        showMessage('⚠️ ' + groupName + ' 评分已保存到本地，但云端同步失败', 'warning');
      }

      // 3秒后返回选择页面
      setTimeout(function () {
        setData({
          isSubmitting: false
        });

        // 返回选择页面并更新状态
        showMobilePage({ currentTarget: { dataset: { page: 'group' } } });
        updateGroupSelection();
      }, 3000);
    }).catch(function (err) {
      console.error('保存数据失败:', err);
      showMessage('⚠️ 评分提交失败，请检查网络连接', 'error');
      setData({ isSubmitting: false });
    });
  }

  // 计算各组最终得分（简单实现：计算平均分）
  function calculateFinalScores() {
    var app = getApp();

    Object.keys(app.globalData.groupsData).forEach(function (groupName) {
      var group = app.globalData.groupsData[groupName];
      if (group.scores.length > 0) {
        var total = group.scores.reduce(function (sum, score) { return sum + score.total; }, 0);
        group.finalScore = (total / group.scores.length).toFixed(2);
      }
    });
  }

  // 申请重评
  function requestReRating() {
    if (!data.currentGroup) {
      showMessage('⚠️ 请先选择要重评的组别', 'warning');
      return;
    }

    var app = getApp();
    var groupName = data.currentGroup;

    // 检查是否已经有重评请求
    var existingRequest = app.globalData.reRatingRequests.find(function (req) {
      return req.userId === data.userId && req.groupName === groupName && req.status === 'pending';
    });

    if (existingRequest) {
      showMessage('⚠️ 您已经有该组的重评请求，正在等待审批', 'warning');
      return;
    }

    wx.showModal({
      title: '确认重评',
      content: '确定要申请对 ' + groupName + ' 进行重评吗？',
      success: function (res) {
        if (res.confirm) {
          // 创建重评请求
          var request = {
            id: 'request_' + Date.now(),
            userId: data.userId,
            userName: data.userName,
            groupName: groupName,
            status: 'pending',
            requestTime: new Date().toLocaleString(),
            timestamp: Date.now()
          };

          // 添加到全局数据
          app.globalData.reRatingRequests.push(request);

          // 保存数据
          app.saveData().then(function (success) {
            if (success) {
              showMessage('✅ 重评请求已提交，等待管理员审批', 'success');
              updateMyReRatingRequests();
            } else {
              showMessage('⚠️ 重评请求已保存到本地，但云端同步失败', 'warning');
            }
          });
        }
      }
    });
  }

  // 更新我的重评请求
  function updateMyReRatingRequests() {
    var app = getApp();
    var userId = data.userId;

    // 显示所有状态的请求
    var myRequests = app.globalData.reRatingRequests.filter(function (req) {
      return req.userId === userId;
    });

    setData({ reRatingRequests: myRequests });
  }

  // 刷新移动端数据
  function refreshMobileData() {
    showMessage('📊 正在刷新数据...', 'info');

    var app = getApp();

    // 从云端加载最新数据
    app.loadData().then(function (success) {
      if (success) {
        // 检查管理端是否重置了数据
        var isDataReset = checkIfDataReset(app.globalData.groupsData);

        if (isDataReset) {
          showMessage('✅ 管理端已重置数据，评分已刷新！', 'success');
        } else {
          showMessage('✅ 数据刷新成功！', 'success');
        }

        // 更新页面数据
        initPage();
      } else {
        showMessage('⚠️ 数据刷新失败，请检查网络连接', 'warning');
      }
    });
  }

  // 检查管理端是否重置了数据
  function checkIfDataReset(groupsData) {
    // 检查所有组的lastUpdate是否为0或接近0
    for (var groupName in groupsData) {
      var group = groupsData[groupName];
      if (group && group.lastUpdate > 10000) { // 大于10秒的时间戳
        return false;
      }
    }
    return true;
  }

  // 强制刷新
  function forceRefresh() {
    wx.showModal({
      title: '强制刷新',
      content: '确定要强制刷新吗？这将清除本地缓存并重新加载数据。',
      success: function (res) {
        if (res.confirm) {
          showMessage('🔄 正在强制刷新...', 'info');

          // 清除本地缓存
          wx.removeStorageSync('ratingSystemData');

          // 重新加载数据
          var app = getApp();
          app.loadData().then(function (success) {
            if (success) {
              showMessage('✅ 强制刷新成功！', 'success');
              initPage();
            } else {
              showMessage('⚠️ 强制刷新失败，请检查网络连接', 'warning');
            }
          });
        }
      }
    });
  }

  // 显示消息
  function showMessage(message, type) {
    setData({
      showMessage: true,
      message: message,
      messageType: type || 'success'
    });

    // 3秒后隐藏消息
    setTimeout(function () {
      setData({ showMessage: false });
    }, 3000);
  }

  // 显示评分结果
  function showRatingResult(groupName) {
    var app = getApp();
    var userId = data.userId;

    // 获取该组的评分数据
    var group = app.globalData.groupsData[groupName] || { scores: [] };
    var userScore = group.scores.find(function (score) { return score.userId === userId; });

    if (userScore) {
      setData({ totalScore: userScore.total.toFixed(2) });
    } else {
      setData({ totalScore: '0.00' });
    }

    // 加载所有评分情况
    loadAllRatings();
  }

  // 从云端刷新评分方案
  function refreshSchemeFromCloud() {
    var app = getApp();
    showMessage('🔄 正在从云端加载最新评分方案...', 'info');

    // 强制从云端加载数据
    app.loadData().then(function (success) {
      if (success) {
        // 更新当前方案ID和方案名称
        var scheme = app.globalData.ratingSchemes[app.globalData.currentSchemeId];
        setData({
          currentSchemeId: app.globalData.currentSchemeId,
          schemeName: (scheme && scheme.name) || '默认评分方案'
        });

        // 重新加载评分方案
        loadRatingScheme();

        showMessage('✅ 评分方案已成功从云端刷新！', 'success');
        console.log('从云端刷新评分方案成功:', app.globalData.currentSchemeId);
      } else {
        showMessage('⚠️ 云端刷新失败，已使用本地缓存方案', 'warning');
        console.log('从云端刷新评分方案失败');
      }
    });
  }

  // 加载所有评分情况
  function loadAllRatings() {
    var app = getApp();
    var userId = data.userId;
    var groupsData = app.globalData.groupsData;
    var groupNames = app.globalData.groupNames;

    var allRatings = [];

    // 遍历所有组，收集该评委的评分
    groupNames.forEach(function (groupName) {
      var group = groupsData[groupName] || { scores: [] };
      var userScore = group.scores.find(function (score) { return score.userId === userId; });

      if (userScore) {
        allRatings.push({
          groupName: groupName,
          totalScore: userScore.total.toFixed(2),
          timestamp: new Date(userScore.timestamp).toLocaleString()
        });
      }
    });

    setData({ allRatings: allRatings });
  }

  // 查看评分详情
  function viewRatingDetails(e) {
    if (!data.allowJudgeViewDetails) {
      showMessage('⚠️ 管理员已禁止查看详情', 'error');
      return;
    }

    var groupName = e.currentTarget.dataset.group;

    // 设置当前组并显示评分结果页面
    setData({
      currentGroup: groupName,
      currentPage: 'review' // 确保显示在review页面
    });

    // 重新加载该组的评分数据
    showRatingResult(groupName);

    // 加载并显示评分详情
    loadRatingDetails(groupName);

    // 显示提示信息
    showMessage('已切换到' + groupName + '的评分详情', 'info');
  }

  // 加载评分详情
  function loadRatingDetails(groupName) {
    var app = getApp();
    var userId = data.userId;

    // 获取该组的评分数据
    var group = app.globalData.groupsData[groupName] || { scores: [] };
    var userScore = group.scores.find(function (score) { return score.userId === userId; });

    if (userScore) {
      // 获取评分方案
      var scheme = app.globalData.ratingSchemes[userScore.schemeId] || app.globalData.ratingSchemes[app.globalData.currentSchemeId];

      if (scheme && scheme.dimensions) {
        // 构建评分详情
        var detailDimensions = scheme.dimensions.map(function (dimension, index) {
          var dimensionScore = userScore['dimension' + index] || 0;
          // 找到对应的评分描述
          var description = '';
          if (dimension.scoreLevels) {
            // 找到最接近的评分描述
            var closestLevel = dimension.scoreLevels[0];
            var minDiff = Math.abs(dimensionScore - dimension.scoreLevels[0].score);

            dimension.scoreLevels.forEach(function (level) {
              var diff = Math.abs(dimensionScore - level.score);
              if (diff < minDiff) {
                minDiff = diff;
                closestLevel = level;
              }
            });
            description = closestLevel.description;
          }

          return {
            name: dimension.name,
            value: dimensionScore,
            description: description
          };
        });

        setData({
          detailDimensions: detailDimensions,
          showRatingDetails: true
        });
      }
    } else {
      setData({
        showRatingDetails: false,
        detailDimensions: []
      });
    }
  }

  // ==================== 事件绑定（动态区域用事件委托） ====================

  function closestBy(e, selector) {
    var el = e.target;
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(selector)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function bindEvents() {
    // 组别点击（原页面选择组事件）
    $('groupSelectionContainer').addEventListener('click', function (e) {
      var target = closestBy(e, '.group-btn');
      if (target) {
        selectGroup({ currentTarget: { dataset: { group: target.getAttribute('data-group') } } });
      }
    });

    // 滑块变化（原页面滑块 change 事件）
    $('dimensionsContainer').addEventListener('input', function (e) {
      var target = e.target;
      if (!target || target.tagName !== 'INPUT' || target.type !== 'range') return;
      onSliderChange({
        currentTarget: { dataset: { index: parseInt(target.getAttribute('data-index'), 10) } },
        detail: { value: parseFloat(target.value) }
      });
    });

    // 查看评分详情（原页面查看详情事件）
    $('allRatingsList').addEventListener('click', function (e) {
      var target = closestBy(e, 'button[data-group]');
      if (target && !target.disabled) {
        viewRatingDetails({ currentTarget: { dataset: { group: target.getAttribute('data-group') } } });
      }
    });
  }

  // ==================== 启动 ====================

  // 暴露给 HTML 内联事件使用
  window.showMobilePage = showMobilePage;
  window.submitRating = submitRating;
  window.requestReRating = requestReRating;
  window.onJudgeNameInput = onJudgeNameInput;

  // DOM 就绪后依次执行 onLoad / onShow（对应原小程序页面生命周期）
  function boot() {
    bindEvents();
    onLoad({});
    onShow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
