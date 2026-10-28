# Thêm nội dung

Nội dung được viết bằng JSON thuần, ID dùng chữ thường và dấu chấm, ví dụ `arthur.light_slash`. Tên hiển thị và mô tả có thể đổi mà không đổi ID.

## Hiển thị trong menu nhân vật

Menu tự đọc `characters.json`. Nhân vật cần `name`, `title`, `element`, `role`, chỉ số và kỹ năng như các definition hiện tại. Đặt `roleGroup` để lọc theo nhóm: `physical_dps`, `magical_dps`, `offensive_support`, `defensive_support`, `tank`, `fighter`. Đây là ID dùng cho lọc; `role` vẫn là tên chuyên môn hiển thị, ví dụ “DPS né / phản công”. Thiếu `roleGroup` vẫn xuất hiện khi chọn tất cả vai trò. `secondaryRoleGroups` là mảng nhóm phụ để người như Aurora xuất hiện trong cả bộ lọc hỗ trợ và DPS; `affiliation` hiển thị nguồn gốc và có thể tìm kiếm. Muốn thêm nhóm, cập nhật `ROLE_GROUPS` trong `src/core/content.js`.

Hệ số skill preview sinh từ `multiplier`, `perResource`, `perStack`, `flat`, `hits`, `penetration` và nội dung status. Không viết lại hệ số vào một bảng UI riêng. Skill dùng `perResource` với chi phí toàn bộ tài nguyên sẽ có thanh chỉnh từ `min` tới giới hạn tài nguyên nhân vật; `consumeStatus` + `perStack` lấy giới hạn từ `maxStacks` của status. Tăng giới hạn bằng upgrade sẽ cập nhật phạm vi preview.

## Nội tại đánh bồi và hồi MP

**Luật chung bắt buộc cho mọi nhân vật có follow-up:** chỉ kích hoạt từ đòn của đồng đội khác, không tự đánh bồi từ đòn của bản thân. Handler hiện tại và mọi handler bổ sung phải đi qua `canTriggerFollowUp` trong `src/core/follow-up.js`. Không tạo cờ dữ liệu để bỏ qua luật này. Đòn của bản thân cũng không tiêu hạn mức follow-up. Phản công sau khi né/nhận đòn là loại phản ứng riêng.

Ví dụ dữ liệu Aurora:

```json
{
  "type": "magic_followup_mp",
  "name": "Mạch sấm",
  "resource": "thunder_charge",
  "threshold": 2,
  "mpRestoreRatio": 0.2,
  "followUpAbility": "aurora.follow_up"
}
```

`resource` phải tồn tại trong definition nhân vật, ngưỡng không được lớn hơn giới hạn tài nguyên. `followUpAbility` tham chiếu kỹ năng có `activation: "passive"`, `target: "enemy"` và chỉ có damage ma pháp. Không đưa kỹ năng nội tại vào `abilities` chủ động; menu tự thêm thẻ preview từ tham chiếu này. `mpRestoreRatio` tính theo MP tối đa của từng người nhận. Engine xử lý một lần/vòng và kiểm tra tiêu stack đầu lượt; không dùng cooldown kỹ năng để mô phỏng hai quy tắc này.

## Thêm kỹ năng

Nhân vật có thể dùng nội tại `stat_boost` để tăng chỉ số chiến đấu vĩnh viễn, ví dụ Lisbeth:

```json
{
  "type": "stat_boost",
  "name": "Di sản khế ước",
  "modifiers": { "magic": 0.2 }
}
```

Giữ MAG gốc 42 trong `characters.json`; không ghi sẵn 50,4 rồi thêm nội tại +20%. Resolver, menu và battle engine sẽ dùng `effectiveStat` để áp dụng đúng một lần. Các key hiện hỗ trợ: `attack`, `magic`, `defense`, `resistance`, `speed`; chưa hỗ trợ nội tại tăng dung lượng HP/MP bằng loại này. Modifier vĩnh viễn và modifier status cộng tỷ lệ trên cùng chỉ số cơ bản. Nội tại này không tự hết hạn hoặc bị xóa bằng cleanse.

Thêm một phần tử vào `data/abilities.json`:

```json
{
  "id": "arthur.dawn_cut",
  "name": "Bình minh trảm",
  "description": "Một đòn vật lí Light xuyên một phần giáp.",
  "target": "enemy",
  "cost": { "mp": 8 },
  "cooldown": 1,
  "effects": [
    {
      "type": "damage",
      "damageType": "physical",
      "element": "light",
      "multiplier": 1.8,
      "penetration": 0.25
    }
  ]
}
```

Sau đó thêm ID vào `abilities` của nhân vật, hoặc trao qua upgrade. `description` chỉ hiển thị; gameplay đến từ các field hiệu ứng, không được tự suy ra từ văn bản.

### Mục tiêu

| Giá trị | Ý nghĩa |
|---|---|
| `enemy` | Một địch sống; chịu ràng buộc khiêu khích |
| `all_enemies` | Tất cả địch sống, bỏ qua khiêu khích |
| `ally` | Một người cùng đội, có thể là bản thân |
| `all_allies` | Cả đội còn sống, gồm người dùng |
| `self` | Bản thân |

Một effect có `to: "self"` tác động riêng người dùng, dù kỹ năng đang nhắm địch. Mặc định effect tác động lên nhóm mục tiêu của kỹ năng. Chưa hỗ trợ hồi sinh/nhắm người đã gục.

### Các effect hiện có

| Type | Field chính |
|---|---|
| `damage` | `damageType`, `element`, `multiplier`, `penetration`, `hits` |
| `heal` | `flat`, `multiplier` theo MAG gốc, `emergency` tăng hồi khi mục tiêu ≤35% HP |
| `shield` | `flat`, `multiplier` theo MAG gốc |
| `status` | `status`: ID trong statuses, `duration`: lượt của người mang |
| `resource` | `resource`, `amount`; `mp` là tài nguyên đặc biệt được hỗ trợ sẵn |
| `cleanse` | Xóa tất cả status có `kind: "debuff"` |

Damage có thể dùng `perResource` nhân với lượng tài nguyên vừa tiêu, hoặc `consumeStatus` + `perStack` để kích nổ dấu ấn trên từng mục tiêu. `lowHpBonus` tăng hệ số theo phần HP người dùng đã mất. `unavoidable` bỏ qua né.

### Chi phí tài nguyên

Tiêu lượng cố định:

```json
{ "cost": { "resource": { "id": "resonance", "amount": 1 } } }
```

Tiêu toàn bộ, cần ít nhất một điểm:

```json
{ "cost": { "resource": { "id": "resonance", "all": true, "min": 1 } } }
```

Tài nguyên phải được khai báo trong `resources` của nhân vật. Có thể kết hợp MP và tài nguyên trong cùng `cost`.

## Thêm status

```json
{
  "id": "focused",
  "name": "Tập trung",
  "kind": "buff",
  "consumeOnAttack": true,
  "modifiers": { "damageBonus": 0.25 }
}
```

Các modifier đang hỗ trợ: `attack`, `magic`, `defense`, `resistance`, `speed`, `damageBonus`, `damageReduction`, `evasion`. Các modifier chỉ số là tỷ lệ cộng, ví dụ `defense: -0.35` giảm DEF 35%.

Các hành vi đặc biệt hiện có: `regen`, `taunt`, `cover`, `blockResourceGain`, `onDamagedResource`, `maxStacks`, `consumeOnAttack`. Chúng là khả năng engine đã biết xử lý; đặt một key mới vào JSON không tự tạo ra luật mới.

## Nâng cấp Arthur qua cốt truyện

Mẫu đang hoạt động trong `data/upgrades.json`:

```json
{
  "id": "arthur.control_training",
  "characterId": "arthur",
  "name": "Kiểm soát Ogre’s Bane",
  "order": 10,
  "requires": { "storyFlag": "arthur_completed_sword_training" },
  "changes": [
    {
      "type": "replace_ability",
      "from": "arthur.ogres_bane",
      "to": "arthur.ogres_bane_controlled"
    },
    { "type": "unlock_ability", "ability": "arthur.partial_release" }
  ]
}
```

Trong quest/dialogue controller tương lai, gọi:

```js
import { completeStoryEvent } from './src/core/progression.js';

completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
```

Đường dẫn import phụ thuộc vị trí module gọi. Hàm này chỉ nên được gọi từ hệ thống điều khiển tiến trình, sau khi sự kiện thật hoàn thành. Nút ở màn thử đang đóng vai trò đó.

Các thao tác nâng cấp hiện hỗ trợ:

- `unlock_ability`: thêm kỹ năng nếu chưa có.
- `replace_ability`: thay ID kỹ năng cũ bằng ID mới.
- `resource_max`: đổi giới hạn tài nguyên, ví dụ `{ "type": "resource_max", "resource": "resonance", "max": 4 }`.

Nếu một upgrade thay kỹ năng do upgrade trước mở, tác giả phải bảo đảm sự kiện trước đã xảy ra và đặt `order` phù hợp. Hiện chưa có cây dependency nâng cấp tự động. Chưa có operation đổi class, nguyên tố, nội tại hay tăng stat qua upgrade; thêm handler và validation tương ứng nếu cần, không chỉ ghi field mới.

## Thêm cuộc chạm trán

Tạo definition trong `enemies.json`, sau đó tham chiếu ID trong `encounters.json`. Có thể lặp ID địch nhiều lần; engine tạo instance riêng cho mỗi con.

Khai báo điểm yếu có sẵn bằng `weaknesses`, ví dụ:

```json
{ "weaknesses": ["light", "dark"] }
```

Khi nguyên tố đòn đánh trùng một phần tử, mục tiêu nhận thêm 50% sát thương (hệ số `1.5`), áp dụng cả vật lí và ma pháp, kể cả sát thương vào khiên. Hệ số chung là `WEAKNESS_MULTIPLIER` trong `src/core/content.js`. Không có hoặc dùng `[]` nghĩa là không có điểm yếu. Chỉ dùng 8 ID nguyên tố đã hỗ trợ, không lặp. Goblin khai báo cả 8 ID, gồm `plain`, để yếu với tất cả hệ.

`resistances` vẫn có thể đặt trên enemy để nhân thêm hệ số sát thương nhận: `0.7` nhận 70%, mặc định `1`. Nếu cùng một hệ có cả kháng và yếu, hai hệ số nhân nhau, ví dụ `0.7 × 1.5 = 1.05`; không khai báo kháng cũ nếu muốn đúng 150%. Ba loại địch mẫu đã bỏ các hệ số cũ Fire/Thunder/Wind. Không có quan hệ Fire–Water cố định được ngầm áp dụng.

## Kinh tế và banner

- `economy.json` chứa bản ghi `default`: sáu starter, thưởng thắng, giá quay 1/10, mảnh trùng, giá đổi nhân vật và `gearStats`. Giá/thưởng là số nguyên dương; mỗi chỉ số có scale quy đổi điểm.
- `gearTypes.json` định nghĩa `points` và `statCount`; hai chỉ số của gear đa dụng phải khác nhau. Giá trị đã roll được lưu trong instance; thay đổi công thức điểm/scale cần migration gear cũ vì validator kiểm tra giá trị theo định nghĩa hiện tại.
- `banners.json` khai báo pool nhân vật rõ ràng, không trùng ID và không gồm starter; nhân vật trong pool có trọng số bằng nhau. `gearWeight`/`characterWeight` chọn nhánh; `gearRates` chọn tier có điều kiện khi nhánh gear trúng. Trọng số là số nguyên dương, không bắt buộc tổng 100. Nhân vật mới không tự được thêm vào pool.
- Không dùng bản sao nhân vật để tăng chỉ số. Trùng cộng mảnh; chỉ mở nhân vật còn khóa trong pool khi đổi đủ mảnh.
- Mở thêm nhân vật bằng truyện về sau có thể gọi `unlockCharacter(campaign, content, id)`; hàm không cấp trùng quyền sở hữu. Preview không đồng nghĩa đã sở hữu.
- Kiểm tra cả định nghĩa và save khi đổi kinh tế; ID hoặc giá trị gear đã tồn tại cần migration tương ứng.
- Save v3: `campaign.equipment` ánh xạ character ID → mảng gear ID/null giữ vị trí từng ô. `extraGearSlots` ánh xạ character ID → số ô mở thêm (0–3). `baseGearSlots`/`maxGearSlots` trong economy mặc định 3/6. Mỗi dupe mở 1 ô cho chính nhân vật đó đến trần, vẫn cộng mảnh. Dùng `equipGear`/`unequipGear` với `slot` (index 0-based, mặc định 0) và commit sau khi lưu. Một instance không thể xuất hiện ở nhiều ô; chưa có giới hạn nghề/nguyên tố.
- Gear cộng flat trước nội tại và buff %. Nếu thêm loại chỉ số gear mới, cập nhật validator, resolver và bảng so sánh; không thêm modifier vào dữ liệu nhân vật mỗi lần equip. Không sửa trực tiếp actor của trận đang diễn ra.

## Quy trình sửa nội dung

1. Sửa JSON, giữ ID ổn định.
2. Chạy `npm.cmd run validate` để kiểm tra tham chiếu và cấu trúc được hỗ trợ.
3. Nếu thay luật core, chạy `npm.cmd test`, thêm kiểm thử cho hành vi mới.
4. Tải lại trang để đọc dữ liệu mới; bắt đầu trận mới để tạo snapshot mới.
5. Thử kỹ năng với mục tiêu ít HP, hết MP, khiên, đỡ đòn thay và địch nhiều mục tiêu nếu có liên quan.

Validator hiện là kiểm tra bằng code, chưa phải JSON Schema đầy đủ hoặc editor nội dung. Thêm cơ chế mới cần cập nhật đồng thời handler, validator và tài liệu.
