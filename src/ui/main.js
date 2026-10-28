import { assembleContent, COLLECTIONS, ELEMENTS, WEAKNESS_MULTIPLIER } from '../core/content.js';
import { createCampaign, completeStoryEvent, deserializeCampaign, serializeCampaign } from '../core/progression.js';
import { activeActor, createBattle, executeAction, executeEnemyTurn, abilityAvailability, basicAbility, DEFEND, targetsFor } from '../core/battle.js';
import { seededRandom } from '../core/random.js';
import { skillDescription, skillCost } from './skill-presentation.js';
import { playBattleFeedback } from './battle-feedback.js';
import { createRosterMenu } from './roster-menu.js';
import { createGachaMenu } from './gacha-menu.js';
import { claimBattleReward, economyRules } from '../core/economy.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'northern-prisma.campaign.v2';
const LEGACY_SAVE_KEY = 'northern-prisma.campaign.v1';
const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const notify = message => { $('notice').textContent = message; };
let content, campaign, battle = null, selectedAbility = null, reportedBattle = null, rosterMenu = null, gachaMenu = null, battleBusy = false;
const persistCampaign = next => localStorage.setItem(SAVE_KEY, serializeCampaign(next));
const readSave = () => localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
function commitCampaign(next) {
  persistCampaign(next);
  campaign = next;
  renderCampaign();
}

function setBattleBusy(value) {
  battleBusy = value;
  for (const id of ['start', 'load', 'preparation-nav', 'back-to-preparation', 'gacha-nav', 'claim-reward']) $(id).disabled = value;
  $('start').disabled = value || Boolean(battle?.outcome === 'victory' && !battle.rewardClaimed);
  $('battle-nav').disabled = value || !battle;
  $('battle-screen').setAttribute('aria-busy', String(value));
  renderCommands();
}

function showScreen(screen, focus = true) {
  if (screen === 'battle' && !battle) screen = 'preparation';
  for (const name of ['preparation', 'battle', 'gacha']) {
    $(`${name}-screen`).hidden = name !== screen;
    $(`${name}-nav`).removeAttribute('aria-current');
  }
  $(`${screen}-nav`).setAttribute('aria-current', 'page');
  $('battle-nav').disabled = battleBusy || !battle;
  if (screen === 'gacha') gachaMenu.render();
  if (focus) {
    $(({ battle: 'battle-title', preparation: 'campaign-title', gacha: 'gacha-title' })[screen]).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (screen === 'battle') $('log').scrollTop = $('log').scrollHeight;
}

function renderCampaign() {
  $('start').disabled = battleBusy || Boolean(battle?.outcome === 'victory' && !battle.rewardClaimed);
  rosterMenu.render();
  const trained = campaign.characters.arthur.upgradeIds.includes('arthur.control_training');
  $('training').disabled = trained;
  $('training').textContent = trained ? 'Đã hoàn thành' : 'Hoàn thành luyện kiếm';
  $('story-description').textContent = trained
    ? 'Đã mở Giải phóng một phần và thay Ogre’s Bane — Bất kham bằng bản Kiểm soát. Áp dụng ở trận tiếp theo.'
    : 'Mốc truyện thử nghiệm: hoàn thành luyện kiếm để giảm tác dụng phụ của Ogre’s Bane và mở Giải phóng một phần.';
  $('progress').textContent = `${campaign.victories} chiến thắng`;
  $('coin-balance').textContent = `${new Intl.NumberFormat('vi-VN').format(campaign.coins)} coin`;
  gachaMenu?.render();
}

function meter(value, max, kind) {
  const bar = make('div', `meter ${kind}`);
  const fill = make('span');
  fill.style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
  bar.append(fill);
  return bar;
}

function actorCard(actor, currentId) {
  const card = make('article', `actor-card${actor.hp <= 0 ? ' dead' : ''}${currentId === actor.id ? ' active' : ''}${actor.shield > 0 ? ' is-shielded' : ''}`);
  card.dataset.actorId = actor.id;
  card.append(make('span', 'element', actor.element), make('h3', '', actor.name), make('div', 'role', actor.role ?? 'Sinh vật hoang dã'));
  if (actor.team === 'enemy' && actor.weaknesses?.length) {
    const elements = actor.weaknesses.length === ELEMENTS.length ? 'Tất cả hệ' : actor.weaknesses.map(element => element.toUpperCase()).join(' · ');
    const weakness = make('div', 'enemy-weakness', `Yếu: ${elements} (+${Math.round((WEAKNESS_MULTIPLIER - 1) * 100)}%)`);
    weakness.title = `Nhận thêm sát thương từ: ${actor.weaknesses.map(element => element.toUpperCase()).join(', ')}.`;
    card.append(weakness);
  }
  card.append(meter(actor.hp, actor.stats.maxHp, 'hp'), make('div', 'hp-label', `HP ${actor.hp} / ${actor.stats.maxHp}`));
  card.append(meter(actor.mp, actor.stats.maxMp, 'mp'), make('div', 'hp-label', `MP ${actor.mp} / ${actor.stats.maxMp}`));
  if (actor.shield) card.append(make('div', 'hp-label shield', `Khiên: ${actor.shield}`));
  for (const [id, resource] of Object.entries(actor.resources ?? {})) card.append(make('div', 'resources', `${resource.name}: ${actor.resourceValues[id]} / ${resource.max}`));
  const statuses = actor.statuses.map(status => `${content.statuses[status.id].name}${status.stacks > 1 ? ` ×${status.stacks}` : ''} (${status.remaining})`).join(' · ');
  if (statuses) card.append(make('div', 'statuses', statuses));
  return card;
}

function allAbilities(actor) { return [basicAbility(actor), ...actor.abilities.map(id => content.abilities[id]), DEFEND]; }

function renderCommands() {
  $('abilities').replaceChildren();
  $('target-controls').hidden = true;
  $('action-help').textContent = '';
  const actor = battle && activeActor(battle);
  if (!actor || actor.team !== 'party') {
    $('actor-title').textContent = battle?.outcome ? 'Trận đấu kết thúc' : 'Chờ xuất phát';
    $('actor-description').textContent = 'Chọn đội hình để thử một trận mới. Tiến trình nhân vật được lưu riêng với trạng thái chiến đấu.';
    return;
  }
  $('actor-title').textContent = `Lượt của ${actor.name}`;
  $('actor-description').textContent = actor.description;
  const skills = allAbilities(actor);
  if (!skills.some(skill => skill.id === selectedAbility && abilityAvailability(battle, actor, skill).ok)) selectedAbility = '$attack';
  for (const skill of skills) {
    const availability = abilityAvailability(battle, actor, skill);
    const button = make('button', `ability${selectedAbility === skill.id ? ' selected' : ''}`);
    button.disabled = battleBusy || !availability.ok;
    button.setAttribute('aria-pressed', String(selectedAbility === skill.id));
    button.append(make('strong', '', skill.name), make('small', '', skillDescription(skill)), make('small', '', availability.ok ? skillCost(skill, actor) : availability.reason));
    button.addEventListener('click', () => { selectedAbility = skill.id; renderCommands(); });
    $('abilities').append(button);
  }
  const skill = skills.find(item => item.id === selectedAbility);
  const legal = targetsFor(battle, actor, skill);
  $('target').replaceChildren();
  for (const target of legal) $('target').append(new Option(`${target.name} · HP ${target.hp}/${target.stats.maxHp}`, target.id));
  const automatic = skill.target.startsWith('all_') || skill.target === 'self';
  $('target').disabled = battleBusy || automatic;
  $('target-controls').hidden = false;
  $('execute').disabled = battleBusy || !legal.length;
  $('action-help').textContent = battleBusy ? 'Đang diễn ra hành động…' : automatic ? (skill.target === 'self' ? 'Tự dùng lên bản thân.' : 'Tác động lên toàn bộ mục tiêu hợp lệ.') : 'Chọn mục tiêu rồi thực hiện. Kẻ địch hành động tự động.';
}

function renderBattle() {
  $('claim-reward').hidden = !(battle?.outcome === 'victory' && !battle.rewardClaimed);
  $('battle-nav').disabled = battleBusy || !battle;
  $('battle-nav').textContent = battle?.outcome ? '02 / Kết quả trận' : '02 / Chiến đấu';
  $('empty-battle').hidden = Boolean(battle);
  if (!battle) { renderCommands(); return; }
  const actor = activeActor(battle);
  $('battle-title').textContent = content.encounters[battle.encounterId].name;
  $('round').textContent = `Vòng ${battle.round}`;
  $('allies').replaceChildren(...battle.actors.filter(item => item.team === 'party').map(item => actorCard(item, actor?.id)));
  $('enemies').replaceChildren(...battle.actors.filter(item => item.team === 'enemy').map(item => actorCard(item, actor?.id)));
  const queue = battle.queue.slice(battle.cursor).map(id => battle.actors.find(item => item.id === id)).filter(item => item.hp > 0);
  $('turn-order').textContent = battle.outcome ? 'Cuộc chạm trán đã khép lại.' : `Thứ tự còn lại: ${queue.map(item => item.name).join(' → ')}`;
  $('battle-result').textContent = battle.outcome === 'victory' ? `Chiến thắng · ${battle.rewardClaimed ? `+${economyRules(content).victoryCoins} coin đã lưu` : 'Chờ nhận thưởng'}` : ({ defeat: 'Đội hình đã gục ngã', draw: 'Hòa — đạt giới hạn 60 vòng' })[battle.outcome] ?? '';
  $('log').replaceChildren(...battle.log.map(line => make('li', '', line)));
  $('log').scrollTop = $('log').scrollHeight;
  renderCommands();
}

async function advanceEnemies() {
  // Every action advances a turn and the engine has a round limit.
  while (!battle.outcome && activeActor(battle)?.team === 'enemy') {
    executeEnemyTurn(battle);
    renderBattle();
    await playBattleFeedback(battle.events, $('battle-screen'));
  }
  if (battle.outcome && reportedBattle !== battle) {
    if (battle.outcome === 'victory') {
      try {
        campaign = claimBattleReward(campaign, battle, content, persistCampaign);
        notify(`Chiến thắng! +${economyRules(content).victoryCoins} coin. Tiến trình đã tự động lưu.`);
      } catch (error) {
        notify(`Chưa lưu được thưởng: ${error.message} Bấm Nhận thưởng chiến thắng để thử lại.`);
        renderBattle();
        return;
      }
    }
    reportedBattle = battle;
    renderCampaign();
    renderBattle();
  }
}

async function init() {
  const collections = await Promise.all(COLLECTIONS.map(async name => {
    const response = await fetch(`/data/${name}.json`);
    if (!response.ok) throw new Error(`Không đọc được dữ liệu ${name}.`);
    return [name, await response.json()];
  }));
  content = assembleContent(Object.fromEntries(collections));
  campaign = createCampaign(content);
  try {
    const saved = readSave();
    if (saved) {
      const migrated = JSON.parse(saved).version === 1;
      campaign = deserializeCampaign(saved, content);
      if (migrated) persistCampaign(campaign);
      notify(migrated ? 'Đã chuyển save v1 sang v2: giữ tiến trình truyện, mở sáu nhân vật chính và cấp bù 100 coin mỗi chiến thắng cũ. Bản v1 vẫn được giữ.' : 'Đã tải tiến trình đã lưu.');
    }
  } catch (error) { notify(`Không tải được save: ${error.message} Bản cũ chưa bị ghi đè.`); }
  rosterMenu = createRosterMenu({ content, getCampaign: () => campaign, onChange: notify });
  gachaMenu = createGachaMenu({ content, getCampaign: () => campaign, commit: commitCampaign, onChange: notify });
  for (const encounter of Object.values(content.encounters)) $('encounter').append(new Option(encounter.name, encounter.id));
  const describeEncounter = () => { $('encounter-description').textContent = content.encounters[$('encounter').value].description; };
  $('encounter').addEventListener('change', describeEncounter);
  describeEncounter();
  $('preparation-nav').addEventListener('click', () => showScreen('preparation'));
  $('back-to-preparation').addEventListener('click', () => showScreen('preparation'));
  $('battle-nav').addEventListener('click', () => { renderBattle(); showScreen('battle'); });
  $('gacha-nav').addEventListener('click', () => showScreen('gacha'));
  $('claim-reward').addEventListener('click', async () => {
    if (battleBusy) return;
    setBattleBusy(true);
    try { await advanceEnemies(); } finally { setBattleBusy(false); }
  });
  $('start').addEventListener('click', async () => {
    if (battleBusy || (battle?.outcome === 'victory' && !battle.rewardClaimed)) return;
    if (battle && !battle.outcome && !window.confirm('Bỏ trận hiện tại và bắt đầu trận mới?')) return;
    try {
      setBattleBusy(true);
      battle = createBattle(content, campaign, $('encounter').value, seededRandom(20261027));
      selectedAbility = null;
      renderBattle(); showScreen('battle');
      notify('Trận đấu đã bắt đầu.');
      await playBattleFeedback(battle.events, $('battle-screen'));
      await advanceEnemies();
    } catch (error) { notify(error.message); }
    finally { setBattleBusy(false); }
  });
  $('execute').addEventListener('click', async () => {
    if (battleBusy || !battle || !activeActor(battle)) return;
    const command = { actorId: activeActor(battle).id, abilityId: selectedAbility, targetId: $('target').value };
    try {
      setBattleBusy(true);
      executeAction(battle, command);
      selectedAbility = null;
      renderBattle();
      await playBattleFeedback(battle.events, $('battle-screen'));
      await advanceEnemies();
    } catch (error) { notify(error.message); }
    finally { setBattleBusy(false); }
  });
  $('training').addEventListener('click', () => {
    completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
    renderCampaign();
    notify('Arthur đã được nâng cấp. Bắt đầu trận mới để thử, rồi lưu tiến trình khi cần.');
  });
  $('save').addEventListener('click', () => {
    try { persistCampaign(campaign); notify('Đã lưu tiến trình trên trình duyệt này. Trạng thái trận đấu không được lưu.'); }
    catch (error) { notify(`Không lưu được: ${error.message}`); }
  });
  $('load').addEventListener('click', () => {
    try {
      const raw = readSave();
      if (!raw) { notify('Chưa có tiến trình đã lưu.'); return; }
      const loaded = deserializeCampaign(raw, content);
      if (battle && !battle.outcome && !window.confirm('Tải tiến trình sẽ kết thúc trận hiện tại. Tiếp tục?')) return;
      campaign = loaded; battle = null; selectedAbility = null;
      gachaMenu.clear();
      $('allies').replaceChildren(); $('enemies').replaceChildren(); $('log').replaceChildren();
      $('turn-order').textContent = ''; $('battle-result').textContent = ''; $('round').textContent = 'Chưa bắt đầu';
      renderCampaign(); renderBattle(); showScreen('preparation'); notify('Đã tải tiến trình.');
    } catch (error) { notify(`Không tải được: ${error.message}`); }
  });
  renderCampaign(); renderBattle(); showScreen('preparation', false);
  for (const id of ['start', 'save', 'load', 'gacha-nav']) $(id).disabled = false;
}

init().catch(error => { notify(`Không khởi tạo được: ${error.message}`); $('start').disabled = true; console.error(error); });
