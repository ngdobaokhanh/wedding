function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(d){
  if(!d) return '';
  const parts = d.split('-');
  return parts.length===3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
}
function showToast(msg){
  let t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2600);
}

const params = new URLSearchParams(window.location.search);
const guestId = (params.get('guest')||'').trim();

let guest = null, settings = null;

async function load(){
  if(!guestId){ renderNotFound(); return; }
  try{
    const res = await fetch(`/api/public/guest/${encodeURIComponent(guestId)}`);
    if(!res.ok){ renderNotFound(); return; }
    const data = await res.json();
    guest = data.guest; settings = data.settings;
    render();
  }catch(e){
    renderNotFound();
  }
}

function renderNotFound(){
  document.getElementById('root').innerHTML = `
  <div class="card" style="text-align:center;margin-top:40px;">
    <h2 class="serif">Không tìm thấy thiệp mời</h2>
    <p style="color:var(--ink-soft);">Đường dẫn không hợp lệ hoặc khách mời đã bị xoá khỏi danh sách. Vui lòng liên hệ lại với cô dâu/chú rể để nhận đúng đường dẫn.</p>
  </div>`;
}

function render(){
  const alreadyConfirmed = guest.trangThaiRSVP==='co' && guest.soNguoiThamDuThucTe!=null;
  const timeStr = settings.eventTime ? `${settings.eventTime}, ` : '';
  document.getElementById('root').innerHTML = `
  <div class="invite-card">
    <div class="orn">✦ ✦ ✦</div>
    ${settings.couplePhoto? `<img src="${esc(settings.couplePhoto)}" class="couple-photo" alt="Ảnh cô dâu chú rể">` : ''}
    <div style="font-size:12.5px;color:var(--ink-soft);">Trân trọng kính mời</div>
    <div class="names-inv">${esc(guest.hoTen)}</div>
    <div style="font-size:12.5px;color:var(--ink-soft);">tới dự lễ thành hôn của</div>
    <h2>${esc(settings.groomName)} &amp; ${esc(settings.brideName)}</h2>
    <div class="meta" style="font-weight:600;color:var(--ink);">${timeStr}${fmtDate(settings.weddingDate)}</div>
    <div class="meta">${esc(settings.venue)}</div>
  </div>
  <div class="rsvp-choice">
    <button id="rsvpYes" class="${guest.trangThaiRSVP==='co'?'picked-yes':''}">Tôi sẽ tham dự</button>
    <button id="rsvpNo" class="${guest.trangThaiRSVP==='khong'?'picked-no':''}">Xin lỗi, không thể tham dự</button>
  </div>
  <div id="rsvpDetail">
    ${guest.trangThaiRSVP==='co' ? `<div class="field" style="max-width:240px;margin:0 auto;">
      <label>Số người sẽ đến (tối đa ${guest.soNguoiMoi})</label>
      <input type="number" id="rsvpCount" min="1" max="${guest.soNguoiMoi}" value="${guest.soNguoiThamDuThucTe ?? guest.soNguoiMoi}">
      <button class="btn rose" id="rsvpSaveCount" style="margin-top:8px;width:100%;justify-content:center;">${alreadyConfirmed?'Cập nhật số người':'Xác nhận'}</button>
      <div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:8px;">Bạn có thể quay lại đúng link/mã QR này bất cứ lúc nào trước ngày cưới để sửa lại số người tham dự.</div>
    </div>` : ''}
    ${guest.trangThaiRSVP==='khong' ? `<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;">Rất tiếc không có bạn, cảm ơn bạn đã phản hồi. Nếu đổi ý, hãy quay lại link này để cập nhật.</div>` : ''}
  </div>
  <div class="guest-footnote">Bạn có thể đóng trang này sau khi xác nhận. Cảm ơn bạn!</div>`;
  wire();
}

async function submitRsvp(attending, count){
  try{
    const res = await fetch(`/api/public/guest/${encodeURIComponent(guestId)}/rsvp`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({attending, count})
    });
    if(!res.ok) throw new Error('Không gửi được, thử lại sau.');
    guest = await res.json();
    render();
    showToast('Đã ghi nhận, cảm ơn bạn!');
  }catch(e){
    showToast(e.message || 'Có lỗi xảy ra, thử lại sau.');
  }
}

function wire(){
  const yesBtn = document.getElementById('rsvpYes'), noBtn = document.getElementById('rsvpNo');
  yesBtn && yesBtn.addEventListener('click', ()=>submitRsvp('co', guest.soNguoiThamDuThucTe ?? guest.soNguoiMoi));
  noBtn && noBtn.addEventListener('click', ()=>submitRsvp('khong', 0));
  const saveCount = document.getElementById('rsvpSaveCount');
  saveCount && saveCount.addEventListener('click', ()=>{
    const v = Number(document.getElementById('rsvpCount').value)||1;
    submitRsvp('co', Math.min(Math.max(v,1), guest.soNguoiMoi));
  });
}

load();
