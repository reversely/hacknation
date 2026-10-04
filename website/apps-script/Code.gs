function doGet() {
  var farm = approvedFarm_();
  if (!farm) {
    return HtmlService.createHtmlOutput('This farm page is not published yet.')
      .setTitle('Farm website')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var template = HtmlService.createTemplateFromFile('page');
  template.farm = farm;
  template.page = safePage_(farm.page);
  var digits = String(farm.whatsapp_number || '').replace(/\D/g, '');
  template.whatsappUrl = digits ? 'https://wa.me/' + digits : '#';
  return template.evaluate()
    .setTitle(farm.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function approvedFarm_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Farm');
  if (!sheet || sheet.getLastRow() < 2) return null;

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (value) { return String(value); });
  var rows = values.slice(1).map(function (cells) {
    var record = {};
    headers.forEach(function (key, index) { record[key] = cells[index]; });
    ['description', 'offerings', 'meeting_instructions', 'policies', 'page'].forEach(function (key) {
      if (typeof record[key] === 'string' && record[key]) {
        try { record[key] = JSON.parse(record[key]); } catch (error) { record[key] = null; }
      }
    });
    return record;
  });

  var approved = rows.filter(function (record) { return record.status === 'APPROVED'; });
  approved.sort(function (left, right) { return Number(right.version || 0) - Number(left.version || 0); });
  return approved.length ? approved[0] : null;
}

function safePage_(value) {
  var defaults = {
    headline: { en: 'A day on the farm', sw: 'Siku moja shambani' },
    introduction: { en: 'Come and enjoy a visit with us.', sw: 'Njoo ufurahie kututembelea.' },
    theme: 'leaf',
    sectionOrder: ['offerings', 'visit', 'policies']
  };
  if (!value || typeof value !== 'object') return defaults;
  var themes = ['coffee', 'leaf', 'sunrise'];
  var sections = ['offerings', 'visit', 'policies'];
  var page = value;
  if (!page.headline || !page.introduction || !themes.includes(page.theme) ||
      !Array.isArray(page.sectionOrder) || page.sectionOrder.length !== 3 ||
      sections.some(function (section) { return page.sectionOrder.indexOf(section) === -1; })) return defaults;
  return page;
}
