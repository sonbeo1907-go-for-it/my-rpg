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
3. Chọn cuộc chạm trán và bấm **Bắt đầu trận** để chuyển sang màn **Chiến đấu**. Chọn kỹ năng, mục tiêu, rồi **Thực hiện**. Kẻ địch tự hành động.
4. Với Arthur, dùng Kiếm quang để tích Cộng hưởng rồi dùng Ogre’s Bane. Ở giai đoạn đầu, Kiệt sức chặn tích tài nguyên trong hành động tiếp theo.
5. Bấm **Hoàn thành luyện kiếm** ở phần hành trình và bắt đầu trận mới. Arthur có Giải phóng một phần; Ogre’s Bane được thay bằng phiên bản Kiểm soát.
6. Bấm **Lưu tiến trình**, tải lại trang, hoặc dùng **Tải tiến trình** để kiểm tra save.

Nút luyện kiếm là công cụ thử nghiệm cho một sự kiện cốt truyện, chưa phải nội dung chương chính thức. Thay đội hình hoặc nhận nâng cấp không sửa các nhân vật đang tham gia trận hiện tại.

Ba màn **Chuẩn bị / Chiến đấu / Chiêu mộ** có thanh chuyển màn riêng. Trong trận, dùng **Chuẩn bị đội hình** để xem kỹ năng hoặc chuẩn bị đội khác; bấm **Chiến đấu** để tiếp tục đúng trận đang đánh. Bắt đầu một trận mới khi trận cũ chưa kết thúc sẽ yêu cầu xác nhận bỏ trận. Khi trận kết thúc, nút chuyển màn đổi thành **Kết quả trận** để xem lại nhật ký.

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
- Save v2 có quyền sở hữu nhân vật, coin, mảnh chiêu mộ, gear và tổng lượt quay. Save v1 tự chuyển sang v2, giữ truyện/nâng cấp, khóa nhân vật ngoài sáu nhân vật chính và cấp bù 100 coin mỗi chiến thắng cũ; bản lưu v1 được giữ nguyên.
- Ban đầu chỉ mở Arthur, Iris, Takeshi, Elaine, Garrek, Fiona. Nhân vật khóa vẫn xem được preview, không thể xếp đội/vào trận. Có bộ lọc trạng thái sở hữu.
- Thắng mỗi trận nhận 100 coin đúng một lần, tự lưu; thua/hòa/bỏ trận không thưởng. Lỗi ghi thưởng có nút thử lại.
- Banner **Tiếng gọi Prisma**: 100 coin/lượt, 1.000 coin/10 lượt; 90% gear, 10% nhân vật; không bảo hiểm. Mười nhân vật ngoài đội ban đầu chia đều pool. Trùng nhận 10 mảnh, 100 mảnh chọn một nhân vật còn khóa.
- Gear T1/T2/T3 chuyên biệt/T3 đa dụng: 60/30/8/2% trong nhánh gear. Điểm lần lượt +1/+3/+5 vào một chỉ số, hoặc +2 vào hai chỉ số khác nhau. Mỗi điểm HP = 5 HP, MP = 2 MP, chỉ số khác = 1. Gear có ID riêng, lưu ngay khi quay; chưa equip hoặc cộng chỉ số.
- Kiểm tra tham chiếu dữ liệu và các kiểm thử engine/save/server.

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
    ownership.js         Kiểm tra sở hữu và mở khóa nhân vật
    economy.js           Thưởng trận, gacha, đổi mảnh và kiểm tra dữ liệu kinh tế
    party.js             Kiểm tra đội hình, ô trống và hoán đổi vị trí
    combat-math.js       Hệ số và làm tròn dùng chung với preview
    battle.js            Luật chiến đấu, không phụ thuộc giao diện
    random.js            Random theo seed để tái hiện trận
  ui/
    main.js              Giao diện DOM, localStorage, input người chơi
    roster-menu.js       Menu nhân vật, tìm kiếm, xếp đội và skill preview
    gacha-menu.js         Banner, tỷ lệ, kết quả quay và đổi mảnh
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

Đây là nền hệ thống và màn thử chiến đấu, **chưa phải game có thể chơi trọn chương**. Chưa có bản đồ di chuyển, hội thoại, nhiệm vụ, túi đồ/equip, XP/tăng cấp, âm thanh hay sprite. Gear quay được chỉ được lưu để phát triển tiếp. Trường `level` trong save được dành sẵn; hiện chưa ảnh hưởng chỉ số.

Save không lưu trận đang đánh. Thắng trận, quay và đổi mảnh tự lưu; thay đội/nâng cấp truyện có thể lưu bằng nút **Lưu tiến trình**. Quay chỉ ghi nhận khi lưu thành công; lỗi lưu không mất coin hoặc cấp một phần kết quả. Save nằm trong localStorage, không đồng bộ thiết bị; thay host/cổng sẽ dùng vùng lưu khác. Chưa có Import/Export. Hỗ trợ v1 → v2, từ chối phiên bản chưa biết.

Chỉ số là dữ liệu thử nghiệm. Giao diện hiện là bàn thử vai trò, chưa phải giao diện hình ảnh cuối cùng. Màn thử dùng seed cố định để dễ tái hiện lỗi. Máy chủ chỉ nghe trên localhost và phục vụ cho phát triển.

Đọc tiếp:

- [Kiến trúc và quy tắc engine](docs/ARCHITECTURE.md)
- [Thêm kỹ năng và nâng cấp theo cốt truyện](docs/CONTENT_GUIDE.md)
- [Trạng thái triển khai gameplay của các nhân vật](docs/GAMEPLAY_STATUS.md)
