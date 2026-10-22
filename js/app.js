/**
 * 网页版全局 App（对应原小程序 app.js）
 * - 数据存储逻辑与原版完全一致：本地 localStorage + JSONBin 云端同步（同一个 Bin，与小程序数据互通）
 * - wx.* 调用由 js/wx-shim.js 提供浏览器实现
 * - 需在 wx-shim.js 之后加载
 */
window.App = {
  onLaunch: function () {
    // 展示本地能力（对应原版 logs 记录）
    var logs = wx.getStorageSync('logs') || [];
    logs.unshift(Date.now());
    wx.setStorageSync('logs', logs);

    // 网页版匿名登录（占位，保持与原版回调链一致）
    wx.login({ success: function () {} });
    wx.getSetting({ success: function () {} });

    // 从云端加载数据 + 视频接口地址（外网部署时自动识别）
    this.loadData().then(function (success) {
      console.log('启动时加载云端数据:', success ? '成功' : '失败');
    });
    this.loadVideoApiConfig();
  },

  // 全局数据（与原小程序 globalData 保持一致的字段）
  globalData: {
    userInfo: null,
    // JSONBin.io 配置（与小程序同一个 Bin，数据互通）
    JSONBin_API_KEY: '$2a$10$c2NEBUyWOI3Yqv3mlGn8zeY7ysKbSPQdFv9Oyli9LN5J8LN1wkvSK',
    JSONBIN_BIN_ID: '696ee7fe43b1c97be93bf06b',
    JSONBIN_API_URL: 'https://api.jsonbin.io/v3/b/696ee7fe43b1c97be93bf06b',

    // 视频接口地址的“云端配置” bin（外网启动脚本每次开隧道会把最新隧道地址写进来）
    JSONBIN_CONFIG_BIN_ID: '6ad5f513ffd5d16053782d28',
    JSONBIN_CONFIG_URL: 'https://api.jsonbin.io/v3/b/6ad5f513ffd5d16053782d28',
    // 备用配置源：github.io 托管的 config.json（无请求额度限制，
    // JSONBin 免费额度用尽时自动切换到这里，外网启动脚本会同步更新）
    PAGES_CONFIG_URL: 'https://stzzx565.github.io/rating-system-web/config.json',

    // 视频解析后端 API 地址
    // - '' 表示走本页同源 /api 与 /proxy 路径（本地/局域网预览由 serve.js 自动代理到 127.0.0.1:8080 的解析服务）
    // - 外网（github.io 等）启动时由 loadVideoApiConfig() 自动填入云端配置的隧道地址
    VIDEO_API_BASE: '',
    _configPromise: null,

    // 问卷系统（TDuck 填鸭表单）地址配置（与小程序保持一致）
    TDUCK_BASE_URL: 'http://192.168.1.12:8999',

    // 本地数据缓存
    groupsData: {},
    ratingSchemes: {},
    currentSchemeId: "scheme1",
    currentScoringMethod: "method1",
    groupNames: ["洗护组", "护肤1组", "护肤2组", "护肤3组"],
    reRatingRequests: [],
    ratingHistory: [],
    historyActivities: [],
    surveys: {},
    surveyResponses: {},
    homeText: '',
    appVersion: '1.0',
    lastSaveTime: 0,
    requireJudgeName: true,
    judgeNamePlaceholder: '请输入您的姓名',
    allowJudgeViewDetails: true
  },

  // 是否运行在本机/局域网（是则用同源代理 ''，否=外网部署，读云端隧道地址）
  isLocalHost: function () {
    if (location.protocol === 'file:') return true;
    var h = location.hostname || '';
    if (!h) return true;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
    // 私网 IP（手机局域网访问电脑时）
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  },

  // 从云端配置 bin 读取视频接口地址（外网启动脚本会把最新隧道地址写进去）
  loadVideoApiConfig: function () {
    var self = this;
    if (self.isLocalHost()) {
      // 本机/局域网：固定用同源代理，不依赖云端配置
      self.globalData.VIDEO_API_BASE = '';
      self._configPromise = Promise.resolve('');
      return self._configPromise;
    }
    self._configPromise = new Promise(function (resolve) {
      var done = function () { resolve(self.globalData.VIDEO_API_BASE); };
      // 应用一份配置（命中返回 true）
      var applyRec = function (rec) {
        var hit = false;
        if (typeof rec.videoApiBase === 'string' && rec.videoApiBase) {
          self.globalData.VIDEO_API_BASE = rec.videoApiBase;
          console.log('视频接口地址(云端):', rec.videoApiBase);
          hit = true;
        }
        // TDuck 问卷系统的外网隧道地址（外网启动脚本写入；本机局域网用原地址）
        if (typeof rec.tduckApiBase === 'string' && rec.tduckApiBase) {
          self.globalData.TDUCK_BASE_URL = rec.tduckApiBase;
          console.log('问卷系统地址(云端):', rec.tduckApiBase);
          hit = true;
        }
        return hit;
      };
      // 备用源：github.io 托管的 config.json（无额度限制，JSONBin 读取失败/额度用尽时自动切换）
      var loadPagesConfig = function () {
        wx.request({
          url: self.globalData.PAGES_CONFIG_URL + '?t=' + Date.now(),
          method: 'GET',
          timeout: 8000,
          success: function (res) {
            if (!applyRec(res.data || {})) {
              console.warn('github.io 云端配置为空，使用默认配置');
            }
            done();
          },
          fail: function () {
            console.warn('读取 github.io 云端配置失败，使用默认配置');
            done();
          }
        });
      };
      // 首选源：JSONBin 配置 bin（现状不变），读不到数据时自动换备用源
      wx.request({
        url: self.globalData.JSONBIN_CONFIG_URL,
        method: 'GET',
        header: { 'X-Master-Key': self.globalData.JSONBin_API_KEY },
        timeout: 8000,
        success: function (res) {
          var rec = (res.data && res.data.record) || {};
          if (applyRec(rec)) done();
          else loadPagesConfig();
        },
        fail: function () {
          console.warn('读取视频接口云端配置失败，尝试 github.io 备用配置');
          loadPagesConfig();
        }
      });
    });
    return self._configPromise;
  },

  // 保存数据到 JSONBin.io（逻辑同原版：先本地、再云端）
  async saveData() {
    const dataToSave = {
      groupsData: this.globalData.groupsData,
      ratingSchemes: this.globalData.ratingSchemes,
      currentSchemeId: this.globalData.currentSchemeId,
      currentScoringMethod: this.globalData.currentScoringMethod,
      groupNames: this.globalData.groupNames,
      reRatingRequests: this.globalData.reRatingRequests,
      ratingHistory: this.globalData.ratingHistory,
      historyActivities: this.globalData.historyActivities,
      homeText: this.globalData.homeText,
      appVersion: this.globalData.appVersion,
      lastSaveTime: Date.now(),
      requireJudgeName: this.globalData.requireJudgeName,
      judgeNamePlaceholder: this.globalData.judgeNamePlaceholder,
      allowJudgeViewDetails: this.globalData.allowJudgeViewDetails,
      surveys: this.globalData.surveys,
      surveyResponses: this.globalData.surveyResponses
    };

    try {
      wx.setStorageSync('ratingSystemData', dataToSave);
      console.log('数据保存到本地成功');
    } catch (e) {
      console.error('保存到本地失败:', e);
    }

    return new Promise(function (resolve, reject) {
      wx.request({
        url: window.App.globalData.JSONBIN_API_URL,
        method: 'PUT',
        data: dataToSave,
        header: {
          'Content-Type': 'application/json',
          'X-Master-Key': window.App.globalData.JSONBin_API_KEY
        },
        success: function (res) {
          console.log('数据保存到 JSONBin.io 成功', res);
          resolve(true);
        },
        fail: function (err) {
          console.error('保存到 JSONBin.io 失败:', err);
          reject(err);
        }
      });
    });
  },

  // 从 JSONBin.io 加载数据
  async loadData() {
    var self = this;
    return new Promise(function (resolve) {
      console.log('=== 开始从云端加载数据 ===');
      wx.getNetworkType({
        success: function (res) {
          if (res.networkType === 'none') {
            self.loadLocalData();
            resolve(false);
            return;
          }
          wx.request({
            url: self.globalData.JSONBIN_API_URL,
            method: 'GET',
            header: { 'X-Master-Key': self.globalData.JSONBin_API_KEY },
            timeout: 10000,
            success: function (res) {
              const cloudData = res.data && res.data.record;
              if (cloudData) {
                self.applyCloudData(cloudData);
                try { wx.setStorageSync('ratingSystemData', cloudData); } catch (e) {}
                console.log('=== 从 JSONBin.io 加载数据成功 ===');
                resolve(true);
              } else {
                self.loadLocalData();
                resolve(true);
              }
            },
            fail: function (err) {
              console.error('=== 从 JSONBin.io 加载数据失败 ===', err);
              self.loadLocalData();
              resolve(false);
            }
          });
        }
      });
    });
  },

  // 将云端数据应用到 globalData（含默认评分方案兜底，逻辑同原版）
  applyCloudData(cloudData) {
    var g = this.globalData;
    g.groupsData = cloudData.groupsData || {};
    g.ratingSchemes = cloudData.ratingSchemes || {};
    g.currentSchemeId = cloudData.currentSchemeId || "scheme1";
    g.currentScoringMethod = cloudData.currentScoringMethod || "method1";
    g.groupNames = cloudData.groupNames || ["洗护组", "护肤1组", "护肤2组", "护肤3组"];
    g.reRatingRequests = cloudData.reRatingRequests || [];
    g.ratingHistory = cloudData.ratingHistory || [];
    g.historyActivities = cloudData.historyActivities || [];
    g.homeText = cloudData.homeText || '';
    g.lastSaveTime = cloudData.lastSaveTime || Date.now();
    g.requireJudgeName = cloudData.requireJudgeName !== undefined ? cloudData.requireJudgeName : true;
    g.judgeNamePlaceholder = cloudData.judgeNamePlaceholder || '请输入您的姓名';
    g.allowJudgeViewDetails = cloudData.allowJudgeViewDetails !== undefined ? cloudData.allowJudgeViewDetails : true;
    g.surveys = cloudData.surveys || {};
    g.surveyResponses = cloudData.surveyResponses || {};

    if (Object.keys(g.ratingSchemes).length === 0) {
      g.ratingSchemes = {
        scheme1: {
          id: "scheme1",
          name: "默认评分方案",
          description: "系统默认的评分方案",
          dimensions: [
            {
              name: "外观",
              weight: 100,
              minScore: 1,
              maxScore: 10,
              type: "score",
              scoreLevels: [
                { score: 1, description: "差" },
                { score: 5, description: "中" },
                { score: 10, description: "优" }
              ]
            }
          ],
          totalScore: 100,
          isActive: true,
          createdAt: Date.now(),
          schemeLink: ""
        }
      };
      g.currentSchemeId = "scheme1";
    }
    for (var id in g.ratingSchemes) {
      g.ratingSchemes[id].isActive = id === g.currentSchemeId;
    }
  },

  // 从本地加载数据
  loadLocalData() {
    try {
      const savedData = wx.getStorageSync('ratingSystemData');
      if (savedData) {
        this.applyCloudData(Object.assign({}, savedData, { ratingSchemes: savedData.ratingSchemes || {} }));
        // applyCloudData 会对空方案兜底，此处保持原语义
        if (savedData.ratingSchemes && Object.keys(savedData.ratingSchemes).length > 0) {
          this.globalData.ratingSchemes = savedData.ratingSchemes;
          this.globalData.currentSchemeId = savedData.currentSchemeId || "scheme1";
        }
        console.log('从本地加载数据成功');
        return true;
      }
    } catch (e) {
      console.error('从本地加载数据失败:', e);
    }
    return false;
  },

  // 手动从云端加载评分方案
  async loadSchemesFromCloud() {
    var self = this;
    return new Promise(function (resolve, reject) {
      wx.request({
        url: self.globalData.JSONBIN_API_URL,
        method: 'GET',
        header: {
          'X-Master-Key': self.globalData.JSONBin_API_KEY,
          'Content-Type': 'application/json'
        },
        success: function (res) {
          if (res.statusCode !== 200) { resolve(false); return; }
          const cloudData = res.data && res.data.record;
          if (cloudData) {
            self.globalData.ratingSchemes = cloudData.ratingSchemes || {};
            self.globalData.currentSchemeId = cloudData.currentSchemeId || "scheme1";
            if (Object.keys(self.globalData.ratingSchemes).length === 0) {
              self.loadSchemesFromLocal();
            }
            for (var id in self.globalData.ratingSchemes) {
              self.globalData.ratingSchemes[id].isActive = id === self.globalData.currentSchemeId;
            }
            resolve(true);
          } else {
            resolve(false);
          }
        },
        fail: function (err) {
          console.error('=== 从云端加载评分方案请求失败 ===', err);
          reject(err);
        }
      });
    });
  },

  // 手动从本地加载评分方案
  loadSchemesFromLocal() {
    try {
      const savedData = wx.getStorageSync('ratingSystemData');
      if (savedData && savedData.ratingSchemes) {
        this.globalData.ratingSchemes = savedData.ratingSchemes || {};
        this.globalData.currentSchemeId = savedData.currentSchemeId || "scheme1";
        console.log('从本地加载评分方案成功');
        return true;
      }
    } catch (e) {
      console.error('从本地加载评分方案失败:', e);
    }
    return false;
  }
};

// 小程序页面代码中的 getApp() 兼容
window.getApp = function () { return window.App; };

// 启动（对应原小程序 App onLaunch）
if (window.App.onLaunch) {
  try { window.App.onLaunch(); } catch (e) { console.error('onLaunch 失败:', e); }
}
