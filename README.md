# Northern Prisma — RPG foundation

Khung dự án RPG theo lượt, data-driven, chạy trên trình duyệt. **Northern Prisma là tên làm việc**, có thể đổi sau.

Mục tiêu đầu tiên: tách nội dung, tiến trình cốt truyện và bộ xử lý chiến đấu để Arthur có thể phát triển qua các chương mà không tạo một nhân vật mới hoặc viết điều kiện chương vào từng kỹ năng.

## Chạy thử

Yêu cầu Node.js 22 trở lên. Dự án không dùng dependency bên ngoài, không cần `npm install`.

```powershell
cd E:\MyRPG
npm.cmd start
```

Mở **http://127.0.0.1:3000** trong trình duyệt. Dùng `Ctrl+C` ở terminal để dừng máy chủ. Nếu cổng đang được dùng:

```powershell
$env:PORT = '3001'
npm.cmd start
```

Không mở trực tiếp `public/index.html` bằng `file://`, vì game cần tải dữ liệu JSON và ES Modules qua HTTP.

## Thử tính năng chính

1. Ở màn **Chuẩn bị**, chọn một trong 4 ô đội hình phía trên. Đội mặc định: Arthur, Iris, Elaine, Garrek.
2. Tìm hoặc lọc nhân vật theo nguyên tố/vai trò trong **Danh sách nhân vật**. Bấm thẻ để xem hồ sơ và kỹ năng bên phải, rồi **Đưa vào vị trí…** để xác nhận. Chọn người đã có trong đội sẽ cho phép hoán đổi vị trí; **Gỡ … khỏi đội** giữ lại ô trống. Luôn cần ít nhất một đồng đội. Xem trước không tự thay đội, không xóa bộ lọc và không giới hạn vào những người đang ở trong đội.
3. Mở trang **03 / Chọn trận & Chiến đấu**, chọn cuộc chạm trán rồi bấm **Bắt đầu trận**. Trang này mở được ngay cả khi chưa có trận. Chọn kỹ năng, mục tiêu, rồi **Thực hiện**; kẻ địch tự hành động.
4. Với Arthur, dùng Kiếm quang để tích Cộng hưởng rồi dùng Ogre’s Bane. Ở giai đoạn đầu, Kiệt sức chặn tích tài nguyên trong hành động tiếp theo.
5. Bấm **Hoàn thành luyện kiếm** ở phần hành trình và bắt đầu trận mới. Arthur có Giải phóng một phần; Ogre’s Bane được thay bằng phiên bản Kiểm soát.
6. Mở trang **02 / Túi đồ** từ thanh điều hướng hoặc nút **Mở túi đồ** trong hồ sơ nhân vật. Túi đồ giữ nhân vật đang xem; nút **Chọn nhân vật khác** trở về Chuẩn bị. Chọn ô, lọc/chọn gear để so sánh rồi equip/chuyển/tháo. Mỗi người có 3 ô mặc định, dupe mở thêm 1 ô cho chính người đó, tối đa 6. Các thao tác tự lưu và áp dụng từ trận tiếp theo.
7. Bấm **Lưu tiến trình**, tải lại trang, hoặc dùng **Tải tiến trình** để kiểm tra save. **Export · Xuất save** tải file JSON chứa tiến trình hiện tại; **Import · Nhập save** chọn file, xem tóm tắt và xác nhận thay thế. Không cộng dồn coin/đồ và không khôi phục trận đang đánh.

Nút luyện kiếm là công cụ thử nghiệm cho một sự kiện cốt truyện, chưa phải nội dung chương chính thức. Thay đội hình hoặc nhận nâng cấp không sửa các nhân vật đang tham gia trận hiện tại.

Bốn trang độc lập theo thứ tự **Chuẩn bị đội hình / Túi đồ / Chọn trận & Chiến đấu / Chiêu mộ**. Chuẩn bị giữ roster, skill preview, mốc truyện và lưu/import/export. Túi đồ có bộ lọc, so sánh và thao tác gear. Trang 3 chứa chọn trận, trận hiện tại và nhật ký; trang 4 chứa banner. Đổi trang giữ nhân vật đang xem, bộ lọc, ô gear và trận hiện tại. Bắt đầu trận mới khi trận cũ chưa kết thúc sẽ yêu cầu xác nhận bỏ trận. Kết quả vẫn xem trong trang 3, tên tab luôn cố định.

Skill preview hiện hệ số ATK/MAG, giá trị khiên/hồi HP theo chỉ số hiện tại, phần trăm buff/debuff và thời hạn theo lượt người nhận. Ví dụ Thủy thuẫn của Elaine: **180% MAG → 54 khiên**. Kỹ năng dùng số Cộng hưởng, Nhiệt hoặc mảnh Prisma biến thiên có thanh chỉnh giả định để xem hệ số; thanh này không cấp tài nguyên trong trận. Preview dùng đúng kỹ năng đã mở theo tiến trình. Sát thương chỉ hiện hệ số, chưa ước tính lên một mục tiêu cụ thể. Trên màn hình nhỏ, chọn thẻ sẽ đưa tới phần chi tiết và có nút trở lại danh sách.

## Đã triển khai

- 8 nguyên tố: Plain, Fire, Water, Earth, Wind, Thunder, Light, Dark.
- 16 nhân vật, mỗi người có 3 kỹ năng chủ động ban đầu, thêm 2 định nghĩa kỹ năng cho nâng cấp Arthur và kỹ năng đánh bồi nội tại của Aurora.
- Aurora (Thunder, Magic Academy) hỗ trợ tấn công/Sub DPS: mỗi vòng đánh bồi sau phép đơn mục tiêu của đồng đội khác một lần để tích Lôi ấn; đầu lượt có ít nhất 2 ấn sẽ tiêu hết, hồi 20% MP tối đa cho từng đồng đội còn sống, gồm bản thân. Menu có preview nội tại và hệ số đánh bồi, nhật ký và hiệu ứng hồi MP riêng.
- Luật follow-up chung cho mọi nhân vật hiện tại và về sau: chỉ kích hoạt từ đòn của đồng đội khác, không từ đòn của bản thân. Kiểm tra nguồn kích hoạt dùng chung trong `src/core/follow-up.js`.
- Lisbeth Ranoc (Light) là DPS phép đơn mục tiêu: 110 HP, 90 MP, MAG nền 42; nội tại +20% nâng MAG chuẩn bị lên 50,4. Tự buff +50% MAG nền rồi dùng phép 190%/280% MAG, tiêu 16/28 MP. Hồ sơ giữ xuất thân Ranoc, khế ước của tổ tiên và tính cách kiêu ngạo, tsundere.
- Menu nhân vật dạng lưới, tìm kiếm không phân biệt dấu tiếng Việt, lọc nguyên tố/vai trò, xem trước rồi xác nhận xếp đội. Biểu tượng chữ cái tạm thay cho chân dung.
- Chiến đấu theo lượt, thứ tự theo Speed, MP, cooldown, tài nguyên riêng, đánh thường và phòng thủ.
- Sát thương vật lí/ma pháp độc lập với nguyên tố; hệ số kháng đặt trên từng loại địch.
- Điểm yếu có sẵn trong dữ liệu địch: đúng nguyên tố nhận thêm 50% sát thương, áp dụng cả vật lí lẫn ma pháp trước khi trừ khiên. Goblin yếu cả 8 hệ (kể cả Plain); Elder Frog yếu Fire; thuộc hạ Ogre King yếu Light/Dark. Điểm yếu hiện trên khung địch và nhật ký khi đánh trúng hệ.
- Khiên không cộng dồn; đỡ đòn thay; né vật lí và phản công có giới hạn; buff/debuff; hồi HP theo lượt; giải hiệu ứng; mảnh Prisma trên từng mục tiêu.
- Phản hồi chiến đấu: khung trúng đòn rung nhẹ/chớp đỏ, hồi HP chớp xanh lá, còn khiên có viền xanh dương. Hành động địch hiển thị lần lượt; đòn diện rộng chớp đồng thời trên các mục tiêu. Hỗ trợ tùy chọn giảm chuyển động của hệ điều hành.
- 2 cuộc chạm trán, 3 loại địch và AI cơ bản.
- Nâng cấp theo story flag, áp dụng một lần, không sửa dữ liệu nền.
- Save v3 có quyền sở hữu, coin, mảnh, gear, vị trí từng món, ô mở thêm và tổng lượt quay. v1/v2 tự chuyển sang v3, giữ bản cũ; gear v2 đang mặc vào ô đầu tiên, mỗi người có 3 ô mặc định. v1 giữ truyện/nâng cấp, khóa nhân vật ngoài sáu nhân vật chính và cấp bù 100 coin/chiến thắng cũ. Không suy đoán dupe cũ vì không có lịch sử theo nhân vật.
- Ban đầu chỉ mở Arthur, Iris, Takeshi, Elaine, Garrek, Fiona. Nhân vật khóa vẫn xem được preview, không thể xếp đội/vào trận. Có bộ lọc trạng thái sở hữu.
- Thắng mỗi trận nhận 100 coin đúng một lần, tự lưu; thua/hòa/bỏ trận không thưởng. Lỗi ghi thưởng có nút thử lại.
- Banner **Tiếng gọi Prisma**: 100 coin/lượt, 1.000 coin/10 lượt; 90% gear, 10% nhân vật; không bảo hiểm. Mười nhân vật ngoài đội ban đầu chia đều pool. Trùng nhận 10 mảnh, 100 mảnh chọn một nhân vật còn khóa.
- Gear T1/T2/T3 chuyên biệt/T3 đa dụng: 60/30/8/2% trong nhánh gear. Điểm lần lượt +1/+3/+5 vào một chỉ số, hoặc +2 vào hai chỉ số khác nhau. Mỗi điểm HP = 5 HP, MP = 2 MP, chỉ số khác = 1. Gear có ID riêng, lưu ngay khi quay.
- Túi đồ ở trang riêng, gắn với nhân vật đang xem; 3–6 ô gear mỗi người. Dupe thứ 1/2/3 mở ô 4/5/6, vẫn nhận 10 mảnh mỗi dupe kể cả khi đủ 6 ô. Chọn ô, lọc gear, so sánh đủ bảy chỉ số, equip/tháo/chuyển giữa ô hoặc giữa người. Một instance chỉ xuất hiện ở một ô; thay gear không mất món cũ. Tự lưu trước khi ghi nhận thay đổi; lỗi lưu giữ nguyên trang bị và ô mở thêm.
- Chỉ số gear cộng trước nội tại và buff theo phần trăm. Lisbeth có gear +5 MAG: `(42 + 5) × 1,2 = 56,4 MAG`; tự buff +50% thành `47 × 1,7 = 79,9 MAG`. Preview hồi/khiên, HP/MP tối đa, thứ tự lượt và MP hồi của Aurora đều dùng chỉ số đã equip. Trận đang diễn ra giữ snapshot cũ.
- Kiểm tra tham chiếu dữ liệu và các kiểm thử engine/save/server.
- Import/Export JSON (tối đa 10 MB, UTF-8, đọc được BOM): kiểm tra schema/tham chiếu trước xác nhận và ghi save. Import hỗ trợ v1/v2 → v3; file lỗi, hủy nhập hoặc lỗi ghi localStorage giữ nguyên tiến trình và trận hiện tại. Export giữ coin, mảnh, quyền sở hữu, gear ở từng ô, ô đã mở, đội hình và truyện, không chứa trạng thái trận/UI.

## Cấu trúc

```text
data/
  characters.json        Nhân vật nền, chỉ số, tài nguyên, kỹ năng
  abilities.json         Chi phí, mục tiêu, chuỗi hiệu ứng
  statuses.json          Buff/debuff và quy tắc hiệu ứng
  upgrades.json          Nâng cấp gắn với mốc truyện
  enemies.json           Địch, kháng và điểm yếu nguyên tố
  encounters.json        Thành phần cuộc chạm trán
  economy.json           Nhân vật ban đầu, thưởng, giá quay và quy đổi chỉ số
  banners.json           Pool nhân vật, tỷ lệ nhánh và tier gear
  gearTypes.json         Số chỉ số và điểm theo loại gear
src/
  core/
    content.js           Nạp, lập chỉ mục và kiểm tra nội dung
    progression.js       Tiến trình, nâng cấp, save/load
    save-file.js         Chuẩn bị file xuất, kiểm tra file nhập và giới hạn dung lượng
    ownership.js         Kiểm tra sở hữu và mở khóa nhân vật
    economy.js           Thưởng trận, gacha, đổi mảnh và kiểm tra dữ liệu kinh tế
    equipment.js         Gear theo ô, equip/tháo/chuyển và kiểm tra sở hữu
    gear-slots.js        Số ô mặc định/tối đa và mở ô bằng dupe
    party.js             Kiểm tra đội hình, ô trống và hoán đổi vị trí
    combat-math.js       Hệ số và làm tròn dùng chung với preview
    battle.js            Luật chiến đấu, không phụ thuộc giao diện
    random.js            Random theo seed để tái hiện trận
  ui/
    main.js              Giao diện DOM, localStorage, input người chơi
    roster-menu.js       Menu nhân vật, tìm kiếm, xếp đội và skill preview
    gacha-menu.js         Banner, tỷ lệ, kết quả quay và đổi mảnh
    inventory-menu.js     Túi đồ, bộ lọc và so sánh trang bị
    skill-presentation.js Mô tả, chi phí, hệ số kỹ năng từ dữ liệu
    battle-feedback.js   Hiệu ứng trúng đòn, hồi HP và khiên
public/                  HTML và CSS
scripts/                 Máy chủ phát triển, kiểm tra dữ liệu
test/                    Kiểm thử tự động bằng Node.js
docs/                    Kiến trúc, cách thêm nội dung và giới hạn bản mẫu
```

## Kiểm tra

```powershell
npm.cmd run validate
npm.cmd test
```

Kiểm thử bao gồm nâng cấp không lặp, save lỗi, tham chiếu sai, hành động không hợp lệ không mất tài nguyên, né/phản công, đỡ đòn thay, khiên, buff, Prisma, cooldown, điểm yếu, xếp đội, preview hệ số, nội tại Aurora và trận headless cho toàn bộ roster.

## Phạm vi bản đầu

Đây là nền hệ thống và màn thử chiến đấu, **chưa phải game có thể chơi trọn chương**. Chưa có bản đồ di chuyển, hội thoại, nhiệm vụ, XP/tăng cấp, âm thanh hay sprite. Gear chưa có nâng cấp, bán hoặc tháo rã. Trường `level` trong save được dành sẵn; hiện chưa ảnh hưởng chỉ số.

Save không lưu trận đang đánh. Thắng trận, quay, đổi mảnh và đổi trang bị tự lưu; thay đội/nâng cấp truyện có thể lưu bằng nút **Lưu tiến trình**. Quay chỉ ghi nhận khi lưu thành công; lỗi lưu không mất coin hoặc cấp một phần kết quả. Save nằm trong localStorage, không tự đồng bộ thiết bị; có thể chuyển bằng Export/Import JSON. Thay host/cổng sẽ dùng vùng lưu khác. Hỗ trợ v1/v2 → v3, từ chối phiên bản chưa biết. v2 chưa có equipment nhận ô trống; v2 đã equip giữ món ở ô đầu tiên. Các ô dupe mở thêm được ghi trong v3, không suy đoán lại từ số mảnh chung.

Chỉ số là dữ liệu thử nghiệm. Giao diện hiện là bàn thử vai trò, chưa phải giao diện hình ảnh cuối cùng. Màn thử dùng seed cố định để dễ tái hiện lỗi. Máy chủ chỉ nghe trên localhost và phục vụ cho phát triển.

Đọc tiếp:

- [Kiến trúc và quy tắc engine](docs/ARCHITECTURE.md)
- [Thêm kỹ năng và nâng cấp theo cốt truyện](docs/CONTENT_GUIDE.md)
- [Trạng thái triển khai gameplay của các nhân vật](docs/GAMEPLAY_STATUS.md)
