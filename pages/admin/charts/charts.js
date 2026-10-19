/**
 * 多边形分数示意图（网页版）—— 由原小程序 pages/admin/charts/charts.js 转换
 * 关键改动：原生 canvas 2D API 取代小程序专属的画布上下文
 *  - setFillStyle -> ctx.fillStyle、setStrokeStyle -> ctx.strokeStyle、
 *    setFontSize -> ctx.font、setTextAlign/setTextBaseline -> 同名属性、
 *    draw() 不再需要（浏览器即时绘制）；
 *  - 画布按 devicePixelRatio 缩放，避免高清屏下模糊；
 *  - 图表数据：URL 参数 > 全局 globalData > 本地缓存（网页跳转会重建页面）。
 */
(function () {
  'use strict';

  // 页面数据（对应原 data）
  var data = {
    groupCharts: []
  };

  // 系统字体（对应原 setFontSize 的默认字体族）
  var FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

  // ==================== 工具 ====================
  function $(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 设置字体（对应原 ctx.setFontSize）
  function setFontSize(ctx, size) {
    ctx.font = size + 'px ' + FONT_FAMILY;
  }

  // 准备画布：按 devicePixelRatio 放大位图、设置坐标缩放并清空
  // 返回 { ctx, w, h }，w/h 为 CSS 像素（与原小程序画布坐标系一致）
  function prepareCanvas(canvasId) {
    var el = $(canvasId);
    if (!el || !el.getContext) return null;
    var rect = el.getBoundingClientRect();
    var cssW = Math.max(rect.width || 0, 1);
    var cssH = Math.max(rect.height || 0, 1);
    var dpr = window.devicePixelRatio || 1;
    el.width = Math.round(cssW * dpr);
    el.height = Math.round(cssH * dpr);
    var ctx = el.getContext('2d');
    // 坐标系换算到 CSS 像素，绘制代码无需改动
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    // 复位文字状态（等价于每次新建画布上下文）
    setFontSize(ctx, 12);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    return { ctx: ctx, w: cssW, h: cssH };
  }

  // 浏览器版保存文件（对应原 fs.writeFile）
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

  // ==================== 图表数据 ====================
  // 读取图表数据：URL 带参 > 全局 globalData > 本地缓存
  function readChartSource() {
    var app = getApp();
    var groupData = app.globalData.importedGroupData || [];
    var dimensions = app.globalData.importedDimensions || [];

    // 兼容带参跳转：?data=<encodeURIComponent(JSON({groupData,dimensions}))>
    var match = location.search.match(/[?&]data=([^&]+)/);
    if (match) {
      try {
        var obj = JSON.parse(decodeURIComponent(match[1]));
        if (obj && obj.groupData && obj.dimensions) {
          groupData = obj.groupData;
          dimensions = obj.dimensions;
        }
      } catch (e) {
        console.error('解析 URL 图表数据失败:', e);
      }
    }

    // 网页跳转会重建页面，全局数据丢失时读取管理页写入的本地缓存
    if ((!groupData || groupData.length === 0) || (!dimensions || dimensions.length === 0)) {
      var saved = wx.getStorageSync('importedChartData');
      if (saved && saved.groupData && saved.groupData.length && saved.dimensions && saved.dimensions.length) {
        groupData = saved.groupData;
        dimensions = saved.dimensions;
      }
    }

    // 回写全局，保持与原版一致的读取方式
    app.globalData.importedGroupData = groupData || [];
    app.globalData.importedDimensions = dimensions || [];

    return { groupData: groupData || [], dimensions: dimensions || [] };
  }

  // 加载图表数据
  function loadChartData() {
    var source = readChartSource();
    var groupData = source.groupData;
    var dimensions = source.dimensions;

    if (groupData.length === 0 || dimensions.length === 0) {
      wx.showToast({ title: '无数据可显示', icon: 'error' });
      return;
    }

    // 生成颜色列表
    var colors = [
      '#667eea', '#764ba2', '#f093fb', '#f5576c',
      '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
      '#fa709a', '#fee140', '#fa709a', '#fee140'
    ];

    // 准备图表数据
    var groupCharts = groupData.map(function (group, index) {
      return {
        groupName: group.groupName,
        color: colors[index % colors.length],
        scores: dimensions.map(function (dim) { return group.scores[dim] || 0; })
      };
    });

    data.groupCharts = groupCharts;

    // 渲染各组图表容器与图例（对应原模板的列表渲染结构）
    renderChartList();

    // 延迟绘制图表，确保画布已完成布局
    setTimeout(function () {
      drawCharts(groupCharts, dimensions);
    }, 100);
  }

  // 渲染各组单独图表 + 图例
  function renderChartList() {
    var list = $('chartList');
    if (list) {
      list.innerHTML = data.groupCharts.map(function (item, index) {
        return '<div class="chart-item">' +
          '<div class="chart-header"><span class="group-name">' + esc(item.groupName) + '</span></div>' +
          '<div class="chart-canvas">' +
          '<canvas id="chart' + index + '" style="width:100%;height:300px;"></canvas>' +
          '</div></div>';
      }).join('');
    }

    var legend = $('legendList');
    if (legend) {
      legend.innerHTML = data.groupCharts.map(function (item) {
        return '<div class="legend-item">' +
          '<div class="legend-color" style="background-color:' + esc(item.color) + '"></div>' +
          '<span class="legend-text">' + esc(item.groupName) + '</span>' +
          '</div>';
      }).join('');
    }
  }

  // 绘制图表
  function drawCharts(groupCharts, dimensions) {
    // 绘制组合图表（所有组在同一图表中）
    drawCombinedChart(groupCharts, dimensions);

    // 绘制各组单独的图表
    groupCharts.forEach(function (chart, index) {
      drawPolygonChart('chart' + index, chart, dimensions);
    });
  }

  // 绘制组合图表（所有组在同一图表中）
  function drawCombinedChart(groupCharts, dimensions) {
    var prepared = prepareCanvas('combinedChart');
    if (!prepared) return;
    var ctx = prepared.ctx;
    var canvasWidth = prepared.w;
    var canvasHeight = prepared.h;
    var centerX = canvasWidth / 2;
    var centerY = canvasHeight / 2;
    var radius = Math.min(centerX, centerY) - 60;

    var numDimensions = dimensions.length;
    if (numDimensions === 0) return;

    // 计算所有组的最大分数，用于统一缩放
    var maxScore = 10;
    groupCharts.forEach(function (chart) {
      var chartMax = Math.max.apply(null, chart.scores.concat([10]));
      if (chartMax > maxScore) {
        maxScore = chartMax;
      }
    });

    // 绘制背景网格
    drawRadarGrid(ctx, centerX, centerY, radius, maxScore);

    // 绘制每个组的多边形
    groupCharts.forEach(function (chart) {
      drawSinglePolygon(ctx, centerX, centerY, radius, chart.scores, chart.color, maxScore);
    });

    // 绘制维度标签
    drawDimensionLabels(ctx, centerX, centerY, radius + 30, dimensions);

    // 绘制图表标题
    setFontSize(ctx, 16);
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.fillText('各组维度得分对比', centerX, 30);
  }

  // 绘制雷达图背景网格
  function drawRadarGrid(ctx, centerX, centerY, radius, maxScore) {
    // 绘制同心圆网格
    for (var i = 1; i <= 5; i++) {
      var r = (radius / 5) * i;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 绘制得分标签
      setFontSize(ctx, 10);
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(((maxScore / 5) * i).toFixed(0), centerX - r - 5, centerY);
    }
  }

  // 绘制维度标签
  function drawDimensionLabels(ctx, centerX, centerY, radius, dimensions) {
    var numDimensions = dimensions.length;

    setFontSize(ctx, 12);
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < numDimensions; i++) {
      var angle = (Math.PI * 2 / numDimensions) * i - Math.PI / 2;
      var x = centerX + Math.cos(angle) * radius;
      var y = centerY + Math.sin(angle) * radius;

      // 调整文本位置，避免与图表重叠
      var labelX = x + Math.cos(angle) * 15;
      var labelY = y + Math.sin(angle) * 15;

      ctx.fillText(dimensions[i], labelX, labelY);
    }
  }

  // 绘制单个多边形
  function drawSinglePolygon(ctx, centerX, centerY, radius, scores, color, maxScore) {
    ctx.beginPath();
    for (var i = 0; i < scores.length; i++) {
      var angle = (Math.PI * 2 / scores.length) * i - Math.PI / 2;
      var r = (scores[i] / maxScore) * radius;
      var x = centerX + Math.cos(angle) * r;
      var y = centerY + Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // 设置填充样式
    ctx.fillStyle = color + '30'; // 更透明的填充
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.fill();
    ctx.stroke();
  }

  // 绘制单个多边形图表
  function drawPolygonChart(canvasId, chartData, dimensions) {
    var prepared = prepareCanvas(canvasId);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var canvasWidth = prepared.w;
    var canvasHeight = prepared.h;
    var centerX = canvasWidth / 2;
    var centerY = canvasHeight / 2;
    var radius = Math.min(centerX, centerY) - 30;

    var numDimensions = dimensions.length;
    if (numDimensions === 0) return;

    // 绘制网格
    drawGrid(ctx, centerX, centerY, radius, numDimensions, dimensions);

    // 绘制多边形
    drawPolygon(ctx, centerX, centerY, radius, chartData.scores, chartData.color);

    // 绘制数据点
    drawDataPoints(ctx, centerX, centerY, radius, chartData.scores, chartData.color);

    // 绘制数据标签
    drawDataLabels(ctx, centerX, centerY, radius, chartData.scores, dimensions, chartData.color);

    // 绘制组别名称
    setFontSize(ctx, 16);
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.fillText(chartData.groupName, centerX, 25);
  }

  // 绘制网格
  function drawGrid(ctx, centerX, centerY, radius, numDimensions, dimensions) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // 绘制同心多边形
    for (var i = 1; i <= 5; i++) {
      var r = (radius / 5) * i;
      ctx.beginPath();
      for (var j = 0; j < numDimensions; j++) {
        var angle = (Math.PI * 2 / numDimensions) * j - Math.PI / 2;
        var x = centerX + Math.cos(angle) * r;
        var y = centerY + Math.sin(angle) * r;
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // 绘制轴线
    for (var k = 0; k < numDimensions; k++) {
      var axisAngle = (Math.PI * 2 / numDimensions) * k - Math.PI / 2;
      var ax = centerX + Math.cos(axisAngle) * radius;
      var ay = centerY + Math.sin(axisAngle) * radius;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }

    // 绘制维度名称
    setFontSize(ctx, 12);
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var m = 0; m < numDimensions; m++) {
      var labelAngle = (Math.PI * 2 / numDimensions) * m - Math.PI / 2;
      var lx = centerX + Math.cos(labelAngle) * (radius + 20);
      var ly = centerY + Math.sin(labelAngle) * (radius + 20);
      ctx.fillText(dimensions[m], lx, ly);
    }
  }

  // 绘制多边形
  function drawPolygon(ctx, centerX, centerY, radius, scores, color) {
    // 计算最大分数
    var maxScore = Math.max.apply(null, scores.concat([10]));

    ctx.beginPath();
    for (var i = 0; i < scores.length; i++) {
      var angle = (Math.PI * 2 / scores.length) * i - Math.PI / 2;
      var r = (scores[i] / maxScore) * radius;
      var x = centerX + Math.cos(angle) * r;
      var y = centerY + Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // 设置填充样式
    ctx.fillStyle = color + '40'; // 半透明填充
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.fill();
    ctx.stroke();
  }

  // 绘制数据点
  function drawDataPoints(ctx, centerX, centerY, radius, scores, color, maxScore) {
    // 如果没有提供maxScore，使用当前组的最大值
    if (maxScore === undefined) {
      maxScore = Math.max.apply(null, scores.concat([10]));
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    for (var i = 0; i < scores.length; i++) {
      var angle = (Math.PI * 2 / scores.length) * i - Math.PI / 2;
      var r = (scores[i] / maxScore) * radius;
      var x = centerX + Math.cos(angle) * r;
      var y = centerY + Math.sin(angle) * r;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 绘制数据标签
  function drawDataLabels(ctx, centerX, centerY, radius, scores, dimensions, color, maxScore) {
    // 如果没有提供maxScore，使用当前组的最大值
    if (maxScore === undefined) {
      maxScore = Math.max.apply(null, scores.concat([10]));
      color = '#34495e'; // 默认颜色
    }

    setFontSize(ctx, 12);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < scores.length; i++) {
      var angle = (Math.PI * 2 / scores.length) * i - Math.PI / 2;
      var r = (scores[i] / maxScore) * radius;
      var x = centerX + Math.cos(angle) * r;
      var y = centerY + Math.sin(angle) * r;

      // 调整标签位置，避免与轴线重叠
      var labelX = x + Math.cos(angle) * 15;
      var labelY = y + Math.sin(angle) * 15;

      ctx.fillText(scores[i].toFixed(1), labelX, labelY);
    }
  }

  // 返回上一页
  function goBack() {
    wx.navigateBack({});
  }

  // 导出到Excel
  function exportToExcel() {
    var source = readChartSource();
    var groupData = source.groupData;
    var dimensions = source.dimensions;

    if (groupData.length === 0 || dimensions.length === 0) {
      wx.showToast({ title: '无数据可导出', icon: 'error' });
      return;
    }

    // 生成CSV内容（Excel可直接打开）
    var csvContent = '组别,' + dimensions.join(',') + '\n';

    // 遍历所有组
    groupData.forEach(function (group) {
      var row = group.groupName;
      dimensions.forEach(function (dim) {
        row += ',' + (group.scores[dim] || 0).toFixed(2);
      });
      csvContent += row + '\n';
    });

    // 添加图表说明
    csvContent += '\n\n图表创建说明\n';
    csvContent += '1. 选择所有数据（包括表头）\n';
    csvContent += '2. 点击"插入"选项卡\n';
    csvContent += '3. 选择"图表" → "雷达图" → "填充雷达图"\n';
    csvContent += '4. Excel会自动创建多边形图表\n';
    csvContent += '5. 可以在图表上添加标题和图例\n';
    csvContent += '6. 可以调整图表大小和样式以获得最佳效果\n';

    // 网页版：保存文件（对应原 writeFile）
    var fileName = '多边形分数示意图_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
    var saved = downloadCsv(fileName, csvContent);

    if (saved) {
      // 提供打开文件选项
      wx.showModal({
        title: '导出成功',
        content: '多边形分数示意图数据已导出为Excel兼容的CSV文件\n文件名：' + fileName + '\n\n可以直接用Excel打开查看和创建图表。\n\nCSV文件中包含了创建雷达图的详细说明。',
        showCancel: true,
        confirmText: '复制数据',
        cancelText: '关闭',
        success: function (res) {
          if (res.confirm) {
            // 复制到剪贴板，方便直接粘贴到 Excel
            wx.setClipboardData({
              data: csvContent,
              success: function () {
                wx.showToast({ title: '数据已复制到剪贴板，可粘贴到Excel使用', icon: 'success' });
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
          wx.showToast({ title: '数据已复制到剪贴板，可粘贴到Excel使用', icon: 'success' });
        },
        fail: function () {
          wx.showToast({ title: '导出失败', icon: 'error' });
        }
      });
    }
  }

  // ==================== 启动 ====================
  function onLoad() {
    console.log('图表页面加载');
    loadChartData();
  }

  function onShow() {
    console.log('图表页面显示');
  }

  function boot() {
    onLoad();
    onShow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 暴露给内联 onclick 使用
  window.goBack = goBack;
  window.exportToExcel = exportToExcel;
})();
