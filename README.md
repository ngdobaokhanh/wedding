# Hệ thống quản lý khách mời đám cưới

Ứng dụng web đầy đủ: backend Node.js/Express lưu dữ liệu thật trên server (không mất khi tải lại trang, không phụ thuộc vào Claude), có trang quản trị cho cô dâu chú rể và trang RSVP riêng cho từng khách (mở qua mã QR).

## 1. Cài đặt và chạy thử trên máy

Yêu cầu: đã cài [Node.js](https://nodejs.org) bản 18 trở lên.

```bash
cd wedding-guest-system
npm install
cp .env.example .env
```

Mở file `.env` vừa tạo, đổi `ADMIN_PASSWORD` thành một mật khẩu riêng của bạn (đây là mật khẩu để vào trang quản trị).

Chạy server:

```bash
npm start
```

Mở trình duyệt:
- Trang quản trị: `http://localhost:3000/index.html`
- Trang khách (thử nghiệm, cần một mã khách có thật, ví dụ sau khi bạn đã thêm khách): `http://localhost:3000/rsvp.html?guest=KM-0001`

Đăng nhập trang quản trị bằng mật khẩu đã đặt trong `.env`.

## 2. Dữ liệu được lưu ở đâu

Toàn bộ dữ liệu (khách mời, bàn tiệc, thông tin lễ cưới) được lưu trong file `data/db.json` ngay trên server — dữ liệu thật, không mất khi tải lại trang hay khởi động lại server. Ảnh cô dâu chú rể được lưu trong thư mục `uploads/`.

Nếu sau này số khách rất lớn (hàng nghìn) hoặc cần nhiều người cùng sửa liên tục, có thể nâng cấp `data/db.json` thành một database SQL thật (Postgres/MySQL) — kiến trúc đã tách riêng phần lưu trữ trong `server/db.js` nên việc thay thế không ảnh hưởng tới phần còn lại.

## 3. Đưa lên host thật (để khách quét QR từ mọi nơi)

Chọn một trong các cách sau — tất cả đều chạy được Node.js:

### Cách dễ nhất: Render.com (miễn phí cho quy mô nhỏ)
1. Đưa toàn bộ thư mục này lên một repository GitHub.
2. Vào [render.com](https://render.com) → New → Web Service → chọn repository đó.
3. Build Command: `npm install`. Start Command: `npm start`.
4. Vào mục Environment, thêm biến `ADMIN_PASSWORD` với mật khẩu bạn chọn.
5. Sau khi deploy xong, bạn sẽ có một địa chỉ dạng `https://ten-app.onrender.com`.

### Cách khác: Railway.app, Fly.io, hoặc VPS riêng
Đều tương tự: cài Node.js, chạy `npm install && npm start`, đặt biến môi trường `ADMIN_PASSWORD` và `PORT` nếu cần, dùng Nginx/Caddy để gắn tên miền và HTTPS nếu deploy trên VPS riêng.

**Lưu ý quan trọng:** dùng lệnh `npm install && npm start` trên một host Node.js thật (Render, Railway, VPS...) — **không** dán nội dung file vào WordPress/Wix/Google Sites, vì các nền tảng đó không chạy được backend Node.js.

## 4. Cách hoạt động của mã QR

Trong tab **Thiệp mời & QR** của trang quản trị, mỗi khách có một đường link dạng:

```
https://địa-chỉ-web-của-bạn/rsvp.html?guest=KM-0001
```

Link này được tự sinh ra dựa trên chính địa chỉ bạn đang truy cập — không cần cấu hình gì thêm. In thiệp hoặc gửi mã QR này cho khách, khách quét là vào thẳng đúng trang RSVP + thiệp mời có ảnh của riêng họ.

## 5. Thêm ảnh cô dâu chú rể

Vào tab **Tổng quan** trong trang quản trị → mục "Ảnh cô dâu chú rể" → chọn file ảnh (JPG/PNG, tối đa 8MB) → bấm "Tải ảnh lên". Ảnh sẽ tự động hiển thị trên tất cả thiệp mời và trang RSVP của khách ngay sau đó.

## 6. Cấu trúc thư mục

```
wedding-guest-system/
  server/
    index.js      # API + phục vụ file tĩnh
    db.js         # lớp lưu trữ dữ liệu (file JSON)
  public/
    index.html    # trang quản trị
    rsvp.html     # trang khách (mở qua QR)
    css/style.css
    js/admin.js
    js/rsvp.js
  data/db.json    # dữ liệu thật (tự tạo khi chạy lần đầu)
  uploads/        # ảnh cô dâu chú rể
  .env            # mật khẩu quản trị (tự tạo từ .env.example)
```
