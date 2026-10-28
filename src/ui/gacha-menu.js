import { economyRules, pullGacha, recruitCharacter } from '../core/economy.js';
import { ownsCharacter } from '../core/ownership.js';

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const percent = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, style: 'percent' }).format(value);

export function createGachaMenu({ content, getCampaign, commit, onChange }) {
  const $ = id => document.getElementById(id);
  const rules = economyRules(content);
  let results = [];
  let busy = false;
  const selectedBanner = () => content.banners[$('banner-select').value];
  for (const banner of Object.values(content.banners)) $('banner-select').append(new Option(banner.name, banner.id));

  function render() {
    const campaign = getCampaign();
    const banner = selectedBanner();
    const total = banner.gearWeight + banner.characterWeight;
    $('gacha-title').textContent = banner.name;
    $('banner-description').textContent = banner.description;
    $('gacha-progress').textContent = `${campaign.gacha.totalPulls} lượt đã quay`;
    $('pull-one').textContent = `Quay 1 lần · ${rules.singlePullCost} coin`;
    $('pull-ten').textContent = `Quay 10 lần · ${rules.tenPullCost} coin`;
    $('pull-one').disabled = busy || campaign.coins < rules.singlePullCost;
    $('pull-ten').disabled = busy || campaign.coins < rules.tenPullCost;
    $('gacha-help').textContent = `Thắng một trận nhận ${rules.victoryCoins} coin. Mỗi lượt độc lập: ${percent(banner.gearWeight / total)} gear, ${percent(banner.characterWeight / total)} nhân vật. Quay 10 không bảo đảm nhân vật. Kết quả tự động được lưu.`;
    const rates = $('banner-rates');
    rates.replaceChildren(make('p', '', `Mỗi nhân vật trong pool: ${percent(banner.characterWeight / total / banner.characterPool.length)} mỗi lượt. Nhân vật trùng nhận ${rules.duplicateShards} mảnh.`));
    const weight = banner.gearRates.reduce((sum, item) => sum + item.weight, 0);
    for (const item of banner.gearRates) {
      const type = content.gearTypes[item.typeId];
      rates.append(make('p', '', `${type.name}: ${percent(item.weight / weight)} trong nhánh gear · ${percent(banner.gearWeight / total * item.weight / weight)} mỗi lượt · +${type.points} điểm × ${type.statCount} chỉ số.`));
    }
    rates.append(make('p', '', `Chỉ số chọn đều, không trùng trong cùng món. Mỗi điểm: ${rules.gearStats.map(item => `${item.label} +${item.scale}`).join(', ')}.`));
    $('banner-pool').replaceChildren(...banner.characterPool.map(id => make('span', 'badge', `${content.characters[id].name} · ${ownsCharacter(campaign, id) ? 'Đã sở hữu' : 'Chưa sở hữu'}`)));
    $('gacha-results').replaceChildren(...results.map(result => {
      const card = make('article', `gacha-result ${result.kind}`);
      if (result.kind === 'character') {
        const actor = content.characters[result.characterId];
        card.append(make('span', 'element', actor.element), make('h4', '', actor.name), make('p', '', result.duplicate ? `Đã sở hữu · +${result.shards} mảnh` : 'Đồng đội mới · Đã mở khóa'), make('small', '', actor.role));
      } else {
        card.append(make('span', 'element', 'GEAR'), make('h4', '', content.gearTypes[result.gear.typeId].name), make('p', '', Object.entries(result.gear.stats).map(([key, value]) => `${rules.gearStats.find(item => item.stat === key).label} +${value}`).join(' · ')), make('small', '', 'Đã lưu vào bộ sưu tập gear'));
      }
      return card;
    }));
    $('gacha-result-summary').textContent = results.length ? `${results.length} kết quả · ${results.filter(item => item.kind === 'gear').length} gear · ${results.filter(item => item.kind === 'character' && !item.duplicate).length} nhân vật mới · ${results.filter(item => item.duplicate).length} nhân vật trùng.` : 'Chưa quay trong phiên này.';
    const previous = $('recruit-character').value;
    const locked = banner.characterPool.filter(id => !ownsCharacter(campaign, id));
    $('recruit-character').replaceChildren(...locked.map(id => new Option(content.characters[id].name, id)));
    if (locked.includes(previous)) $('recruit-character').value = previous;
    if (!locked.length) $('recruit-character').append(new Option('Đã sở hữu toàn bộ nhân vật', ''));
    $('recruit-character').disabled = busy || !locked.length;
    $('recruit').disabled = busy || !locked.length || campaign.recruitmentShards < rules.recruitCost;
    $('recruit-help').textContent = `${campaign.recruitmentShards} mảnh hiện có · Đổi ${rules.recruitCost} mảnh để chọn một nhân vật chưa sở hữu.`;
    $('gear-summary').textContent = `Đã lưu ${campaign.gear.length} gear. Gear chưa cộng chỉ số; túi đồ và equip sẽ được bổ sung ở bước tiếp theo.`;
  }

  function transact(operation, message) {
    if (busy) return;
    busy = true;
    try {
      const outcome = operation();
      commit(outcome.campaign); // Storage errors leave the current campaign and previous results intact.
      results = outcome.results;
      onChange(message);
    } catch (error) { onChange(`Không thể chiêu mộ: ${error.message}`); }
    finally { busy = false; render(); }
  }
  $('pull-one').addEventListener('click', () => transact(() => pullGacha(getCampaign(), content, selectedBanner().id, 1), 'Đã quay 1 lần và lưu kết quả.'));
  $('pull-ten').addEventListener('click', () => transact(() => pullGacha(getCampaign(), content, selectedBanner().id, 10), 'Đã quay 10 lần và lưu kết quả.'));
  $('recruit').addEventListener('click', () => {
    const id = $('recruit-character').value;
    transact(() => ({ campaign: recruitCharacter(getCampaign(), content, selectedBanner().id, id), results: [] }), `Đã mở khóa ${content.characters[id]?.name}.`);
  });
  $('banner-select').addEventListener('change', () => { results = []; render(); });
  return { render, clear: () => { results = []; render(); } };
}
