// BOSS 直聘选择器（IIFE 包裹，防止 SPA 重复注入时报 const 重定义错误）
(function() {
  if (typeof SELECTORS !== 'undefined') return;  // 已注入过则跳过

  var s = {
    jobs: {
      jobCard: 'li.job-card-box',
      jobName: '.job-name',
      jobSalary: '.job-salary',
      tagList: '.tag-list li',
      company: '.company-name, .boss-info .company-name, [class*="company-name"]',
      immediateChatBtn: 'a.op-btn-chat'
    },
    chat: {
      userList: '.user-list-content li',
      userName: '.geek-name, .name-text, [class*="name"]',
      userCompany: '.title-box .name-box, [class*="company"]',
      chatInput: 'div#chat-input.chat-input',
      btnSend: 'button.btn-send',
      imageUpload: '.btn-sendimg input[type=file]',
      messageSent: '.item-myself'
    }
  };

  var cm = {
    '全国':'100010000','北京':'101010100','上海':'101020100','广州':'101280100','深圳':'101280600',
    '杭州':'101210100','成都':'101270100','武汉':'101200100','西安':'101110100','南京':'101190100',
    '苏州':'101190400','天津':'101030100','重庆':'101040100','长沙':'101250100','郑州':'101180100',
    '沈阳':'101070100','青岛':'101120200','合肥':'101220100','厦门':'101230200','福州':'101230100',
    '济南':'101120100','宁波':'101210400','东莞':'101281600','无锡':'101190200','昆明':'101290100',
    '哈尔滨':'101050100','长春':'101060100','大连':'101070200','石家庄':'101090100'
  };

  // 用 var 挂到全局（content script 共享作用域），不声明 const 避免重复注入报错
  this.SELECTORS = s;
  this.CITY_MAP = cm;
}).call(this);
