# Kiến trúc

## Ba lớp độc lập

1. **Content definitions**: JSON trong `data/`, được đọc và kiểm tra khi khởi tạo. Nội dung không bị thay đổi trong quá trình chơi.
2. **Core**: ES Modules thuần JavaScript, chạy được cả trong Node.js lẫn trình duyệt. Không import DOM, localStorage hay HTTP.
3. **Adapters/UI**: `src/ui/main.js` tải JSON qua fetch, chuyển input thành lệnh chiến đấu và hiển thị kết quả. `scripts/load-content.mjs` đọc cùng dữ liệu bằng filesystem cho kiểm thử.

Không có nhánh `if chapter >= ...` trong công thức chiến đấu. Battle nhận định nghĩa nhân vật đã được resolve từ tiến trình.

## Danh tính và trạng thái

- `character.id`: ID nội dung ổn định, ví dụ `arthur`.
- `campaign.characters.arthur`: cấp độ và danh sách `upgradeIds` đã nhận.
- `battle.actors`: bản sao độc lập gồm chỉ số hiệu lực, HP, MP, khiên, buff, cooldown và tài nguyên.
- `definitionId`: ID dữ liệu gốc. Kẻ địch có thể cùng một definition nhưng mang instance ID riêng như `enemy_0`.

Khi bắt đầu trận:

```text
Character definition + earned upgrades
                 ↓ resolveCharacter
       Effective character definition
                 ↓ createBattle
       Battle actor with fresh HP / MP
```

Story flags ghi lại sự kiện; upgrade IDs ghi lại kết quả phát triển. `completeStoryEvent` không thêm cờ trùng và `grantEligibleUpgrades` không trao nâng cấp lặp. Các nâng cấp được áp dụng theo `order`, rồi ID để có kết quả xác định.

## Menu nhân vật và skill preview

UI có bốn screen ngang hàng trong `main`: `preparation-screen`, `inventory-screen`, `battle-screen`, `gacha-screen`. `showScreen` chỉ ẩn/hiện, cập nhật tab/focus; không reset campaign hoặc trận. Trang Chuẩn bị chứa roster/preview/truyện/save. Nút túi đồ trong preview gọi callback điều hướng sang trang Túi đồ, dùng cùng character ID; nút đổi nhân vật trở lại roster. Chọn trận nằm trong `battle-screen`, luôn truy cập được khi chưa có trận. `battle-session` chỉ hiện sau khi bắt đầu. Tab trận giữ tên cố định, kết quả nằm trong nội dung trang.

`src/ui/roster-menu.js` quản lý vị trí đang chọn, nhân vật đang xem, tìm kiếm, bộ lọc và giả định hệ số. Đây là state giao diện, không phải campaign state. Chọn thẻ chỉ đổi preview; bấm xác nhận mới gọi hàm thuần trong `src/core/party.js` để thay thế hoặc hoán đổi. Nhân vật mới được đọc từ `content.characters`, không cần thêm option thủ công. `roleGroup` là ID ổn định dùng lọc, tách khỏi tên vai trò hiển thị.

Party cho phép 1–4 phần tử, mỗi phần tử là ID hoặc `null` cho ô trống. Không được toàn bộ trống hoặc trùng ID. Save v1/v2 cũ vẫn chuyển đổi được; save v3 giữ vị trí trống bằng `null`. Engine chỉ tạo battle actor cho những vị trí có người, theo thứ tự đội hình, và từ chối nhân vật chưa sở hữu.

Skill preview lấy definition đã resolve nâng cấp, duyệt effects và statuses để sinh hệ số. `src/core/combat-math.js` cung cấp `damageMultiplier` và `supportAmount` cho cả engine lẫn preview, đặc biệt giữ đúng thứ tự làm tròn Cấp cứu: 70 HP thường → 112 HP khi nguy cấp. Các thanh giả định chỉ tác động vào cách xem, không thay tài nguyên, HP hay số mảnh thực tế.

Gear được cộng vào bản clone chỉ số trước khi resolve nội tại. Nội tại `stat_boost` được resolve thành chỉ số chuẩn bị trong `stats`, đồng thời giữ `baseStats` (nền đã gồm gear) để tránh cộng hai lần. `effectiveStat` tính chỉ số trong trận bằng `(gốc + gear) × (1 + permanent modifier + temporary modifiers)`, có cùng mức sàn như trước. Ví dụ Lisbeth: 42 MAG gốc, gear +5 → nền 47; nội tại +20% → 56,4; thêm +50% tự buff → 79,9. Các snapshot và `gearBonuses` không được đưa vào campaign save.

Preview sát thương chỉ hiển thị hệ số trước DEF/RES, nguyên tố và buff trong trận. Hồi/khiên dùng MAG trong definition chuẩn bị; regen theo phần trăm HP tối đa ghi rõ chỉ số thuộc người nhận. Duration status luôn ghi theo lượt người nhận, cooldown theo vòng chung.

## Luồng chiến đấu

- Đầu vòng: giảm cooldown, sắp thứ tự nhân vật sống theo Speed.
- Đầu lượt: áp dụng hồi HP theo lượt.
- Nhận command `{ actorId, abilityId, targetId }`.
- Kiểm tra đúng lượt, sở hữu kỹ năng, chi phí, cooldown và mục tiêu trước khi trừ tài nguyên.
- Chốt nhóm mục tiêu, trả chi phí, áp dụng lần lượt các effect.
- Kết lượt: hiệu ứng đã có trước hành động giảm thời hạn; buff một lần bị tiêu nếu hành động có damage.
- Bỏ qua người đã gục, kiểm tra thắng/thua, chuyển lượt.
- Trận có giới hạn 60 vòng để tránh bế tắc.

UI gọi `executeEnemyTurn` cho tới khi tới lượt người chơi, phát hiệu ứng của từng hành động trước khi xử lý hành động kế tiếp. Core không có timer; thời gian hiển thị được xử lý riêng trong `src/ui/battle-feedback.js`.

`battle.events` mô tả kết quả của hành động vừa thực hiện, gồm cả phản công và hồi phục đầu lượt kế tiếp: `damage`, `heal`, `mp_restore`, `shield`, `dodge`. Mỗi event chứa `targetId`, `sourceId` và lượng tác động nếu có; damage tách `amount` (HP mất) với `absorbed` (khiên chặn). UI không phân tích log tiếng Việt hoặc chỉ so sánh HP đầu/cuối: một đòn làm vỡ khiên có thể gây damage rồi hồi HP ngay sau đó. Danh sách này được thay mới sau khi command hợp lệ, không lưu vào campaign save. Hồi MP phát hiệu ứng tím riêng với hồi HP xanh lá.

Khung nhân vật nhận trạng thái khiên từ `actor.shield`; màu viền độc lập với viền vàng chỉ lượt. AoE chớp cùng lúc trên các khung khác nhau, nhiều hit trên cùng khung và damage rồi heal phát theo thứ tự. Các nút hành động/chuyển màn tạm khóa trong chuỗi hiệu ứng để tránh gửi lặp command. Người dùng bật giảm chuyển động sẽ thấy chớp ngắn hơn và không rung khung.

### Quy ước thời hạn

`duration` tính bằng lượt hành động của người mang hiệu ứng. Hiệu ứng mới đặt trong chính hành động đó không bị trừ ngay. Ví dụ tự dùng Phòng thủ với duration 1 tồn tại cho tới cuối hành động tiếp theo của bản thân. Buff đặt lên đồng đội trước lượt họ bắt đầu sẽ tính lượt sắp tới là lượt đầu tiên.

Cooldown tính bằng vòng chung. Kỹ năng cooldown 2 bị khóa ở 2 vòng kế tiếp và sẵn sàng ở vòng sau đó. Cơ chế này không phải số lượt riêng của nhân vật.

### Công thức sát thương bản đầu

```text
power   = ATK hoặc MAG sau modifier
defense = DEF hoặc RES sau modifier và xuyên giáp
base    = max(1, power × hệ số kỹ năng − defense × 0.55)
weakness = 1.5 nếu nguyên tố đòn đánh nằm trong weaknesses của mục tiêu, nếu không là 1
damage  = floor(base × kháng nguyên tố × weakness × buff sát thương × (1 − giảm sát thương))
```

Giảm sát thương cộng dồn bị chặn ở 75%. Modifier chỉ số có mức sàn 10% chỉ số gốc. Tính yếu nguyên tố trước khi làm tròn xuống và trước khi khiên hấp thụ, sau đó trừ HP. Không có bảng tương khắc nguyên tố mặc định; `weaknesses` là danh sách điểm yếu có sẵn của mỗi loại địch, không phải debuff. Thiếu danh sách hoặc danh sách rỗng nghĩa là không có điểm yếu. Plain cũng là một thuộc tính có thể bị yếu và không tự xuyên giáp. `resistances` vẫn được hỗ trợ độc lập, mặc định 1; ba loại địch mẫu hiện không dùng hệ số cũ để tránh xung đột với điểm yếu đã cập nhật. Bản đầu chưa có chí mạng, độ chính xác tổng quát hoặc thanh phá thế.

Damage event có `element` và `weakness` để giao diện hoặc hệ thống tương lai nhận biết đúng nguyên tố mà không phân tích log. Điểm yếu không khuếch đại hồi máu hoặc lượng khiên được tạo. Đòn diện rộng, nhiều hit và phản công đều dùng cùng đường tính damage.

### Quy tắc bảo vệ và phản ứng

- Đỡ đòn thay chỉ áp dụng cho đòn đơn mục tiêu và cần người bảo vệ còn sống. Không chuyển tiếp qua chuỗi cover.
- Né chỉ áp dụng cho damage vật lí cho phép né. Trần né 85%.
- Takeshi phản công tối đa một lần/vòng; phản công không kích hoạt phản công tiếp.
- Khiên lấy giá trị lớn hơn giữa khiên cũ/mới, không cộng dồn. Giữ thông tin người tạo khiên cho nội tại Elaine.
- Buff/debuff cùng ID làm mới thời hạn, không cộng modifier; riêng Prisma cộng stack tới giới hạn.
- Luật bắt buộc cho mọi follow-up: nguồn kích hoạt phải là **đồng đội khác** với chủ nội tại. `src/core/follow-up.js` cung cấp `canTriggerFollowUp(owner, source, target)` để kiểm tra ID, phe và người còn sống. Mọi handler follow-up mới phải dùng luật này; dữ liệu nhân vật không được bật ngoại lệ tự đánh bồi từ đòn bản thân. Phản công khi bị địch đánh/né (Takeshi) là cơ chế phản ứng khác.
- Nội tại `magic_followup_mp` kiểm tra luật chung trên rồi đánh bồi sau sát thương phép đơn mục tiêu. Mỗi chủ nội tại có `followUpRound` riêng, đặt trước khi đánh bồi. Đòn của bản thân không dùng mất hạn mức này. Đòn phản ứng dùng `reaction: true` nên không kích hoạt các đợt đánh bồi khác. Các trường hợp AoE, địch đã gục hoặc chủ nội tại đã gục không kích hoạt.
- Đầu lượt, nội tại trên kiểm tra ngưỡng tài nguyên rồi tiêu toàn bộ và phục hồi MP theo `maxMp` của từng đồng đội còn sống. Giới hạn đánh bồi theo vòng độc lập với số stack đang giữ.
- Effect trong kỹ năng là các bước độc lập. Hiện chưa có cú pháp “chỉ áp dụng debuff nếu hit trước trúng”; thêm loại điều kiện rõ ràng nếu cần cơ chế đó.

## Save và thay đổi dữ liệu

Save version 3 không chứa bản sao toàn bộ definition. Khi tải, resolve lại từ nội dung hiện tại, giữ upgrade ID đã nhận. Vì vậy sửa số cân bằng sẽ có hiệu lực ở trận mới.

- Thêm nhân vật mới: save cũ được thêm state mặc định khi tải, nhưng không tự mở khóa. Quyền sở hữu nằm trong `unlockedCharacterIds`, tách khỏi `characters` dùng cho tiến trình/preview.
- Thêm upgrade: các cờ đủ điều kiện được đối chiếu lại khi tải.
- Đổi tên hiển thị: giữ ID, không ảnh hưởng tham chiếu.
- Xóa/đổi ID đang có trong save: cần migration; không tự bỏ qua để tránh mất tiến trình âm thầm.
- Thay schema: tăng `SAVE_VERSION`, viết chuyển đổi từng phiên bản trước bước kiểm tra dữ liệu.

Không có cloud save hoặc tính chống gian lận. Lưu trữ trình duyệt là adapter của bản mẫu, có thể thay bằng file/backend mà không đổi core.

`src/core/save-file.js` đóng gói Export/Import JSON trên cùng serializer/validator. Export chuẩn hóa campaign rồi tạo JSON dễ đọc, tên file có version và timestamp UTC; không chứa battle hoặc state UI. Import nhận JSON thuần, chấp nhận BOM UTF-8, giới hạn 10 MB theo byte UTF-8, hỗ trợ migration v1/v2 → v3, kể cả v2 cũ chưa có equipment.

UI đọc file và validate trước khi hiện tóm tắt xác nhận thay thế. Trong lúc đọc, khóa hành động/điều hướng và đặt các màn chuẩn bị/túi đồ/gacha ở trạng thái inert để không thay tiến trình giữa giao dịch. Sau xác nhận, ghi localStorage trước rồi mới thay campaign, đóng trận và xóa kết quả gacha tạm. Không merge coin/đồ/quyền sở hữu. Hủy chọn, hủy xác nhận, lỗi đọc/JSON/schema/tham chiếu hoặc lỗi lưu không đổi tiến trình/trận hiện có. File export dùng Blob/object URL, thu hồi URL sau khi kích hoạt tải.

## Sở hữu và kinh tế v3

`campaign.unlockedCharacterIds` là quyền sở hữu, độc lập với state tiến trình `characters`. Ban đầu chỉ có sáu nhân vật được khai báo trong `economy.default.starterCharacters`. UI vẫn resolve nhân vật khóa để xem preview. Xếp đội truyền campaign vào `assignPartySlot`; `createBattle` và bộ tải save đều kiểm tra quyền sở hữu.

Save v3 lưu `coins`, `recruitmentShards`, `gear`, `equipment`, `extraGearSlots` và `gacha.totalPulls`. Gear là instance `{id,typeId,stats}`; `gear_N` dùng số thứ tự lượt quay để giữ ID riêng qua save/load. `equipment` ánh xạ character ID → mảng gear ID/null giữ vị trí; `extraGearSlots` lưu số ô mở thêm (0–3) theo người. Số ô mặc định/tối đa lấy từ economy (3/6). Kiểm tra giá trị gear, ID duy nhất, giới hạn ô và quyền sở hữu. Migration v2 đưa gear đơn vào ô đầu tiên, thiếu equipment đọc thành `{}`; không đoán dupe cũ từ mảnh chung.

Migration v1 giữ story/upgrades/victories, chỉ mở starter, đổi vị trí nhân vật khóa thành null; nếu không còn ai thì dùng đội mặc định. Cấp bù `victories × victoryCoins` một lần. UI ưu tiên key `northern-prisma.campaign.v3`, rồi v2, rồi v1 khi chưa có bản mới hơn; ghi v3 sau migration và giữ các bản cũ. Không tự fallback khi bản mới hơn tồn tại nhưng bị lỗi.

`claimBattleReward` tạo campaign mới, gọi adapter persist trước rồi đánh dấu `battle.rewardClaimed`. Gọi lại trên cùng trận không cấp thêm thưởng. Lỗi persist giữ claim chưa nhận để thử lại; UI chặn bắt đầu trận mới khi còn thưởng chờ ghi.

`pullGacha` là giao dịch thuần trả `{campaign,results}`, không sửa đối tượng đầu vào. Kiểm tra giá một/mười lượt trước RNG. Mỗi lượt chọn nhánh, sau đó chọn đều nhân vật hoặc chọn tier gear theo trọng số. Các chỉ số gear được chọn đều không hoàn lại trong món đó. Trùng chuyển thành mảnh ngay trong cùng batch. Không có pity hoặc bảo đảm mười lượt. `recruitCharacter` dùng mảnh mở một người còn khóa trong banner.

Gacha dùng `Math.random` riêng; không dùng seed cố định của trận thử. Các hàm nhận RNG qua tham số để kiểm thử biên tỷ lệ. UI lưu toàn bộ kết quả trước khi thay campaign và hiển thị: lỗi ghi không tiêu coin hoặc cấp thưởng một phần. Kết quả lượt gần nhất là state giao diện, còn đồ/nhân vật/mảnh/tổng lượt là state bền vững.

## Trang bị và túi đồ

`src/core/equipment.js` có các lệnh thuần `equipGear`/`unequipGear` nhận slot index (mặc định 0), truy vấn `gearLocation`/`gearOwner`/`equippedGear`. Mỗi người có 3 ô mặc định, mỗi dupe mở thêm 1 ô cho chính người đó, đến 6; vẫn nhận mảnh sau khi đủ ô. Thay gear trả món cũ về túi; chuyển giữa ô hoặc người để trống ô nguồn. Không xóa/reroll/sao chép instance. Kiểm tra khi tải save, bắt đầu trận và trước đổi trang bị; cấm ô khóa, gear thiếu và gear lặp trong hoặc giữa các nhân vật.

`resolveCharacter` cộng tổng flat stats của mọi món đang mặc lên definition clone, sau nâng cấp truyện và trước nội tại %. HP/MP tăng trực tiếp các maximum; battle khởi tạo ở maximum mới. MAG tác động damage/hồi/khiên, MP tối đa ảnh hưởng Aurora, SPD ảnh hưởng thứ tự vòng. Không tính phần trăm lên phần trăm đã resolve. Save chỉ giữ ID gear và map equipment, không giữ chỉ số đã tính.

`src/ui/inventory-menu.js` bám theo nhân vật đang xem trong roster, kể cả khi không nằm trong đội. Bộ lọc và gear đang chọn là state UI. Chọn món chỉ so sánh đủ bảy chỉ số sau nội tại, không sửa campaign. Xác nhận equip/tháo/chuyển gọi cùng adapter commit của gacha: ghi save trước khi thay state, lỗi lưu giữ nguyên trang bị. Nhân vật khóa không có thao tác equip. Trận đang chơi là snapshot độc lập, chỉ trận mới dùng đồ mới.

## Hướng phát triển tiếp

1. Thêm campaign scene/quest layer để phát story event từ hội thoại hoặc nhiệm vụ thật.
2. Bổ sung nâng cấp/bán/tháo rã gear nếu vòng lặp kinh tế cần; loại ô hoặc giới hạn theo nghề cần schema và quy tắc rõ ràng.
3. Thêm XP/growth có dữ liệu và quy tắc tăng cấp rõ ràng.
4. Khi cần replay từng thay đổi HP hoặc animation phức tạp, bổ sung snapshot/event đầy đủ hơn trên nền presentation events hiện có.
5. Nếu effect handlers tăng nhiều, tách thành registry/module theo effect; tránh biến JSON thành nơi thực thi JavaScript tùy ý.
