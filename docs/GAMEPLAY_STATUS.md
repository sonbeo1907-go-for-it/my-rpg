# Gameplay trong bản mẫu

Vai trò và nguyên tố giữ theo yêu cầu. Chi tiết kỹ năng dưới đây là triển khai thử nghiệm để phát triển tiếp, không xác định thêm canon của nhân vật.

Save v2 chỉ mở sẵn Arthur, Iris, Takeshi, Elaine, Garrek và Fiona. Các nhân vật khác vẫn có preview, mở qua banner hoặc đổi mảnh. Thắng trận nhận 100 coin, quay 100 coin/lượt hoặc 1.000 coin/10 lượt (90% gear, 10% nhân vật, không bảo hiểm). Gear chỉ được lưu, chưa equip/cộng chỉ số. Migration v1 giữ truyện và cấp bù coin theo chiến thắng cũ, khóa các nhân vật ngoài sáu starter.

| Nhân vật | Nguyên tố / vai trò | Đã hoạt động |
|---|---|---|
| Arthur | Light / DPS vật lí | Cộng hưởng, giải phóng, Kiệt sức, thay kỹ năng và mở kỹ năng qua mốc truyện |
| Iris | Plain / hỗ trợ tấn công | Buff sát thương một lần, tăng ATK/MAG, Dữ liệu và cường hóa toàn đội |
| Takeshi | Wind / DPS vật lí né phản công | Thế né có khiêu khích, phản công giới hạn theo vòng, tích Sơ hở |
| Fiona | Dark / DPS ma pháp | Prisma riêng trên mục tiêu, tối đa 3 mảnh, gieo diện rộng và kích nổ |
| Elaine | Water / hỗ trợ phòng thủ | Khiên cá nhân/toàn đội, kháng phép, hồi ít HP khi khiên bị phá |
| Garrek | Earth / tank | Đỡ đòn thay đơn mục tiêu, tự giảm sát thương, phối hợp bảo vệ và giảm sát thương |
| Dain | Plain / đấu sĩ | Tích Quyết tâm khi gồng chịu đòn, trọng kích xuyên giáp |
| Rowan | Wind / DPS cung | Chuẩn bị Điểm ngắm, bắn xuyên giáp, liên xạ |
| Freya | Fire / DPS ma pháp | Tích Nhiệt, xả sát thương diện rộng, tiêu Nhiệt hồi MP |
| Arden | Earth / hỗ trợ phòng thủ | Hồi phục theo lượt, tăng DEF/RES cá nhân, hồi theo lượt toàn đội |
| Rhett | Thunder / DPS vật lí | Nạp và tiêu Điện tích, đạn đơn mục tiêu và quá tải diện rộng |
| Galliard | Water / tank | Khiêu khích, giảm sát thương và tăng DEF toàn đội |
| Armie | Water / hỗ trợ phòng thủ | Hồi HP tức thời, giải debuff, hồi mạnh hơn cho người nguy cấp |
| Fran | Dark / hỗ trợ phá phòng thủ | Giảm DEF, giảm RES, lời nguyền diện rộng kết hợp được với hai loại trên |
| Aurora | Thunder / hỗ trợ tấn công, Sub DPS | Buff MAG, phép đơn mục tiêu/diện rộng, đánh bồi một lần/vòng để tích Lôi ấn, hồi MP toàn đội đầu lượt khi đủ 2 ấn |
| Lisbeth Ranoc | Light / DPS ma pháp đơn mục tiêu | MAG nền 42, nội tại +20% MAG, tự buff MAG, phép đơn mục tiêu hệ số và chi phí MP cao; 110 HP |

## Lisbeth Ranoc — Di sản khế ước

Quý tộc nhà Ranoc có tổ tiên lập khế ước với quỷ để nhận sức mạnh ma pháp vượt trội. Lisbeth kiêu ngạo, tsundere; lore không đổi nguyên tố Light của cô.

Chỉ số thử nghiệm: 110 HP, 90 MP, ATK 8, MAG cơ bản 42, DEF 10, RES 25, SPD 16. Nội tại **Di sản khế ước** tăng 20% MAG vĩnh viễn, thành 50,4. Menu hiển thị cả giá trị này và MAG gốc 42. Không làm tròn MAG thành số nguyên trước khi tính sát thương.

- **Kiêu hãnh Ranoc:** 12 MP, tự +50% MAG cơ bản trong 3 hành động tiếp theo, hồi 3 vòng. Nội tại và buff cộng tỷ lệ trên cùng nền: `42 × (1 + 0.2 + 0.5) = 71.4 MAG`.
- **Quang thương:** 16 MP, 190% MAG, ma pháp Light đơn mục tiêu.
- **Phán quyết kiêu hãnh:** 28 MP, 280% MAG, ma pháp Light đơn mục tiêu, hồi 2 vòng.

Không có AoE hoặc cơ chế tích stack riêng. Thao tác chính là tự buff rồi chọn phép mạnh theo MP và hồi chiêu. Nội tại không tốn lượt, không phải status có thời hạn và không được áp dụng lặp khi tải save hoặc tạo trận mới. Phép của Lisbeth có thể kích hoạt follow-up của đồng đội như Aurora theo luật chung.

## Aurora — Mạch sấm

Aurora là pháp sư mới tốt nghiệp Magic Academy. Nhóm lọc chính `offensive_support`, nhóm phụ `magical_dps`. Chỉ số và hệ số hiện tại là baseline thử nghiệm:

- Tia sét: 100% MAG Thunder đơn mục tiêu, 5 MP.
- Truyền dẫn ma lực: +25% MAG cho một đồng đội, 2 lượt người nhận, 8 MP.
- Giông sét: 100% MAG Thunder diện rộng, 14 MP, hồi 2 vòng.
- Sét cộng hưởng (nội tại): 80% MAG Thunder, không tốn MP/lượt chủ động, không thể chọn như kỹ năng chủ động.

Khi đồng đội khác gây sát thương phép đơn mục tiêu lên kẻ địch vẫn còn sống, Aurora đánh bồi vào chính người nhận sát thương thực tế và tích 1 Lôi ấn. Đòn của Aurora (gồm phép cơ bản) không tự kích hoạt nội tại và không tiêu lần đánh bồi của vòng. Đây là luật chung cho mọi nhân vật có follow-up, không phải ngoại lệ riêng Aurora. Giới hạn một lần mỗi vòng chung, kể cả kỹ năng có nhiều hit. Đánh vào khiên vẫn tính là gây sát thương; đòn chính kết liễu không tạo đánh bồi hoặc stack. Nếu đòn đánh bồi kết liễu, Aurora vẫn nhận stack. AoE không đủ điều kiện dù chỉ còn một địch. Phản công và các đòn đánh bồi không kích hoạt đánh bồi tiếp theo.

Lôi ấn có giới hạn 2 ở dữ liệu hiện tại. Đầu lượt Aurora, nếu có ít nhất 2, tiêu toàn bộ để hồi 20% MP tối đa của từng đồng đội còn sống, gồm bản thân. Lượng hồi được làm tròn và chặn tại MP tối đa. Đầy MP vẫn tiêu stack; không hồi cho người đã gục. Tiêu stack không đặt lại giới hạn đánh bồi trong vòng đó. Stack và dấu ghi nhận đã đánh bồi thuộc battle state, không lưu vào campaign.

## Những phần cố ý đơn giản hóa

- Iris tích Dữ liệu khi dùng kỹ năng hỗ trợ, chưa nghe sự kiện mọi đồng đội dùng kỹ năng. Chưa có accuracy/critical.
- Takeshi có xác suất né, chưa có chọn thế theo từng loại đòn. Hoàn kiếm dùng được lên bất kỳ địch hợp lệ, chưa khóa vào người bị phản công.
- Garrek có thể duy trì cover trên nhiều người nếu thời hạn còn; chưa giới hạn một liên kết duy nhất, chưa tự cứu đồng đội khỏi đòn chí mạng.
- Elaine hiện chỉ tăng kháng phép, chưa có cơ chế kháng trạng thái riêng.
- Freya chưa có phạt quá nhiệt; giới hạn tài nguyên và MP đang giữ nhịp.
- Arden chưa có inventory dược liệu, chống độc riêng hoặc phối dược.
- Rhett dùng hồi chiêu cho Quá tải, chưa có pha làm nguội khóa toàn bộ thiết bị.
- Galliard chưa có vị trí/hàng trước–sau, đẩy lùi hay giảm sát thương riêng cho multi-hit.
- Fran hiện có kỹ năng giảm thêm phòng thủ, chưa khuếch đại trực tiếp thời hạn/cấp độ lời nguyền cũ.
- Đòn đánh thường, hồi MP và các chỉ số mới chỉ là baseline thử nghiệm. Chưa đánh giá cân bằng dài hạn hoặc powercreep.

Không đưa các khả năng này vào mô tả UI như đã tồn tại. Khi triển khai thêm, bổ sung dữ liệu và handler có kiểm thử tương ứng.
