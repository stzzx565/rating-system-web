/**
 * 解析结果页（网页版）— 对应原小程序 pages/video/result/result.js
 * 转换说明：
 *   - Page({ data, onLoad, ... }) 转为 IIFE，data 保留为局部对象
 *   - onLoad(query) 从 location.search 用 URLSearchParams 解析
 *   - 图集为动态渲染，点击用事件委托
 *   - wx-shim 未提供图片预览，本页内置全屏遮罩实现等价交互
 *   - videoApi 使用全局 window.VideoApi（由 js/videoApi.js 提供）
 */
(function () {
  'use strict';

  // 网页版视频解析 API（原为 require 引入的 utils/videoApi.js）
  var videoApi = window.VideoApi;

  // 页面数据（对应原 data）
  var data = {
    platformName: '',
    videoType: '',
    author: '',
    title: '',
    coverUrl: '',
    videoUrl: '',
    isImage: false,
    images: [],
    saving: false,
    sourceUrl: ''
  };

  // ---------- DOM 引用 ----------
  var platformText = document.getElementById('platformText');
  var typeTag = document.getElementById('typeTag');
  var authorRow = document.getElementById('authorRow');
  var authorName = document.getElementById('authorName');
  var videoTitle = document.getElementById('videoTitle');
  var coverSection = document.getElementById('coverSection');
  var coverImg = document.getElementById('coverImg');
  var btnSave = document.getElementById('btnSave');
  var btnSaveText = document.getElementById('btnSaveText');
  var btnOpen = document.getElementById('btnOpen');
  var imageSection = document.getElementById('imageSection');
  var imageSectionTitle = document.getElementById('imageSectionTitle');
  var imageGrid = document.getElementById('imageGrid');

  // 转义 HTML 特殊字符（标题/图片地址来自后端，防止破坏结构）
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 渲染图集网格
  function renderImages() {
    imageGrid.innerHTML = data.images.map(function (src, i) {
      return '<div class="image-item" data-index="' + i + '">' +
        '<img class="grid-image" src="' + escapeHtml(src) + '" alt="图集图片">' +
        '<div class="image-save-btn" data-index="' + i + '"><span>保存</span></div>' +
        '</div>';
    }).join('');
  }

  // 根据 data 刷新视图
  function render() {
    platformText.textContent = data.platformName;
    typeTag.textContent = data.videoType;
    authorRow.style.display = data.author ? 'flex' : 'none';
    authorName.textContent = data.author;
    videoTitle.textContent = data.title;
    // 封面
    coverSection.style.display = data.coverUrl ? 'block' : 'none';
    if (data.coverUrl && coverImg.getAttribute('src') !== data.coverUrl) {
      coverImg.src = data.coverUrl;
    }
    // 保存按钮状态
    btnSave.disabled = data.saving;
    btnSaveText.textContent = data.saving ? '⏳ 下载中...' : '💾 保存到手机相册';
    // 在浏览器中打开（有视频链接才显示）
    btnOpen.style.display = data.videoUrl ? 'block' : 'none';
    // 图集
    var showImages = data.isImage && data.images.length > 0;
    imageSection.style.display = showImages ? 'block' : 'none';
    imageSectionTitle.textContent = '📷 图集 (' + data.images.length + ' 张)';
    if (showImages) renderImages();
    else imageGrid.innerHTML = '';
  }

  // 合并数据并刷新（对应原 setData）
  function setData(patch) {
    Object.assign(data, patch);
    render();
  }

  // ---------- 页面业务逻辑（函数名与原版保持一致） ----------

  // 从 URL 取回解析结果 JSON：
  // 网页版 URLSearchParams 已解码一层；若取回的仍是编码串（兼容原版双重编码），再解码一次
  function parseQueryData(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return JSON.parse(decodeURIComponent(raw));
    }
  }

  // 页面加载：读取地址栏参数（对应原 onLoad(options)）
  function onLoad(query) {
    var sourceUrl = query.get('sourceUrl') || '';
    setData({ sourceUrl: sourceUrl });

    var raw = query.get('data');
    if (raw) {
      try {
        parseResult(parseQueryData(raw));
      } catch (e) {
        console.error('解析结果数据失败:', e);
        wx.showToast({ title: '数据解析失败', icon: 'none' });
      }
    }
  }

  // 解析后端返回的数据
  function parseResult(d) {
    var platformMap = {
      'douyin': '抖音',
      'tiktok': 'TikTok',
      'bilibili': 'B站',
      'kuaishou': '快手',
      'xhs': '小红书',
      'wxchannels': '视频号'
    };

    var platform = platformMap[d.platform] || d.platform || '未知';
    var type = d.type || 'video';
    var isImage = type === 'image';

    // 提取作者
    var author = (d.author && (d.author.nickname || d.author.unique_id)) || '';

    // 提取标题
    var title = d.desc || d.title || '无标题';

    // 提取封面
    var coverUrl = '';
    if (d.video_data) {
      coverUrl = d.video_data.video_cover_url ||
                 d.video_data.origin_cover ||
                 d.video_data.dynamic_cover || '';
    }
    if (d.image_data && d.image_data.cover) {
      coverUrl = d.image_data.cover;
    }

    // 提取视频链接
    var videoUrl = '';
    if (!isImage && d.video_data) {
      videoUrl = d.video_data.nwm_video_url_HQ ||
                 d.video_data.nwm_video_url ||
                 d.video_data.wm_video_url_HQ ||
                 d.video_data.wm_video_url || '';
    }

    // 提取图集
    var images = [];
    if (isImage && d.image_data) {
      images = d.image_data.no_watermark_image_list ||
               d.image_data.watermark_image_list || [];
    }

    setData({
      platformName: platform,
      videoType: isImage ? '图集' : '视频',
      author: author,
      title: title,
      coverUrl: coverUrl,
      videoUrl: videoUrl,
      isImage: isImage,
      images: images
    });
  }

  // 保存视频到相册（网页版 = 触发浏览器下载）
  function saveVideo() {
    var videoUrl = data.videoUrl;
    if (!videoUrl) {
      wx.showToast({ title: '无视频链接', icon: 'none' });
      return;
    }

    setData({ saving: true });
    videoApi.saveVideoToAlbum(videoUrl)
      .then(function () {
        setData({ saving: false });
      })
      .catch(function (err) {
        setData({ saving: false });
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  }

  // 复制无水印链接
  function copyLink() {
    var url = data.videoUrl;
    if (!url) {
      wx.showToast({ title: '无链接可复制', icon: 'none' });
      return;
    }

    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
    });
  }

  // 在浏览器中打开
  function openInBrowser() {
    var url = data.videoUrl;
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showModal({
          title: '链接已复制',
          content: '请在浏览器中粘贴打开',
          showCancel: false
        });
      }
    });
  }

  // 网页版图片预览：全屏遮罩，点击关闭（等价于原生图片预览的最简交互）
  function previewImages(urls, index) {
    if (!urls || !urls.length) return;
    var mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:5000;' +
      'display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    var img = document.createElement('img');
    img.src = urls[index || 0];
    img.alt = '预览图片';
    img.style.cssText = 'max-width:100%;max-height:100%;display:block;';
    mask.appendChild(img);
    document.body.appendChild(mask);
    mask.addEventListener('click', function () {
      if (mask.parentNode) document.body.removeChild(mask);
    });
  }

  // 预览封面
  function previewCover() {
    if (!data.coverUrl) return;
    previewImages([data.coverUrl], 0);
  }

  // 预览图片（事件委托传入索引）
  function previewImage(index) {
    previewImages(data.images, index);
  }

  // 保存单张图片
  function saveSingleImage(index) {
    var imageUrl = data.images[index];
    if (!imageUrl) return;

    wx.showLoading({ title: '保存中...', mask: true });
    videoApi.fetchMedia(imageUrl)
      .then(function (tempFilePath) {
        return new Promise(function (resolve, reject) {
          wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: resolve,
            fail: reject
          });
        });
      })
      .then(function () {
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none', duration: 2500 });
      });
  }

  // 保存全部图片
  function saveAllImages() {
    var images = data.images;
    if (!images || images.length === 0) return;

    wx.showLoading({ title: '批量保存中...', mask: true });
    var successCount = 0;
    var failCount = 0;
    var lastErrMsg = '';

    // 逐张串行保存（与原版顺序一致）
    var chain = Promise.resolve();
    images.forEach(function (url) {
      chain = chain.then(function () {
        return videoApi.fetchMedia(url)
          .then(function (tempFilePath) {
            return new Promise(function (resolve, reject) {
              wx.saveImageToPhotosAlbum({
                filePath: tempFilePath,
                success: resolve,
                fail: reject
              });
            });
          })
          .then(function () { successCount++; })
          .catch(function (err) {
            failCount++;
            lastErrMsg = (err && err.message) || '';
          });
      });
    });

    chain.then(function () {
      wx.hideLoading();
      if (failCount === 0) {
        wx.showToast({ title: '已全部保存(' + successCount + '张)', icon: 'success' });
      } else {
        wx.showModal({
          title: '部分保存失败',
          content: '成功 ' + successCount + ' 张，失败 ' + failCount + ' 张'
            + (lastErrMsg ? '。原因: ' + lastErrMsg.slice(0, 80) : ''),
          showCancel: false
        });
      }
    });
  }

  // ---------- 事件绑定 ----------
  btnSave.addEventListener('click', saveVideo);
  document.getElementById('btnCopy').addEventListener('click', copyLink);
  btnOpen.addEventListener('click', openInBrowser);
  document.getElementById('btnSaveAll').addEventListener('click', saveAllImages);
  coverImg.addEventListener('click', previewCover);

  // 图集点击：先判断是否命中“保存”按钮，否则视为预览（事件委托）
  imageGrid.addEventListener('click', function (e) {
    var node = e.target.closest ? e.target.closest('[data-index]') : null;
    if (!node || node.dataset.index === undefined || node.dataset.index === '') return;
    var index = parseInt(node.dataset.index, 10);
    if (e.target.closest('.image-save-btn') || (node.className === 'image-save-btn')) {
      saveSingleImage(index);
    } else {
      previewImage(index);
    }
  });

  // ---------- 初始化（对应原 onLoad，参数取自地址栏） ----------
  onLoad(new URLSearchParams(location.search));
  render();
})();
