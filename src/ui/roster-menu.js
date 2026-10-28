import { ELEMENTS, ROLE_GROUPS } from '../core/content.js';
import { partySlots, assignPartySlot, removePartySlot } from '../core/party.js';
import { resolveCharacter } from '../core/progression.js';
import { ownsCharacter } from '../core/ownership.js';
import { basicAbility, DEFEND } from '../core/battle.js';
import { skillDescription, skillCost, passiveDescription, TARGET_NAMES, skillScaling, skillPreviewOptions } from './skill-presentation.js';

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function portrait(actor) {
  const node = make('span', 'character-portrait', actor.name.slice(0, 1));
  node.dataset.element = actor.element;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

const searchable = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

export function createRosterMenu({ content, getCampaign, onChange }) {
  const $ = id => document.getElementById(id);
  let selectedSlot = 0;
  let previewId = getCampaign().party.find(Boolean);
  const assumptions = new Map();

  function renderSlots() {
    const slots = partySlots(getCampaign().party);
    $('party-select').replaceChildren();
    slots.forEach((id, index) => {
      const actor = content.characters[id];
      const button = make('button', 'party-slot');
      button.setAttribute('aria-pressed', String(index === selectedSlot));
      button.setAttribute('aria-controls', 'character-menu');
      button.setAttribute('aria-label', `Chọn vị trí ${index + 1}: ${actor?.name ?? 'Trống'}`);
      button.append(make('span', 'slot-number', `VỊ TRÍ ${index + 1}`));
      const body = make('span', 'slot-body');
      if (actor) body.append(portrait(actor));
      else body.append(make('span', 'empty-portrait', '+'));
      const description = make('span');
      description.append(make('strong', '', actor?.name ?? 'Ô trống'), make('small', '', actor ? `${actor.element.toUpperCase()} · ${actor.role}` : 'Chọn một đồng đội bên dưới'));
      body.append(description);
      button.append(body, make('span', 'slot-action', index === selectedSlot ? 'Đang chọn vị trí này' : 'Chọn để thay hoặc đổi chỗ'));
      button.addEventListener('click', () => {
        selectedSlot = index;
        if (id) previewId = id;
        render();
        $('party-select').children[index].focus({ preventScroll: true });
      });
      $('party-select').append(button);
    });
    $('selected-slot').textContent = `Đang chọn vị trí ${selectedSlot + 1}${slots[selectedSlot] ? ` · ${content.characters[slots[selectedSlot]].name}` : ' · Ô trống'}`;
  }

  function renderRoster() {
    const query = searchable($('roster-search').value.trim());
    const element = $('roster-element').value;
    const role = $('roster-role').value;
    const ownership = $('roster-ownership').value;
    const roster = Object.values(content.characters);
    const filtered = roster.filter(actor => (!element || actor.element === element)
      && (!ownership || ownsCharacter(getCampaign(), actor.id) === (ownership === 'owned'))
      && (!role || actor.roleGroup === role || actor.secondaryRoleGroups?.includes(role))
      && searchable(`${actor.name} ${actor.title} ${actor.role} ${actor.affiliation ?? ''}`).includes(query));
    const grid = $('roster-grid');
    const previousScroll = grid.scrollTop;
    grid.replaceChildren();
    const slots = partySlots(getCampaign().party);
    for (const actor of filtered) {
      const index = slots.indexOf(actor.id);
      const owned = ownsCharacter(getCampaign(), actor.id);
      const button = make('button', `roster-character${owned ? '' : ' is-locked'}`);
      button.dataset.previewId = actor.id;
      button.setAttribute('aria-pressed', String(actor.id === previewId));
      button.setAttribute('aria-controls', 'preview-details');
      button.append(portrait(actor), make('strong', '', actor.name), make('span', 'roster-element', actor.element.toUpperCase()), make('small', 'roster-role', actor.role), make('span', 'roster-membership', !owned ? '🔒 Chưa mở khóa' : index >= 0 ? `Trong đội · Vị trí ${index + 1}` : 'Đã sở hữu'));
      button.addEventListener('click', () => {
        previewId = actor.id;
        renderRoster(); renderDetails();
        [...grid.children].find(node => node.dataset.previewId === previewId)?.focus({ preventScroll: true });
        if (window.matchMedia('(max-width: 760px)').matches) $('preview-details').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      grid.append(button);
    }
    grid.scrollTop = previousScroll;
    $('roster-count').textContent = `${filtered.length} / ${roster.length} nhân vật · Đã sở hữu ${getCampaign().unlockedCharacterIds.length}`;
    $('roster-empty').hidden = filtered.length > 0;
  }

  function renderDetails() {
    const campaign = getCampaign();
    if (!content.characters[previewId]) previewId = campaign.party.find(Boolean);
    const actor = resolveCharacter(content, campaign, previewId);
    const slots = partySlots(campaign.party);
    const currentSlot = slots.indexOf(previewId);
    const owned = ownsCharacter(campaign, previewId);
    const header = make('div', 'preview-header');
    const introduction = make('div');
    introduction.append(make('span', 'eyebrow', 'HỒ SƠ ĐỒNG ĐỘI'), make('h4', '', `${actor.name} · ${actor.title}`), make('p', 'preview-role', `${actor.role}${actor.affiliation ? ` · ${actor.affiliation}` : ''}`), make('p', 'muted', actor.description));
    header.append(introduction, make('span', 'badge', actor.element.toUpperCase()));

    const actions = make('div', 'roster-actions');
    const assign = make('button', 'primary');
    assign.id = 'assign-character';
    assign.disabled = !owned || currentSlot === selectedSlot;
    assign.textContent = !owned ? '🔒 Chiêu mộ để mở khóa' : currentSlot === selectedSlot ? `Đang ở vị trí ${selectedSlot + 1}`
      : currentSlot >= 0 ? (slots[selectedSlot] ? `Đổi vị trí ${currentSlot + 1} ↔ ${selectedSlot + 1}` : `Chuyển sang vị trí ${selectedSlot + 1}`)
      : `Đưa vào vị trí ${selectedSlot + 1}`;
    assign.addEventListener('click', () => {
      campaign.party = assignPartySlot(campaign.party, selectedSlot, previewId, campaign);
      onChange(`Đã xếp ${actor.name} vào vị trí ${selectedSlot + 1}. Áp dụng ở trận tiếp theo.`);
      render();
      $('party-select').children[selectedSlot].focus({ preventScroll: true });
    });
    const remove = make('button', '', `Gỡ ${actor.name} khỏi đội`);
    remove.disabled = currentSlot < 0 || slots.filter(Boolean).length <= 1;
    remove.addEventListener('click', () => {
      try {
        campaign.party = removePartySlot(campaign.party, currentSlot);
        selectedSlot = currentSlot;
        onChange(`Đã gỡ ${actor.name}. Vị trí ${currentSlot + 1} đang trống.`);
        render();
        $('party-select').children[selectedSlot].focus({ preventScroll: true });
      } catch (error) { onChange(error.message); }
    });
    actions.append(assign, remove);

    const stats = make('div', 'preview-stats');
    for (const [key, name] of Object.entries({ maxHp: 'HP', maxMp: 'MP', attack: 'ATK', magic: 'MAG', defense: 'DEF', resistance: 'RES', speed: 'SPD' })) {
      const item = make('span', '', `${name} `);
      item.append(make('b', '', new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(actor.stats[key])));
      if (actor.baseStats?.[key] !== undefined && actor.baseStats[key] !== actor.stats[key]) item.append(make('small', 'stat-base', ` (${actor.baseStats[key]} cơ bản)`));
      stats.append(item);
    }
    const traits = make('div', 'preview-traits');
    const passive = passiveDescription(actor, content);
    if (passive) {
      const item = make('p');
      item.append(make('strong', '', 'Nội tại: '), document.createTextNode(passive));
      traits.append(item);
    }
    for (const resource of Object.values(actor.resources ?? {})) {
      const item = make('p');
      item.append(make('strong', '', `${resource.name}: `), document.createTextNode(`Bắt đầu trận với 0 / ${resource.max}.`));
      traits.append(item);
    }
    const skills = make('div', 'preview-skills');
    for (const skill of [basicAbility(actor), ...actor.abilities.map(id => content.abilities[id]), DEFEND]) skills.append(skillCard(skill, actor));
    if (actor.passive?.followUpAbility) skills.append(skillCard(content.abilities[actor.passive.followUpAbility], actor));
    const back = make('button', 'back-to-roster', '↑ Trở lại danh sách nhân vật');
    back.addEventListener('click', () => { $('character-menu').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('roster-search').focus({ preventScroll: true }); });
    $('preview-details').replaceChildren(back, header, actions, stats, traits,
      make('p', 'preview-note', 'Hệ số theo kỹ năng hiện có. Giá trị hồi/khiên dùng chỉ số chuẩn bị; hồi thực tế giới hạn bởi HP thiếu. Sát thương còn phụ thuộc phòng thủ, nguyên tố và hiệu ứng trong trận.'), skills);
  }

  function skillCard(skill, actor) {
    const card = make('article', 'preview-skill');
    const meta = make('div', 'preview-meta');
    if (skill.activation === 'passive') meta.append(make('span', '', 'Nội tại · Đánh bồi tự động'));
    meta.append(make('span', 'cost', skillCost(skill, actor)), make('span', '', TARGET_NAMES[skill.target]));
    const damage = skill.effects.find(effect => effect.type === 'damage');
    if (damage) meta.append(make('span', '', `${damage.damageType === 'physical' ? 'Vật lí' : 'Ma pháp'} · ${damage.element.toUpperCase()}`));
    card.append(make('h5', '', skill.name), make('p', '', skillDescription(skill)), meta);
    const scaling = make('div', 'skill-scaling');
    const controls = skillPreviewOptions(skill, actor, content);
    const key = `${actor.id}/${skill.id}`;
    if (!assumptions.has(key)) assumptions.set(key, {});
    const choices = assumptions.get(key);
    const renderScaling = () => scaling.replaceChildren(...skillScaling(skill, actor, content, choices).map(line => make('p', '', line)));
    if (controls.length) {
      const panel = make('div', 'skill-assumptions');
      for (const control of controls) {
        choices[control.key] = Math.max(control.min, Math.min(control.max, choices[control.key] ?? control.max));
        const label = make('label', 'assumption-label');
        const caption = make('span', '', `${control.label}: `);
        const output = make('output', '', String(choices[control.key]));
        caption.append(output);
        const input = make('input');
        input.type = 'range'; input.min = control.min; input.max = control.max; input.step = 1; input.value = choices[control.key];
        input.setAttribute('aria-label', `${actor.name} · ${skill.name} · ${control.label}`);
        input.addEventListener('input', () => {
          choices[control.key] = input.valueAsNumber;
          output.value = input.value;
          renderScaling();
        });
        label.append(caption, input); panel.append(label);
      }
      card.append(panel);
    }
    renderScaling(); card.append(scaling);
    return card;
  }

  function render() { renderSlots(); renderRoster(); renderDetails(); }

  for (const element of ELEMENTS) $('roster-element').append(new Option(element.toUpperCase(), element));
  for (const [id, label] of Object.entries(ROLE_GROUPS)) $('roster-role').append(new Option(label, id));
  $('roster-search').addEventListener('input', renderRoster);
  $('roster-element').addEventListener('change', renderRoster);
  $('roster-role').addEventListener('change', renderRoster);
  $('roster-ownership').addEventListener('change', renderRoster);
  $('clear-roster-filters').addEventListener('click', () => {
    $('roster-search').value = ''; $('roster-element').value = ''; $('roster-role').value = ''; $('roster-ownership').value = '';
    renderRoster(); $('roster-search').focus();
  });
  return { render };
}
