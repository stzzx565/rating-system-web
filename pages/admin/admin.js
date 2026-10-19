/**
 * 管理页（网页版）—— 由原小程序 pages/admin/admin.js 转换
 * 约定：
 * 1. 原 Page({ data, onLoad, ... }) 转为 IIFE，data 为页面数据；
 * 2. setData(patch) = 合并 data + 调用 render() 刷新界面（对应原 setData）；
 * 3. 输入类事件只写入 data、不触发渲染，避免输入框被重建导致失焦；
 * 4. 页面里原样的 wx.* 调用由 js/wx-shim.js 提供浏览器实现；
 * 5. 原小程序文件系统 API 在网页版改为：downloadCsv()（浏览器下载）、
 *    pickFile()（隐藏的 <input type="file"> 选文件）。
 */
(function () {
  'use strict';

  // ==================== 页面数据（对应原 data） ====================
  var data = {
    isAuthenticated: false,
    activeTab: 'results',
    scoringMethod: 'method1',
    groupResults: [],
    groupDetails: [],
    schemes: [],
    showEditor: false,
    editingScheme: null,
    groupNames: [],
    reRatingRequests: [],
    passwordInput: '',
    historyActivities: [],
    currentSchemeSource: 'cloud', // 当前评分方案来源：cloud（云端）或 local（本地）
    newGroupName: '', // 新组别名输入
    requireJudgeName: true, // 是否要求评委填写姓名
    allowJudgeViewDetails: true // 是否允许评委查看已评分数详情
  };

  // 管理页面密码
  var adminPassword = 'admin123';

  // ==================== 基础工具 ====================
  function $(id) {
    return document.getElementById(id);
  }

  // 文本转义（渲染进 HTML 用）
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 对应原 setData：合并数据并重新渲染
  function setData(patch) {
    Object.keys(patch).forEach(function (k) {
      data[k] = patch[k];
    });
    render();
  }

  // 浏览器版保存文件（对应原 fs.writeFile + wx.env.USER_DATA_PATH）
  function downloadCsv(fileName, csvContent) {
    try {
      var safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '-');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      console.log('文件保存成功:', safeName);
      return true;
    } catch (e) {
      console.error('保存文件失败:', e);
      return false;
    }
  }

  // 浏览器版选择文件（对应原 wx.chooseMessageFile）
  function pickFile(accept, onSuccess) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(input);
    input.onchange = function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return; // 用户取消选择
      console.log('选择的文件:', file.name);
      var reader = new FileReader();
      reader.onload = function () {
        console.log('文件内容:', reader.result);
        onSuccess(String(reader.result));
      };
      reader.onerror = function () {
        console.error('读取文件失败:', reader.error);
        wx.showToast({ title: '读取文件失败', icon: 'error' });
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }

  // ==================== 渲染 ====================
  function render() {
    var auth = $('authContainer');
    var main = $('adminMain');
    if (!auth || !main) return;

    // 登录区 / 主内容切换（对应原模板的条件渲染）
    auth.style.display = data.isAuthenticated ? 'none' : 'flex';
    main.style.display = data.isAuthenticated ? 'block' : 'none';
    if (!data.isAuthenticated) return;

    // 顶部标签页高亮
    var navTabs = document.querySelectorAll('.nav-tab[data-tab]');
    for (var i = 0; i < navTabs.length; i++) {
      navTabs[i].classList.toggle('active', navTabs[i].getAttribute('data-tab') === data.activeTab);
    }
    // 标签内容显示 / 隐藏
    var contents = document.querySelectorAll('.tab-content');
    for (var j = 0; j < contents.length; j++) {
      var on = contents[j].getAttribute('data-tab') === data.activeTab;
      contents[j].classList.toggle('active', on);
      contents[j].classList.toggle('hidden', !on);
    }

    renderResults();
    renderSchemes();
    renderGroups();
    renderRequests();
    renderHistory();
  }

  // 渲染：评分结果（统计方法、两个开关、结果表、详细评分）
  function renderResults() {
    var methodBtns = document.querySelectorAll('.method-btn[data-method]');
    for (var i = 0; i < methodBtns.length; i++) {
      methodBtns[i].classList.toggle('active', methodBtns[i].getAttribute('data-method') === data.scoringMethod);
    }

    var s1 = $('requireJudgeNameSwitch');
    if (s1) s1.checked = !!data.requireJudgeName;
    var t1 = $('requireJudgeNameText');
    if (t1) t1.textContent = data.requireJudgeName ? '启用' : '关闭';

    var s2 = $('allowJudgeViewDetailsSwitch');
    if (s2) s2.checked = !!data.allowJudgeViewDetails;
    var t2 = $('allowJudgeViewDetailsText');
    if (t2) t2.textContent = data.allowJudgeViewDetails ? '开放' : '禁止';

    var body = $('resultsTableBody');
    if (body) {
      body.innerHTML = data.groupResults.map(function (item) {
        return '<div class="table-row">' +
          '<div class="table-cell">' + esc(item.groupName) + '</div>' +
          '<div class="table-cell">' + esc(item.judgeCount) + '</div>' +
          '<div class="table-cell">' + esc(item.averageScore) + '</div>' +
          '<div class="table-cell final-score">' + esc(item.finalScore) + '</div>' +
          '<div class="table-cell">' + esc(item.rank) + '</div>' +
          '</div>';
      }).join('');
    }

    var details = $('groupDetailsList');
    if (details) {
      details.innerHTML = data.groupDetails.map(function (group) {
        var rows = (group.scores || []).map(function (score) {
          return '<div class="detail-table-row">' +
            '<div class="detail-cell">' + esc(score.userId) + '</div>' +
            '<div class="detail-cell">' + esc(score.total) + '</div>' +
            '<div class="detail-cell">' + esc(score.timestamp) + '</div>' +
            '</div>';
        }).join('');
        return '<div class="group-details">' +
          '<div class="detail-header"><span class="detail-title">' + esc(group.groupName) + '</span></div>' +
          '<div class="detail-table">' +
          '<div class="detail-table-header">' +
          '<div class="detail-cell">评委ID</div>' +
          '<div class="detail-cell">评分</div>' +
          '<div class="detail-cell">时间</div>' +
          '</div>' + rows +
          '</div></div>';
      }).join('');
    }
  }

  // 渲染：评分方案列表 + 来源按钮 + 方案编辑器
  function renderSchemes() {
    var cloudBtn = $('sourceCloudBtn');
    var localBtn = $('sourceLocalBtn');
    if (cloudBtn) cloudBtn.classList.toggle('active', data.currentSchemeSource === 'cloud');
    if (localBtn) localBtn.classList.toggle('active', data.currentSchemeSource === 'local');

    var list = $('schemeList');
    if (list) {
      list.innerHTML = data.schemes.map(function (item, index) {
        var dims = item.dimensions ? item.dimensions.length : 0;
        return '<div class="scheme-item">' +
          '<div class="scheme-info">' +
          '<span class="scheme-name">' + esc(item.name) + '</span>' +
          '<span class="scheme-desc">' + esc(item.description) + '</span>' +
          '<div class="scheme-meta">' +
          '<span class="scheme-dimensions">维度：' + dims + '</span>' +
          '<span class="scheme-status' + (item.isActive ? ' active' : '') + '">' + (item.isActive ? '当前使用' : '未使用') + '</span>' +
          '</div></div>' +
          '<div class="scheme-actions">' +
          '<button class="btn btn-primary" onclick="showSchemeEditor(' + index + ')"><span>编辑</span></button>' +
          '<button class="btn btn-success" onclick="setActiveScheme(' + index + ')"><span>' + (item.isActive ? '已激活' : '激活') + '</span></button>' +
          '<button class="btn btn-danger" onclick="deleteScheme(' + index + ')"><span>删除</span></button>' +
          '</div></div>';
      }).join('');
    }

    renderEditor();
  }

  // 渲染：方案编辑器（显示/隐藏 + 基本字段 + 维度列表）
  function renderEditor() {
    var editor = $('schemeEditor');
    if (!editor) return;
    var show = !!data.showEditor && !!data.editingScheme;
    editor.classList.toggle('hidden', !show);
    editor.classList.toggle('active', show);
    if (!show) return;

    var scheme = data.editingScheme;
    var title = $('editorTitle');
    if (title) title.textContent = scheme ? '编辑评分方案' : '新建评分方案';

    var nameInput = $('schemeName');
    if (nameInput) nameInput.value = scheme.name === undefined || scheme.name === null ? '' : scheme.name;
    var descInput = $('schemeDescription');
    if (descInput) descInput.value = scheme.description === undefined || scheme.description === null ? '' : scheme.description;
    var totalInput = $('totalScore');
    if (totalInput) totalInput.value = scheme.totalScore === undefined || scheme.totalScore === null ? '' : scheme.totalScore;

    renderDimensions();
  }

  // 渲染：评分维度列表（评分维度 / 分值说明 / 文字框）
  function renderDimensions() {
    var box = $('dimensionsList');
    if (!box) return;
    var scheme = data.editingScheme;
    if (!scheme || !scheme.dimensions) {
      box.innerHTML = '';
      return;
    }

    box.innerHTML = scheme.dimensions.map(function (item, index) {
      var isText = item.type === 'text';
      var html = '<div class="dimension-item">' +
        '<div class="dimension-header">' +
        '<span>' + (isText ? '文字框' : '维度') + ' ' + (index + 1) + '</span>' +
        '<button class="btn btn-danger" onclick="removeDimension(' + index + ')"><span>删除</span></button>' +
        '</div>' +
        '<div class="dimension-form">' +
        '<div class="form-item">' +
        '<span class="form-label">名称</span>' +
        '<input class="form-input" placeholder="请输入名称" value="' + esc(item.name) + '" ' +
        'oninput="onDimensionInput(' + index + ',\'name\',this.value)">' +
        '</div>';

      if (isText) {
        // 文字框类型的编辑选项
        html += '<div class="form-item">' +
          '<span class="form-label">占位提示</span>' +
          '<input class="form-input" placeholder="请输入占位提示文字" value="' + esc(item.placeholder) + '" ' +
          'oninput="onDimensionInput(' + index + ',\'placeholder\',this.value)">' +
          '</div>' +
          '<div class="form-item">' +
          '<span class="form-label">是否必填</span>' +
          '<div class="checkbox-container">' +
          '<input type="checkbox"' + (item.required ? ' checked' : '') + ' ' +
          'onchange="onDimensionCheckboxChange(' + index + ',\'required\',this.checked)">' +
          '<span class="checkbox-label">必填项</span>' +
          '</div></div>';
      } else {
        // 评分类型的编辑选项：权重 / 最低分 / 最高分
        html += '<div class="form-item">' +
          '<span class="form-label">权重</span>' +
          '<input class="form-input" type="number" placeholder="请输入权重" value="' + esc(item.weight) + '" ' +
          'oninput="onDimensionInput(' + index + ',\'weight\',this.value)">' +
          '</div>' +
          '<div class="form-item">' +
          '<span class="form-label">最低分</span>' +
          '<input class="form-input" type="number" placeholder="请输入最低分" value="' + esc(item.minScore) + '" ' +
          'oninput="onDimensionInput(' + index + ',\'minScore\',this.value)">' +
          '</div>' +
          '<div class="form-item">' +
          '<span class="form-label">最高分</span>' +
          '<input class="form-input" type="number" placeholder="请输入最高分" value="' + esc(item.maxScore) + '" ' +
          'oninput="onDimensionInput(' + index + ',\'maxScore\',this.value)">' +
          '</div>';

        // 评分分值和说明
        var levels = item.scoreLevels || [];
        html += '<div class="form-item">' +
          '<div class="score-levels-header">' +
          '<span class="form-label">评分分值说明</span>' +
          '<button class="btn btn-small btn-primary" onclick="addScoreLevel(' + index + ')"><span>+ 添加分值</span></button>' +
          '</div>' +
          '<div class="score-levels-list">' +
          levels.map(function (level, levelIndex) {
            return '<div class="score-level-item">' +
              '<div class="score-level-inputs">' +
              '<div class="form-item-inline">' +
              '<span class="form-label-inline">分值</span>' +
              '<input class="form-input-inline" type="number" placeholder="请输入分值" value="' + esc(level.score) + '" ' +
              'oninput="onScoreLevelInput(' + index + ',' + levelIndex + ',\'score\',this.value)">' +
              '</div>' +
              '<div class="form-item-inline">' +
              '<span class="form-label-inline">说明</span>' +
              '<input class="form-input-inline" placeholder="请输入说明" value="' + esc(level.description) + '" ' +
              'oninput="onScoreLevelInput(' + index + ',' + levelIndex + ',\'description\',this.value)">' +
              '</div>' +
              '</div>' +
              '<button class="btn btn-small btn-danger" onclick="removeScoreLevel(' + index + ',' + levelIndex + ')"><span>删除</span></button>' +
              '</div>';
          }).join('') +
          '</div></div>';
      }

      return html + '</div></div>';
    }).join('');
  }

  // 渲染：组别列表
  function renderGroups() {
    var box = $('groupNamesList');
    if (!box) return;
    box.innerHTML = data.groupNames.map(function (item, index) {
      return '<div class="group-name-item">' +
        '<div class="group-name-content"><span class="group-name-text">' + esc(item) + '</span></div>' +
        '<button class="btn btn-danger" onclick="removeGroupName(' + index + ')"><span>删除</span></button>' +
        '</div>';
    }).join('');
  }

  // 渲染：重评请求列表
  function renderRequests() {
    var box = $('requestsList');
    if (!box) return;
    if (!data.reRatingRequests || data.reRatingRequests.length === 0) {
      box.innerHTML = '<div class="empty-state"><span>暂无重评请求</span></div>';
      return;
    }
    box.innerHTML = data.reRatingRequests.map(function (item, index) {
      var statusClass = item.status === 'pending' ? 'pending' : (item.status === 'approved' ? 'approved' : 'rejected');
      var statusText = item.status === 'pending' ? '⏳ 待审批' : (item.status === 'approved' ? '✅ 已批准' : '❌ 已拒绝');
      var html = '<div class="request-item">' +
        '<div class="request-info">' +
        '<span class="request-group">' + esc(item.groupName) + '</span>' +
        '<span class="request-user">' + esc(item.userName) + '</span>' +
        '<span class="request-time">' + esc(item.requestTime) + '</span>' +
        '<span class="request-status ' + statusClass + '">' + statusText + '</span>' +
        '</div>';
      // 只对待审批的请求显示操作按钮
      if (item.status === 'pending') {
        html += '<div class="request-actions">' +
          '<button class="btn btn-success" onclick="approveReRating(' + index + ')"><span>✅ 批准</span></button>' +
          '<button class="btn btn-danger" onclick="rejectReRating(' + index + ')"><span>❌ 拒绝</span></button>' +
          '</div>';
      }
      return html + '</div>';
    }).join('');
  }

  // 渲染：历史活动列表
  function renderHistory() {
    var box = $('historyList');
    if (!box) return;
    if (!data.historyActivities || data.historyActivities.length === 0) {
      box.innerHTML = '<div class="empty-state"><span>暂无历史评分活动</span></div>';
      return;
    }
    box.innerHTML = data.historyActivities.map(function (item, index) {
      var scheme = item.ratingSchemes && item.ratingSchemes[item.currentSchemeId];
      var schemeName = esc(scheme ? scheme.name : '默认方案');
      var details = '组别数量：' + esc((item.groupNames || []).length) +
        ' | 评分方案：' + schemeName;
      return '<div class="history-activity-item">' +
        '<div class="activity-info">' +
        '<span class="activity-name">' + esc(item.name) + '</span>' +
        '<span class="activity-time">' + esc(item.timestamp) + '</span>' +
        '<span class="activity-details">' + details + '</span>' +
        '</div>' +
        '<div class="activity-actions">' +
        '<button class="btn btn-small btn-primary" onclick="viewActivity(' + index + ')"><span>查看</span></button>' +
        '<button class="btn btn-small btn-danger" onclick="deleteActivity(' + index + ')"><span>删除</span></button>' +
        '</div></div>';
    }).join('');
  }

  // ==================== 生命周期 ====================
  function onLoad() {
    // 页面加载时执行
    console.log('管理员页面加载');

    // 每次进入管理页面都需要重新验证密码
    wx.removeStorageSync('adminAuthenticated');
    data.isAuthenticated = false;
  }

  function onShow() {
    // 页面显示时执行
    console.log('管理员页面显示');

    // 检查是否已通过密码验证
    var isAuthenticated = wx.getStorageSync('adminAuthenticated') === true;
    data.isAuthenticated = isAuthenticated;

    if (isAuthenticated) {
      // 已验证，先从云端加载最新数据
      var app = getApp();
      app.loadData().then(function (success) {
        console.log('管理端加载云端数据:', success ? '成功' : '失败');

        // 加载全局数据
        loadGlobalData();

        // 只有在没有评分方案时才创建新方案
        if (Object.keys(app.globalData.ratingSchemes).length === 0) {
          createNewScoringScheme();
        }

        updateAllResults();
        updateSchemeList();
        updateGroupNamesList();
        updateReRatingRequestsList();
      });
    }
  }

  // 创建新的评分方案序号
  function createNewScoringScheme() {
    var app = getApp();

    // 生成新的方案ID
    var newSchemeId = 'scheme_' + Date.now();

    // 创建新的评分方案
    var newScheme = {
      id: newSchemeId,
      name: '评分方案_' + new Date().toLocaleString(),
      description: '系统自动生成的评分方案',
      dimensions: [
        {
          name: '综合评分',
          weight: 100,
          minScore: 1,
          maxScore: 10,
          scoreLevels: [
            { score: 1, description: '差' },
            { score: 5, description: '中' },
            { score: 10, description: '优' }
          ]
        }
      ],
      totalScore: 100,
      isActive: true,
      createdAt: Date.now(),
      schemeLink: ''
    };

    // 添加到全局数据
    app.globalData.ratingSchemes[newSchemeId] = newScheme;
    app.globalData.currentSchemeId = newSchemeId;

    // 更新所有方案的激活状态
    for (var id in app.globalData.ratingSchemes) {
      app.globalData.ratingSchemes[id].isActive = id === newSchemeId;
    }

    console.log('已生成新的评分方案:', newSchemeId);
  }

  // 加载全局数据
  function loadGlobalData() {
    var app = getApp();
    setData({
      scoringMethod: app.globalData.currentScoringMethod,
      groupNames: app.globalData.groupNames,
      reRatingRequests: app.globalData.reRatingRequests,
      historyActivities: app.globalData.historyActivities.slice(),
      requireJudgeName: app.globalData.requireJudgeName,
      allowJudgeViewDetails: app.globalData.allowJudgeViewDetails
    });
  }

  // 切换标签页
  function switchTab(tab) {
    data.activeTab = tab;

    // 根据标签页更新数据
    if (tab === 'results') {
      updateAllResults();
    } else if (tab === 'schemes') {
      updateSchemeList();
    } else if (tab === 'groups') {
      updateGroupNamesList();
    } else if (tab === 'requests') {
      updateReRatingRequestsList();
    } else if (tab === 'history') {
      // 初始化历史活动数据
      var app = getApp();
      data.historyActivities = app.globalData.historyActivities.slice();
    }
    render();
  }

  // 切换评分方法
  function switchScoringMethod(method) {
    data.scoringMethod = method;

    // 更新全局数据
    var app = getApp();
    app.globalData.currentScoringMethod = method;
    app.saveData();

    // 重新计算结果
    updateAllResults();
  }

  // 刷新结果
  function refreshResults() {
    console.log('刷新结果');

    // 先从云端加载最新数据
    var app = getApp();
    app.loadData().then(function (success) {
      console.log('管理端刷新加载云端数据:', success ? '成功' : '失败');

      // 加载全局数据
      loadGlobalData();

      // 更新界面
      updateAllResults();
      updateSchemeList();
      updateGroupNamesList();
      updateReRatingRequestsList();

      if (success) {
        wx.showToast({ title: '数据已同步到最新！', icon: 'success' });
      } else {
        wx.showToast({ title: '数据刷新失败，请检查网络连接', icon: 'error' });
      }
    });
  }

  // 更新所有结果
  function updateAllResults() {
    var app = getApp();

    // 计算各组结果
    var groupResults = [];
    var groupDetails = [];

    app.globalData.groupNames.forEach(function (groupName) {
      var group = app.globalData.groupsData[groupName] || { scores: [] };
      var scores = group.scores || [];

      // 计算平均分
      var averageScore = 0;
      if (scores.length > 0) {
        var total = scores.reduce(function (sum, score) { return sum + score.total; }, 0);
        averageScore = (total / scores.length).toFixed(2);
      }

      // 计算最终得分
      var finalScore = 0;
      if (scores.length > 0) {
        finalScore = calculateFinalScore(scores);
      }

      // 格式化时间
      var formattedScores = scores.map(function (score) {
        var copy = {};
        Object.keys(score).forEach(function (k) { copy[k] = score[k]; });
        copy.timestamp = new Date(score.timestamp).toLocaleString();
        return copy;
      });

      groupResults.push({
        groupName: groupName,
        judgeCount: scores.length,
        averageScore: averageScore,
        finalScore: finalScore.toFixed(2),
        rank: 0
      });

      groupDetails.push({
        groupName: groupName,
        scores: formattedScores
      });
    });

    // 排名
    groupResults.sort(function (a, b) { return parseFloat(b.finalScore) - parseFloat(a.finalScore); });
    groupResults.forEach(function (result, index) {
      result.rank = index + 1;
    });

    setData({ groupResults: groupResults, groupDetails: groupDetails });
  }

  // 计算最终得分
  function calculateFinalScore(scores) {
    var app = getApp();
    var method = app.globalData.currentScoringMethod;

    if (method === 'method1') {
      // 平均分
      var total = scores.reduce(function (sum, score) { return sum + score.total; }, 0);
      return total / scores.length;
    } else {
      // 去掉最高/最低分
      var scoreValues = scores.map(function (score) { return score.total; }).sort(function (a, b) { return a - b; });
      if (scoreValues.length <= 2) {
        // 只有1-2个评分时，使用平均分
        var sum = scoreValues.reduce(function (s, score) { return s + score; }, 0);
        return sum / scoreValues.length;
      } else {
        // 去掉最高分和最低分
        var filteredScores = scoreValues.slice(1, -1);
        var filteredTotal = filteredScores.reduce(function (s, score) { return s + score; }, 0);
        return filteredTotal / filteredScores.length;
      }
    }
  }

  // 重置所有数据
  function resetAllData() {
    wx.showModal({
      title: '确认重置',
      content: '确定要重置所有评分数据吗？此操作将清除所有评分记录！',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();

          // 清空所有组的评分数据
          app.globalData.groupNames.forEach(function (groupName) {
            app.globalData.groupsData[groupName] = {
              scores: [],
              finalScore: 0,
              lastUpdate: 0
            };
          });

          // 清空重评请求
          app.globalData.reRatingRequests = [];

          // 保存数据
          app.saveData().then(function (success) {
            if (success) {
              wx.showToast({ title: '数据重置成功', icon: 'success' });

              // 更新界面
              updateAllResults();
              updateReRatingRequestsList();
            } else {
              wx.showToast({ title: '数据重置失败', icon: 'error' });
            }
          });
        }
      }
    });
  }

  // 导出评分结果为Excel文件
  function exportResults() {
    var app = getApp();
    var groupNames = app.globalData.groupNames;
    var groupsData = app.globalData.groupsData;
    var ratingSchemes = app.globalData.ratingSchemes;
    var currentSchemeId = app.globalData.currentSchemeId;
    var currentScheme = ratingSchemes[currentSchemeId];

    // 获取当前评分方案的维度
    var dimensions = [];
    if (currentScheme && currentScheme.dimensions) {
      dimensions = currentScheme.dimensions
        .filter(function (dim) { return !dim.type || dim.type === 'score'; })
        .map(function (dim) { return dim.name; });
    }

    // 生成CSV内容（Excel可直接打开）
    var csvContent = '组别,评委ID,评委名称,评分时间';
    // 添加维度表头
    dimensions.forEach(function (dim) {
      csvContent += ',' + dim;
    });
    // 添加总分表头
    csvContent += ',总分';
    csvContent += '\n';

    // 遍历所有组
    groupNames.forEach(function (groupName) {
      var group = groupsData[groupName] || { scores: [] };

      // 遍历该组的所有评分
      group.scores.forEach(function (score) {
        var timestamp = new Date(score.timestamp).toLocaleString();
        var row = groupName + ',' + score.userId + ',' + (score.userName || score.userId) + ',"' + timestamp + '"';

        // 添加各维度分数
        dimensions.forEach(function (dim, index) {
          row += ',' + (score['dimension' + index] || 0);
        });

        // 添加总分
        row += ',' + score.total;

        csvContent += row + '\n';
      });
    });

    // 生成汇总数据
    csvContent += '\n\n汇总数据\n';
    csvContent += '组别,评委人数,平均分\n';

    groupNames.forEach(function (groupName) {
      var group = groupsData[groupName] || { scores: [] };
      var scores = group.scores || [];
      var judgeCount = scores.length;
      var averageScore = 0;

      if (judgeCount > 0) {
        var total = scores.reduce(function (sum, score) { return sum + score.total; }, 0);
        averageScore = (total / judgeCount).toFixed(2);
      }

      csvContent += groupName + ',' + judgeCount + ',' + averageScore + '\n';
    });

    // 生成多边形图表数据
    csvContent += '\n\n多边形图表数据\n';
    // 计算每个组在每个维度上的统计得分

    if (currentScheme && currentScheme.dimensions) {
      var schemeDimensions = currentScheme.dimensions
        .filter(function (dim) { return !dim.type || dim.type === 'score'; })
        .map(function (dim) { return dim.name; });

      if (schemeDimensions.length > 0) {
        // 添加维度表头
        csvContent += '组别,' + schemeDimensions.join(',') + '\n';

        // 计算每个组在每个维度上的得分
        groupNames.forEach(function (groupName) {
          var group = groupsData[groupName] || { scores: [] };
          var scores = group.scores || [];

          if (scores.length > 0) {
            var row = groupName;

            // 计算每个维度的得分
            schemeDimensions.forEach(function (dimension, dimIndex) {
              var dimScores = scores.map(function (score) { return score['dimension' + dimIndex] || 0; });
              var dimFinalScore = calculateDimensionFinalScore(dimScores);
              row += ',' + dimFinalScore.toFixed(2);
            });

            csvContent += row + '\n';
          }
        });

        // 添加图表创建说明
        csvContent += '\n\n图表创建说明\n';
        csvContent += '1. 选择"多边形图表数据"部分的所有数据（包括表头）\n';
        csvContent += '2. 点击"插入"选项卡\n';
        csvContent += '3. 选择"图表" → "雷达图" → "填充雷达图"\n';
        csvContent += '4. Excel会自动创建多边形图表\n';
        csvContent += '5. 可以在图表上添加标题和图例\n';
        csvContent += '6. 可以调整图表大小和样式以获得最佳效果\n';
      }
    }

    // 网页版：保存文件（对应原 writeFile）
    var fileName = '评分结果_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
    var saved = downloadCsv(fileName, csvContent);

    if (saved) {
      // 提供打开文件选项
      wx.showModal({
        title: '导出成功',
        content: '评分结果已导出为Excel兼容的CSV文件\n文件名：' + fileName + '\n\n可以直接用Excel打开查看和编辑。',
        showCancel: true,
        confirmText: '复制数据',
        cancelText: '关闭',
        success: function (res) {
          if (res.confirm) {
            // 复制到剪贴板，方便直接粘贴到 Excel
            wx.setClipboardData({
              data: csvContent,
              success: function () {
                wx.showToast({ title: '结果已复制到剪贴板，可粘贴到Excel使用', icon: 'success' });
              },
              fail: function () {
                wx.showToast({ title: '复制失败', icon: 'error' });
              }
            });
          }
        }
      });
    } else {
      // 保存失败时，回退到复制到剪贴板
      wx.setClipboardData({
        data: csvContent,
        success: function () {
          wx.showToast({ title: '结果已复制到剪贴板，可粘贴到Excel使用', icon: 'success' });
        },
        fail: function () {
          wx.showToast({ title: '导出失败', icon: 'error' });
        }
      });
    }
  }

  // 导入Excel/CSV文件
  function importResults() {
    wx.showModal({
      title: '导入Excel数据',
      content: '请选择要导入的CSV文件（Excel可导出为CSV格式）。\n\n文件格式要求：\n1. 第一行：组别,维度1,维度2,...,总分\n2. 后续行：各组的得分数据\n\n导入后将生成多边形分数示意图。',
      showCancel: true,
      confirmText: '选择文件',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          // 选择文件（网页版用 <input type="file"> 代替原 chooseMessageFile）
          pickFile('.csv,text/csv', function (content) {
            processImportedData(content);
          });
        }
      }
    });
  }

  // 处理导入的数据
  function processImportedData(csvContent) {
    var lines = csvContent.split('\n');
    if (lines.length < 2) {
      wx.showToast({ title: '文件格式错误，至少需要两行数据', icon: 'error' });
      return;
    }

    // 解析表头
    var headers = lines[0].split(',').map(function (h) { return h.trim(); });
    if (headers[0] !== '组别') {
      wx.showToast({ title: '文件格式错误，第一列必须是组别', icon: 'error' });
      return;
    }

    // 解析数据
    var importData = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var values = line.split(',');
      if (values.length < headers.length) {
        wx.showToast({ title: '第' + (i + 1) + '行数据格式错误', icon: 'error' });
        return;
      }

      var groupData = {
        groupName: values[0].trim(),
        scores: {}
      };

      // 解析各维度分数
      for (var j = 1; j < headers.length; j++) {
        groupData.scores[headers[j]] = parseFloat(values[j]) || 0;
      }

      importData.push(groupData);
    }

    console.log('导入的数据:', importData);

    // 生成多边形分数示意图
    generatePolygonCharts(importData, headers.slice(1));
  }

  // 生成多边形分数示意图
  function generatePolygonCharts(groupData, dimensions) {
    // 保存数据到全局，供图表使用
    var app = getApp();
    app.globalData.importedGroupData = groupData;
    app.globalData.importedDimensions = dimensions;
    // 网页版跳转会重建页面，先存本地缓存，供图表页读取
    wx.setStorageSync('importedChartData', { groupData: groupData, dimensions: dimensions });

    // 显示图表页面
    wx.navigateTo({
      url: '/pages/admin/charts/charts',
      success: function () {
        console.log('导航到图表页面成功');
      },
      fail: function (err) {
        console.error('导航到图表页面失败:', err);
        wx.showToast({ title: '导航到图表页面失败', icon: 'error' });
      }
    });
  }

  // 基于统计结果生成多边形分数示意图
  function generateStatsCharts() {
    var app = getApp();
    var groupNames = app.globalData.groupNames;
    var groupsData = app.globalData.groupsData;
    var ratingSchemes = app.globalData.ratingSchemes;
    var currentSchemeId = app.globalData.currentSchemeId;

    // 获取当前评分方案的维度
    var currentScheme = ratingSchemes[currentSchemeId];
    if (!currentScheme || !currentScheme.dimensions) {
      wx.showToast({ title: '未找到评分方案或维度', icon: 'error' });
      return;
    }

    var dimensions = currentScheme.dimensions
      .filter(function (dim) { return !dim.type || dim.type === 'score'; }) // 考虑没有type属性或type为score的维度
      .map(function (dim) { return dim.name; });

    if (dimensions.length === 0) {
      wx.showToast({ title: '评分方案中没有评分维度', icon: 'error' });
      return;
    }

    // 计算每个组在每个维度上的统计得分
    var groupStatsData = [];

    groupNames.forEach(function (groupName) {
      var group = groupsData[groupName] || { scores: [] };
      var scores = group.scores || [];

      if (scores.length === 0) {
        // 该组没有评分，跳过
        return;
      }

      var groupData = {
        groupName: groupName,
        scores: {}
      };

      // 计算每个维度的得分
      dimensions.forEach(function (dimension, dimIndex) {
        // 提取所有评委在该维度上的得分
        var dimScores = scores.map(function (score) {
          // 从评分数据中获取该维度的得分
          return score['dimension' + dimIndex] || 0;
        });

        // 使用当前统计方法计算该维度的最终得分
        var dimFinalScore = calculateDimensionFinalScore(dimScores);
        groupData.scores[dimension] = dimFinalScore;
      });

      // 计算总分
      var totalScores = scores.map(function (score) { return score.total; });
      var totalFinalScore = calculateDimensionFinalScore(totalScores);
      groupData.scores['总分'] = totalFinalScore;

      groupStatsData.push(groupData);
    });

    if (groupStatsData.length === 0) {
      wx.showToast({ title: '没有可显示的评分数据', icon: 'error' });
      return;
    }

    // 添加总分到维度列表
    var allDimensions = dimensions.slice();
    allDimensions.push('总分');

    console.log('基于统计结果的图表数据:', groupStatsData);
    console.log('维度列表:', allDimensions);

    // 生成多边形分数示意图
    generatePolygonCharts(groupStatsData, allDimensions);
  }

  // 计算维度的最终得分
  function calculateDimensionFinalScore(scores) {
    // 使用所有评委的平均分作为最终分数
    var total = scores.reduce(function (sum, score) { return sum + score; }, 0);
    return total / scores.length;
  }

  // 保存当前评分活动
  function saveActivity() {
    var app = getApp();

    // 创建活动对象
    var activity = {
      id: 'activity_' + Date.now(),
      name: '评分活动_' + new Date().toLocaleString(),
      timestamp: Date.now(),
      // 保存当前的评分方案
      currentSchemeId: app.globalData.currentSchemeId,
      ratingSchemes: JSON.parse(JSON.stringify(app.globalData.ratingSchemes)),
      // 保存当前的评分结果
      groupsData: JSON.parse(JSON.stringify(app.globalData.groupsData)),
      groupNames: app.globalData.groupNames.slice(),
      reRatingRequests: app.globalData.reRatingRequests.slice(),
      currentScoringMethod: app.globalData.currentScoringMethod
    };

    // 添加到历史活动列表
    app.globalData.historyActivities.push(activity);

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({ title: '评分活动保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: '评分活动已保存到本地，但云端同步失败', icon: 'warning' });
      }
    });
  }

  // 更新方案列表
  function updateSchemeList() {
    var app = getApp();
    var schemes = Object.keys(app.globalData.ratingSchemes).map(function (id) {
      return app.globalData.ratingSchemes[id];
    });
    setData({ schemes: schemes });
  }

  // 切换评分方案来源
  function switchSchemeSource(source) {
    var app = getApp();

    // 显示加载提示
    wx.showLoading({ title: '正在切换...', mask: true });

    if (source === 'cloud') {
      // 从云端加载评分方案
      app.loadSchemesFromCloud().then(function (success) {
        wx.hideLoading();
        if (success) {
          setData({
            currentSchemeSource: 'cloud',
            schemes: Object.keys(app.globalData.ratingSchemes).map(function (id) {
              return app.globalData.ratingSchemes[id];
            })
          });
          wx.showToast({ title: '已切换到云端评分方案', icon: 'success' });
          console.log('云端评分方案:', app.globalData.ratingSchemes);
        } else {
          wx.showToast({ title: '切换失败：云端数据无效', icon: 'error' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        console.error('切换到云端评分方案失败:', JSON.stringify(err));
        wx.showToast({ title: '切换失败：' + ((err && err.errMsg) || '网络错误'), icon: 'error' });
      });
    } else {
      // 从本地加载评分方案
      var success = app.loadSchemesFromLocal();
      wx.hideLoading();
      if (success) {
        setData({
          currentSchemeSource: 'local',
          schemes: Object.keys(app.globalData.ratingSchemes).map(function (id) {
            return app.globalData.ratingSchemes[id];
          })
        });
        wx.showToast({ title: '已切换到本地评分方案', icon: 'success' });
        console.log('本地评分方案:', app.globalData.ratingSchemes);
      } else {
        wx.showToast({ title: '切换失败：本地数据无效', icon: 'error' });
      }
    }
  }

  // 更新组别列表
  function updateGroupNamesList() {
    var app = getApp();
    setData({ groupNames: app.globalData.groupNames });
  }

  // 更新重评请求列表
  function updateReRatingRequestsList() {
    var app = getApp();
    setData({ reRatingRequests: app.globalData.reRatingRequests });
  }

  // 显示方案编辑器（新建）
  function showSchemeEditorNew() {
    setData({
      showEditor: true,
      editingScheme: {
        id: 'scheme_' + Date.now(),
        name: '新评分方案',
        description: '',
        dimensions: [
          {
            name: '新维度',
            weight: 100,
            minScore: 1,
            maxScore: 10,
            scoreLevels: [
              { score: 1, description: '差' },
              { score: 5, description: '中' },
              { score: 10, description: '优' }
            ]
          }
        ],
        totalScore: 100,
        isActive: false,
        createdAt: Date.now(),
        schemeLink: ''
      }
    });
  }

  // 显示方案编辑器（编辑）
  function showSchemeEditor(index) {
    var scheme = data.schemes[index];
    if (!scheme) return;
    setData({
      showEditor: true,
      editingScheme: JSON.parse(JSON.stringify(scheme))
    });
  }

  // 隐藏方案编辑器
  function hideSchemeEditor() {
    data.showEditor = false;
    data.editingScheme = null;
    render();
  }

  // 方案输入事件处理（只写数据，不渲染，避免输入框失焦）
  function onSchemeInput(field, value) {
    if (!data.editingScheme) return;
    data.editingScheme[field] = value;
  }

  // 维度输入事件处理（只写数据，不渲染）
  function onDimensionInput(index, field, value) {
    if (!data.editingScheme || !data.editingScheme.dimensions[index]) return;
    data.editingScheme.dimensions[index][field] = isNaN(value) ? value : parseFloat(value);
  }

  // 维度checkbox变化事件处理（只写数据，不渲染）
  function onDimensionCheckboxChange(index, field, checked) {
    if (!data.editingScheme || !data.editingScheme.dimensions[index]) return;
    data.editingScheme.dimensions[index][field] = !!checked;
  }

  // 保存方案
  function saveScheme() {
    // 保存方案到全局数据
    var app = getApp();
    var editingScheme = data.editingScheme;
    if (!editingScheme) return;

    // 添加到全局评分方案列表
    app.globalData.ratingSchemes[editingScheme.id] = editingScheme;

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({ title: '方案保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: '方案已保存到本地，但云端同步失败', icon: 'warning' });
      }

      hideSchemeEditor();
      updateSchemeList();
    });
  }

  // 设置当前方案为激活状态
  function setActiveScheme(index) {
    var scheme = data.schemes[index];
    if (!scheme) return;

    // 更新所有方案的激活状态
    var updatedSchemes = data.schemes.map(function (s) {
      var copy = {};
      Object.keys(s).forEach(function (k) { copy[k] = s[k]; });
      copy.isActive = s.id === scheme.id;
      return copy;
    });

    // 更新全局数据
    var app = getApp();
    app.globalData.currentSchemeId = scheme.id;

    // 同时更新全局数据中所有方案的isActive状态
    for (var id in app.globalData.ratingSchemes) {
      app.globalData.ratingSchemes[id].isActive = id === scheme.id;
    }

    setData({ schemes: updatedSchemes });

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({ title: '方案激活成功', icon: 'success' });
      } else {
        wx.showToast({ title: '方案激活失败', icon: 'error' });
      }
    });
  }

  // 删除评分方案
  function deleteScheme(index) {
    var scheme = data.schemes[index];
    if (!scheme) return;

    wx.showModal({
      title: '删除方案',
      content: '确定要删除评分方案 "' + scheme.name + '" 吗？此操作不可恢复！',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();

          // 删除方案
          delete app.globalData.ratingSchemes[scheme.id];

          // 如果删除的是当前激活的方案，将第一个方案设为激活
          if (app.globalData.currentSchemeId === scheme.id) {
            var remainingIds = Object.keys(app.globalData.ratingSchemes);
            if (remainingIds.length > 0) {
              app.globalData.currentSchemeId = remainingIds[0];
              app.globalData.ratingSchemes[remainingIds[0]].isActive = true;
            } else {
              app.globalData.currentSchemeId = null;
            }
          }

          // 保存到云端
          app.saveData().then(function (success) {
            if (success) {
              wx.showToast({ title: '方案删除成功', icon: 'success' });
              // 更新界面
              updateSchemeList();
            } else {
              wx.showToast({ title: '方案删除失败', icon: 'error' });
            }
          });
        }
      }
    });
  }

  // 复制方案链接
  function copySchemeLink(index) {
    var scheme = data.schemes[index];
    if (!scheme) return;

    if (scheme.schemeLink) {
      wx.setClipboardData({
        data: scheme.schemeLink,
        success: function () {
          wx.showToast({ title: '链接已复制', icon: 'success' });
        }
      });
    }
  }

  // 添加评分维度
  function addDimension() {
    if (!data.editingScheme) return;
    data.editingScheme.dimensions.push({
      name: '新维度',
      weight: 100,
      minScore: 1,
      maxScore: 10,
      type: 'score',
      scoreLevels: [
        { score: 1, description: '差' },
        { score: 5, description: '中' },
        { score: 10, description: '优' }
      ]
    });
    render();
  }

  // 添加自由文字框
  function addFreeTextDimension() {
    if (!data.editingScheme) return;
    data.editingScheme.dimensions.push({
      name: '自由文字框',
      weight: 0,
      type: 'text',
      placeholder: '请输入文字内容'
    });
    render();
  }

  // 删除维度
  function removeDimension(index) {
    if (!data.editingScheme) return;
    data.editingScheme.dimensions.splice(index, 1);
    render();
  }

  // 添加评分分值
  function addScoreLevel(dimIndex) {
    if (!data.editingScheme) return;
    var dimension = data.editingScheme.dimensions[dimIndex];
    if (!dimension) return;

    // 添加新的分值说明
    dimension.scoreLevels.push({
      score: 5,
      description: '中等'
    });

    render();
  }

  // 删除评分分值
  function removeScoreLevel(dimIndex, levelIndex) {
    if (!data.editingScheme) return;
    var dimension = data.editingScheme.dimensions[dimIndex];
    if (!dimension) return;

    // 至少保留一个分值说明
    if (dimension.scoreLevels.length > 1) {
      dimension.scoreLevels.splice(levelIndex, 1);
      render();
    } else {
      wx.showToast({ title: '至少需要保留一个分值说明', icon: 'warning' });
    }
  }

  // 评分分值输入事件（只写数据，不渲染）
  function onScoreLevelInput(dimIndex, levelIndex, field, value) {
    if (!data.editingScheme) return;
    var dimension = data.editingScheme.dimensions[dimIndex];
    if (!dimension || !dimension.scoreLevels[levelIndex]) return;
    var scoreLevel = dimension.scoreLevels[levelIndex];

    // 更新分值或说明
    if (field === 'score') {
      scoreLevel[field] = parseFloat(value) || 0;
    } else {
      scoreLevel[field] = value;
    }
  }

  // 添加组别
  function addGroupName() {
    var newGroupName = (data.newGroupName || '').trim();
    if (newGroupName) {
      var updatedGroupNames = data.groupNames.slice();
      updatedGroupNames.push(newGroupName);

      // 清空输入框
      data.newGroupName = '';
      var input = $('newGroupName');
      if (input) input.value = '';

      // 更新全局数据
      var app = getApp();
      app.globalData.groupNames = updatedGroupNames;

      setData({ groupNames: updatedGroupNames, newGroupName: '' });

      // 保存到云端
      app.saveData().then(function (success) {
        if (success) {
          wx.showToast({ title: '组别添加成功', icon: 'success' });
        } else {
          wx.showToast({ title: '组别添加失败', icon: 'error' });
        }
      });
    } else {
      wx.showToast({ title: '请输入组别名称', icon: 'none' });
    }
  }

  // 删除组别
  function removeGroupName(index) {
    var updatedGroupNames = data.groupNames.filter(function (_, i) { return i !== index; });

    // 更新全局数据
    var app = getApp();
    app.globalData.groupNames = updatedGroupNames;

    setData({ groupNames: updatedGroupNames });

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({ title: '组别删除成功', icon: 'success' });
      } else {
        wx.showToast({ title: '组别删除失败', icon: 'error' });
      }
    });
  }

  // 刷新重评请求
  function refreshReRatingRequests() {
    var app = getApp();
    app.loadData().then(function (success) {
      if (success) {
        setData({ reRatingRequests: app.globalData.reRatingRequests });
        wx.showToast({ title: '重评请求刷新成功', icon: 'success' });
      } else {
        wx.showToast({ title: '重评请求刷新失败', icon: 'error' });
      }
    });
  }

  // 批准重评请求
  function approveReRating(index) {
    var request = data.reRatingRequests[index];
    if (!request) return;

    wx.showModal({
      title: '确认批准',
      content: '确定批准 ' + request.userName + ' 对 ' + request.groupName + ' 的重评请求吗？',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();

          // 清除该评委对该组的评分
          var group = app.globalData.groupsData[request.groupName];
          if (group) {
            group.scores = group.scores.filter(function (score) { return score.userId !== request.userId; });
            group.finalScore = 0;
            group.lastUpdate = Date.now();
          }

          // 更新请求状态为批准
          request.status = 'approved';
          request.processedTime = Date.now();

          // 保存到云端
          app.saveData().then(function (success) {
            if (success) {
              wx.showToast({ title: '重评请求批准成功', icon: 'success' });
              setData({ reRatingRequests: app.globalData.reRatingRequests });
              updateAllResults();
            } else {
              wx.showToast({ title: '重评请求批准失败', icon: 'error' });
            }
          });
        }
      }
    });
  }

  // 拒绝重评请求
  function rejectReRating(index) {
    var request = data.reRatingRequests[index];
    if (!request) return;

    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝 ' + request.userName + ' 对 ' + request.groupName + ' 的重评请求吗？',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();

          // 更新请求状态为拒绝
          request.status = 'rejected';
          request.processedTime = Date.now();

          // 保存到云端
          app.saveData().then(function (success) {
            if (success) {
              wx.showToast({ title: '重评请求拒绝成功', icon: 'success' });
              setData({ reRatingRequests: app.globalData.reRatingRequests });
            } else {
              wx.showToast({ title: '重评请求拒绝失败', icon: 'error' });
            }
          });
        }
      }
    });
  }

  // 密码输入事件（只写数据，不渲染）
  function onPasswordInput(value) {
    data.passwordInput = value;
  }

  // 新组别名输入事件（只写数据，不渲染）
  function onNewGroupNameInput(value) {
    data.newGroupName = value;
  }

  // 验证密码
  function verifyPassword() {
    var inputPassword = data.passwordInput;
    if (inputPassword === adminPassword) {
      // 密码正确
      wx.setStorageSync('adminAuthenticated', true);
      data.isAuthenticated = true;
      render();
      // 加载数据
      loadGlobalData();
      updateAllResults();
      updateSchemeList();
      updateGroupNamesList();
      updateReRatingRequestsList();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } else {
      // 密码错误
      wx.showToast({ title: '密码错误，请重试', icon: 'error' });
    }
  }

  // 退出登录
  function logout() {
    wx.removeStorageSync('adminAuthenticated');
    data.isAuthenticated = false;
    render();
  }

  // 切换评委姓名填写要求
  function toggleRequireJudgeName(checked) {
    var requireJudgeName = !!checked;
    data.requireJudgeName = requireJudgeName;
    render();

    // 更新全局数据
    var app = getApp();
    app.globalData.requireJudgeName = requireJudgeName;

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({
          title: requireJudgeName ? '已启用评委填写姓名' : '已关闭评委填写姓名',
          icon: 'success'
        });
      } else {
        wx.showToast({ title: '设置保存失败', icon: 'error' });
      }
    });
  }

  // 切换评委查看详情权限
  function toggleAllowJudgeViewDetails(checked) {
    var allowJudgeViewDetails = !!checked;
    data.allowJudgeViewDetails = allowJudgeViewDetails;
    render();

    // 更新全局数据
    var app = getApp();
    app.globalData.allowJudgeViewDetails = allowJudgeViewDetails;

    // 保存到云端
    app.saveData().then(function (success) {
      if (success) {
        wx.showToast({
          title: allowJudgeViewDetails ? '已开放评委查看详情权限' : '已禁止评委查看详情权限',
          icon: 'success'
        });
      } else {
        wx.showToast({ title: '设置保存失败', icon: 'error' });
      }
    });
  }

  // 刷新历史活动列表
  function refreshHistory() {
    var app = getApp();
    data.historyActivities = app.globalData.historyActivities.slice();
    render();
    wx.showToast({ title: '历史活动已刷新', icon: 'success' });
  }

  // 查看历史活动
  function viewActivity(index) {
    var app = getApp();
    var activity = app.globalData.historyActivities[index];
    if (!activity) return;

    // 计算活动的详细结果
    var groupResults = [];
    var groupDetails = [];

    activity.groupNames.forEach(function (groupName) {
      var group = activity.groupsData[groupName] || { scores: [] };
      var scores = group.scores || [];

      // 计算平均分
      var totalScore = 0;
      scores.forEach(function (score) {
        totalScore += score.total;
      });
      var averageScore = scores.length > 0 ? (totalScore / scores.length).toFixed(2) : '0.00';

      groupResults.push({
        groupName: groupName,
        judgeCount: scores.length,
        averageScore: averageScore
      });

      // 格式化评分详情
      var formattedScores = scores.map(function (score) {
        return {
          userId: score.userId,
          userName: score.userName,
          total: score.total,
          timestamp: new Date(score.timestamp).toLocaleString()
        };
      });

      groupDetails.push({
        groupName: groupName,
        scores: formattedScores
      });
    });

    // 显示活动详情
    var activityScheme = activity.ratingSchemes ? activity.ratingSchemes[activity.currentSchemeId] : null;
    var detailsContent = '活动名称：' + activity.name + '\n活动时间：' + new Date(activity.timestamp).toLocaleString() +
      '\n组别数量：' + activity.groupNames.length +
      '\n评分方案：' + ((activityScheme && activityScheme.name) || '默认方案') +
      '\n\n各组评分结果：\n';

    groupResults.forEach(function (result) {
      detailsContent += result.groupName + '：' + result.averageScore + '分 (' + result.judgeCount + '人评分)\n';
    });

    wx.showModal({
      title: '查看活动详情',
      content: detailsContent,
      showCancel: true,
      confirmText: '导出该活动数据',
      cancelText: '关闭',
      success: function (res) {
        if (res.confirm) {
          // 导出活动数据
          exportActivityData(activity);
        }
      }
    });
  }

  // 导出活动数据
  function exportActivityData(activity) {
    // 生成CSV格式数据
    var csvContent = '组别,评委ID,评委名称,评分,评分时间\n';

    activity.groupNames.forEach(function (groupName) {
      var group = activity.groupsData[groupName] || { scores: [] };
      var scores = group.scores || [];

      scores.forEach(function (score) {
        csvContent += groupName + ',' + score.userId + ',' + (score.userName || score.userId) + ',' +
          score.total + ',' + new Date(score.timestamp).toLocaleString() + '\n';
      });
    });

    // 网页版：先复制到剪贴板，再下载 CSV 文件
    wx.setClipboardData({
      data: csvContent,
      success: function () {
        var fileName = '活动数据_' + activity.name + '_' + Date.now() + '.csv';
        var saved = downloadCsv(fileName, csvContent);
        wx.showModal({
          title: '导出成功',
          content: saved
            ? '活动数据已导出为CSV文件并复制到剪贴板，可用于Excel打开。'
            : '活动数据已复制到剪贴板，请粘贴到Excel中使用。',
          showCancel: false
        });
      },
      fail: function (err) {
        console.error('复制失败:', err);
        wx.showToast({ title: '导出失败', icon: 'error' });
      }
    });
  }

  // 删除历史活动
  function deleteActivity(index) {
    var app = getApp();

    wx.showModal({
      title: '删除活动',
      content: '确定要删除该历史评分活动吗？此操作不可恢复！',
      success: function (res) {
        if (res.confirm) {
          // 删除活动
          app.globalData.historyActivities.splice(index, 1);

          // 保存到云端
          app.saveData().then(function (success) {
            if (success) {
              // 更新本地列表
              data.historyActivities = app.globalData.historyActivities.slice();
              render();
              wx.showToast({ title: '活动删除成功', icon: 'success' });
            } else {
              wx.showToast({ title: '活动删除失败', icon: 'error' });
            }
          });
        }
      }
    });
  }

  // 导入本地评分方案
  function importLocalScheme() {
    wx.showModal({
      title: '导入本地评分方案',
      content: '请选择本地的评分方案JSON文件（如：评分方案_2026-1-29.json）。导入后会替换当前的评分方案并保存到云端。',
      showCancel: true,
      confirmText: '选择文件',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          // 选择文件（网页版用 <input type="file"> 代替原 chooseMessageFile）
          pickFile('.json,application/json', function (content) {
            processImportedScheme(content);
          });
        }
      }
    });
  }

  // 处理导入的评分方案
  function processImportedScheme(jsonContent) {
    try {
      var importedSchemes = JSON.parse(jsonContent);
      console.log('解析的评分方案:', importedSchemes);

      // 验证文件格式
      if (typeof importedSchemes !== 'object' || importedSchemes === null) {
        wx.showToast({ title: '文件格式错误，不是有效的评分方案', icon: 'error' });
        return;
      }

      // 检查是否包含评分方案
      var schemeIds = Object.keys(importedSchemes);
      var schemeCount = schemeIds.length;
      if (schemeCount === 0) {
        wx.showToast({ title: '文件中没有评分方案', icon: 'error' });
        return;
      }

      // 显示导入确认
      wx.showModal({
        title: '导入确认',
        content: '检测到 ' + schemeCount + ' 个评分方案。导入后会替换当前的评分方案并保存到云端。确定要导入吗？',
        showCancel: true,
        confirmText: '确定导入',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) {
            // 导入评分方案
            var app = getApp();
            app.globalData.ratingSchemes = importedSchemes;

            // 确保有激活的方案
            var hasActiveScheme = false;
            for (var i = 0; i < schemeIds.length; i++) {
              var id = schemeIds[i];
              if (importedSchemes[id].isActive) {
                app.globalData.currentSchemeId = id;
                hasActiveScheme = true;
                break;
              }
            }

            // 如果没有激活的方案，激活第一个
            if (!hasActiveScheme && schemeCount > 0) {
              var firstSchemeId = schemeIds[0];
              app.globalData.currentSchemeId = firstSchemeId;
              importedSchemes[firstSchemeId].isActive = true;
            }

            // 保存到云端
            app.saveData().then(function (success) {
              if (success) {
                wx.showToast({ title: '评分方案导入成功并已保存到云端！', icon: 'success' });
                // 更新界面
                updateSchemeList();
              } else {
                wx.showToast({ title: '评分方案已导入，但云端同步失败', icon: 'warning' });
                // 更新界面
                updateSchemeList();
              }
            });
          }
        }
      });
    } catch (e) {
      console.error('解析文件失败:', e);
      wx.showToast({ title: '文件格式错误，无法解析', icon: 'error' });
    }
  }

  // ==================== 启动 ====================
  function boot() {
    onLoad();
    onShow();
    render();
    // 对应原 wxml 的 focus="true"
    var pw = $('passwordInput');
    if (pw && !data.isAuthenticated) {
      try { pw.focus(); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ==================== 暴露给内联 onclick / oninput 使用 ====================
  window.onPasswordInput = onPasswordInput;
  window.verifyPassword = verifyPassword;
  window.logout = logout;
  window.switchTab = switchTab;
  window.switchScoringMethod = switchScoringMethod;
  window.toggleRequireJudgeName = toggleRequireJudgeName;
  window.toggleAllowJudgeViewDetails = toggleAllowJudgeViewDetails;
  window.refreshResults = refreshResults;
  window.exportResults = exportResults;
  window.importResults = importResults;
  window.saveActivity = saveActivity;
  window.generateStatsCharts = generateStatsCharts;
  window.resetAllData = resetAllData;
  window.switchSchemeSource = switchSchemeSource;
  window.showSchemeEditorNew = showSchemeEditorNew;
  window.importLocalScheme = importLocalScheme;
  window.showSchemeEditor = showSchemeEditor;
  window.setActiveScheme = setActiveScheme;
  window.deleteScheme = deleteScheme;
  window.hideSchemeEditor = hideSchemeEditor;
  window.onSchemeInput = onSchemeInput;
  window.addDimension = addDimension;
  window.addFreeTextDimension = addFreeTextDimension;
  window.saveScheme = saveScheme;
  window.onDimensionInput = onDimensionInput;
  window.removeDimension = removeDimension;
  window.addScoreLevel = addScoreLevel;
  window.onScoreLevelInput = onScoreLevelInput;
  window.removeScoreLevel = removeScoreLevel;
  window.onDimensionCheckboxChange = onDimensionCheckboxChange;
  window.addGroupName = addGroupName;
  window.removeGroupName = removeGroupName;
  window.onNewGroupNameInput = onNewGroupNameInput;
  window.refreshReRatingRequests = refreshReRatingRequests;
  window.approveReRating = approveReRating;
  window.rejectReRating = rejectReRating;
  window.refreshHistory = refreshHistory;
  window.viewActivity = viewActivity;
  window.deleteActivity = deleteActivity;
  window.copySchemeLink = copySchemeLink;
  window.generatePolygonCharts = generatePolygonCharts;
  window.processImportedData = processImportedData;
  window.processImportedScheme = processImportedScheme;
})();
