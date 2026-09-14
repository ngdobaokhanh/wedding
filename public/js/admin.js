/* ============================= ADMIN APP STATE ============================= */
let state = null;       // { settings, guests, tables }
let activeTab = 'overview';
let modal = null;       // {type, id}
let adminKey = localStorage.getItem('wg_admin_key') || '';

const TABS = [
  {id:'overview', label:'Tổng quan'},
  {id:'guests', label:'Danh sách khách'},
  {id:'invites', label:'Thiệp mời &amp; QR'},
  {id:'rsvp', label:'RSVP'},
  {id:'reminders', label:'Nhắc khách'},
  {id:'seating', label:'Xếp bàn'},
  {id:'checkin', label:'Check-in'},
  {id:'reconcile', label:'Đối soát'},
];

/* ============================= API HELPERS ============================= */
async function api(path, opts={}){
  const res = await fetch('/api/admin' + path, {
    ...opts,
    headers: Object.assign({'Content-Type':'application/json', 'x-admin-key': adminKey}, opts.headers||{})
  });
  if(res.status===401){ throw {unauthorized:true}; }
  if(!res.ok){
    let msg = 'Lỗi máy chủ';
    try{ const j = await res.json(); msg = j.error||msg; }catch(e){}
    throw new Error(msg);
  }
  return res.status===204 ? null : res.json();
}
const apiGet = (p)=>api(p);
const apiPost = (p,body)=>api(p,{method:'POST', body: JSON.stringify(body)});
const apiPut = (p,body)=>api(p,{method:'PUT', body: JSON.stringify(body)});
const apiDelete = (p)=>api(p,{method:'DELETE'});

async function refreshState(){
  state = await apiGet('/state');
}

function showToast(msg){
  let t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2600);
}

/* ============================= HELPERS ============================= */
function fmtDate(d){
  if(!d) return '';
  const parts = d.split('-');
  return parts.length===3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
}
function daysUntil(dateStr){
  const target = new Date(dateStr+'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target-now)/86400000);
}
function guestById(id){ return state.guests.find(g=>g.id===id); }
function tableById(id){ return state.tables.find(t=>t.id===id); }
function guestsInTable(tid){ return state.guests.filter(g=>g.banId===tid); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function rsvpPill(g){
  if(g.trangThaiRSVP==='co') return `<span class="pill yes">Tham dự</span>`;
  if(g.trangThaiRSVP==='khong') return `<span class="pill no">Không tham dự</span>`;
  return `<span class="pill pending">Chưa phản hồi</span>`;
}
function invitePill(g){
  return g.trangThaiMoi==='da_gui' ? `<span class="pill sent">Đã gửi thiệp</span>` : `<span class="pill notsent">Chưa gửi</span>`;
}
function guestLink(id){
  return `${window.location.origin}/rsvp.html?guest=${id}`;
}

/* ============================= LOGIN GATE ============================= */
async function tryLogin(password){
  const res = await fetch('/api/admin/login', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password})
  });
  return res.ok;
}
function renderLogin(errMsg){
  document.getElementById('root').innerHTML = `
  <div class="login-wrap">
    <h1 class="serif" style="font-size:26px;">Đăng nhập quản trị</h1>
    <p style="color:var(--ink-soft);font-size:13px;">Nhập mật khẩu quản trị (đã đặt trong biến môi trường ADMIN_PASSWORD của server) để vào dashboard.</p>
    <div class="card">
      <div class="field"><label>Mật khẩu</label><input type="text" id="loginPw" placeholder="Mật khẩu quản trị"></div>
      ${errMsg? `<p style="color:var(--rose-deep);font-size:12.5px;">${esc(errMsg)}</p>` : ''}
      <button class="btn rose" id="loginBtn" style="width:100%;justify-content:center;">Đăng nhập</button>
    </div>
  </div>`;
  const go = async ()=>{
    const pw = document.getElementById('loginPw').value.trim();
    if(!pw) return;
    const ok = await tryLogin(pw);
    if(ok){
      adminKey = pw;
      localStorage.setItem('wg_admin_key', pw);
      boot();
    }else{
      renderLogin('Sai mật khẩu, vui lòng thử lại.');
    }
  };
  document.getElementById('loginBtn').addEventListener('click', go);
  document.getElementById('loginPw').addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
}

/* ============================= SHELL / RENDER ============================= */
function renderShell(){
  document.getElementById('root').innerHTML = `
  <div class="app">
    <div class="sidebar">
      <div class="brand">
        <div class="names serif" id="brandNames"></div>
        <div class="sub" id="brandDate"></div>
      </div>
      <nav id="nav"></nav>
      <div class="sidebar-foot">Dữ liệu được lưu thật trên server, không bị mất khi tải lại trang.<br><br><a href="#" id="logoutLink" style="color:#B7AFA0;">Đăng xuất</a></div>
    </div>
    <main id="main"></main>
  </div>`;
  document.getElementById('logoutLink').addEventListener('click', (e)=>{
    e.preventDefault();
    localStorage.removeItem('wg_admin_key');
    adminKey='';
    renderLogin();
  });
}

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = TABS.map(t=>`<button data-tab="${t.id}" class="${activeTab===t.id?'active':''}"><span class="dot"></span>${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab; renderAll();}));
  document.getElementById('brandNames').textContent = `${state.settings.groomName} & ${state.settings.brideName}`;
  document.getElementById('brandDate').textContent = `${fmtDate(state.settings.weddingDate)}`;
}

function renderAll(){
  renderNav();
  const main = document.getElementById('main');
  const renderers = {
    overview: renderOverview, guests: renderGuests, invites: renderInvites,
    rsvp: renderRSVP, reminders: renderReminders, seating: renderSeating,
    checkin: renderCheckin, reconcile: renderReconcile
  };
  main.innerHTML = renderers[activeTab]();
  attachHandlers[activeTab] && attachHandlers[activeTab]();
  renderModal();
}
const attachHandlers = {};

/* ============================= OVERVIEW ============================= */
function renderOverview(){
  const g = state.guests;
  const totalSuat = g.reduce((s,x)=>s+Number(x.soNguoiMoi||0),0);
  const yes = g.filter(x=>x.trangThaiRSVP==='co');
  const no = g.filter(x=>x.trangThaiRSVP==='khong');
  const pending = g.filter(x=>x.trangThaiRSVP==='chua_phan_hoi');
  const confirmedGuests = yes.reduce((s,x)=>s+Number(x.soNguoiThamDuThucTe ?? x.soNguoiMoi ?? 0),0);
  const checkedIn = g.filter(x=>x.daCheckin).length;
  const dLeft = daysUntil(state.settings.weddingDate);
  const photo = state.settings.couplePhoto;

  return `
  <div class="page-head">
    <div><h1>Tổng quan</h1><p>Còn ${dLeft>=0?dLeft:0} ngày nữa đến lễ cưới · ${esc(state.settings.venue)}</p></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="num">${g.length}</div><div class="lbl">Khách mời (hộ)</div></div>
    <div class="stat gold"><div class="num">${totalSuat}</div><div class="lbl">Tổng suất mời</div></div>
    <div class="stat sage"><div class="num">${yes.length}</div><div class="lbl">Đã xác nhận tham dự</div></div>
    <div class="stat rose"><div class="num">${pending.length}</div><div class="lbl">Chưa phản hồi</div></div>
    <div class="stat sage"><div class="num">${checkedIn}</div><div class="lbl">Đã check-in</div></div>
  </div>
  <div class="row-2">
    <div class="card">
      <h2>Tiến độ RSVP</h2>
      <p class="desc">Tính trên ${g.length} hộ khách đã nhập</p>
      ${rsvpBar('Tham dự', yes.length, g.length, 'var(--sage)')}
      ${rsvpBar('Không tham dự', no.length, g.length, 'var(--rose)')}
      ${rsvpBar('Chưa phản hồi', pending.length, g.length, 'var(--amber)')}
    </div>
    <div class="card">
      <h2>Chốt số lượng dự kiến</h2>
      <p class="desc">Số người thực tế sẽ tới, dùng để đặt bàn &amp; đặt cỗ</p>
      <div class="stats" style="grid-template-columns:1fr 1fr;margin-bottom:0;">
        <div class="stat sage"><div class="num">${confirmedGuests}</div><div class="lbl">Khách xác nhận tới</div></div>
        <div class="stat"><div class="num">${Math.ceil(confirmedGuests/10)}</div><div class="lbl">Số bàn cần (10 khách/bàn)</div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Ảnh cô dâu chú rể</h2>
    <p class="desc">Hiển thị trên thiệp mời &amp; trang RSVP mà khách nhìn thấy</p>
    ${photo? `<img src="${esc(photo)}" class="couple-photo" alt="Ảnh cô dâu chú rể">` : `<div class="empty" style="padding:20px;">Chưa có ảnh nào được tải lên.</div>`}
    <div class="field" style="max-width:320px;"><label>Chọn ảnh mới (JPG/PNG, tối đa 8MB)</label><input type="file" id="photoInput" accept="image/*"></div>
    <button class="btn" id="uploadPhotoBtn">Tải ảnh lên</button>
  </div>
  <div class="card">
    <h2>Thông tin lễ cưới</h2>
    <p class="desc">Hiển thị trên thiệp mời &amp; trang RSVP của khách</p>
    <div class="row-3">
      <div class="field"><label>Tên chú rể</label><input type="text" id="ovGroom" value="${esc(state.settings.groomName)}"></div>
      <div class="field"><label>Tên cô dâu</label><input type="text" id="ovBride" value="${esc(state.settings.brideName)}"></div>
      <div class="field"><label>Hạn phản hồi RSVP</label><input type="text" id="ovDeadline" value="${state.settings.rsvpDeadline}" placeholder="YYYY-MM-DD"></div>
      <div class="field"><label>Ngày cưới</label><input type="text" id="ovDate" value="${state.settings.weddingDate}" placeholder="YYYY-MM-DD"></div>
      <div class="field"><label>Giờ tổ chức</label><input type="text" id="ovTime" value="${esc(state.settings.eventTime||'')}" placeholder="VD: 11:00"></div>
      <div class="field"><label>Địa điểm</label><input type="text" id="ovVenue" value="${esc(state.settings.venue)}"></div>
    </div>
    <button class="btn" id="saveSettings">Lưu thông tin</button>
  </div>`;
}
function rsvpBar(label,count,total,color){
  const pct = total? Math.round(count/total*100):0;
  return `<div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;"><span>${label}</span><span>${count} (${pct}%)</span></div>
    <div class="bar"><div style="width:${pct}%;background:${color};"></div></div>
  </div>`;
}
attachHandlers.overview = ()=>{
  document.getElementById('saveSettings').addEventListener('click', async ()=>{
    try{
      await apiPut('/settings', {
        groomName: document.getElementById('ovGroom').value.trim() || state.settings.groomName,
        brideName: document.getElementById('ovBride').value.trim() || state.settings.brideName,
        weddingDate: document.getElementById('ovDate').value.trim() || state.settings.weddingDate,
        eventTime: document.getElementById('ovTime').value.trim(),
        rsvpDeadline: document.getElementById('ovDeadline').value.trim() || state.settings.rsvpDeadline,
        venue: document.getElementById('ovVenue').value.trim() || state.settings.venue
      });
      await refreshState(); showToast('Đã lưu thông tin lễ cưới'); renderAll();
    }catch(e){ handleApiError(e); }
  });
  document.getElementById('uploadPhotoBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('photoInput');
    if(!inp.files[0]){ showToast('Vui lòng chọn một ảnh trước'); return; }
    const fd = new FormData();
    fd.append('photo', inp.files[0]);
    try{
      const res = await fetch('/api/admin/settings/photo', { method:'POST', headers:{'x-admin-key':adminKey}, body: fd });
      if(res.status===401) throw {unauthorized:true};
      if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error||'Lỗi tải ảnh'); }
      await refreshState(); showToast('Đã cập nhật ảnh'); renderAll();
    }catch(e){ handleApiError(e); }
  });
};

function handleApiError(e){
  if(e && e.unauthorized){
    localStorage.removeItem('wg_admin_key'); adminKey='';
    renderLogin('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.');
    return;
  }
  console.error(e);
  showToast(e && e.message ? e.message : 'Có lỗi xảy ra, thử lại sau.');
}

/* ============================= GUESTS ============================= */
let guestFilter = {q:'', ben:'', rsvp:''};
function renderGuests(){
  const rows = state.guests.filter(g=>{
    if(guestFilter.q && !(g.hoTen.toLowerCase().includes(guestFilter.q.toLowerCase()) || g.sdt.includes(guestFilter.q))) return false;
    if(guestFilter.ben && g.ben!==guestFilter.ben) return false;
    if(guestFilter.rsvp && g.trangThaiRSVP!==guestFilter.rsvp) return false;
    return true;
  });
  return `
  <div class="page-head">
    <div><h1>Danh sách khách mời</h1><p>${state.guests.length} hộ khách trong hệ thống</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn secondary" id="btnTemplate">Tải mẫu Excel</button>
      <button class="btn secondary" id="btnImport">Nhập từ Excel</button>
      <input type="file" id="fileImport" accept=".xlsx,.xls,.csv" style="display:none;">
      <button class="btn secondary" id="btnExport">Xuất Excel</button>
      <button class="btn rose" id="btnAddGuest">+ Thêm khách</button>
    </div>
  </div>
  <div class="card">
    <div class="toolbar">
      <input type="text" id="fq" placeholder="Tìm theo tên hoặc SĐT..." value="${esc(guestFilter.q)}">
      <select id="fBen"><option value="">Tất cả hai bên</option><option ${guestFilter.ben==='Nhà trai'?'selected':''}>Nhà trai</option><option ${guestFilter.ben==='Nhà gái'?'selected':''}>Nhà gái</option></select>
      <select id="fRsvp"><option value="">Tất cả trạng thái RSVP</option>
        <option value="chua_phan_hoi" ${guestFilter.rsvp==='chua_phan_hoi'?'selected':''}>Chưa phản hồi</option>
        <option value="co" ${guestFilter.rsvp==='co'?'selected':''}>Tham dự</option>
        <option value="khong" ${guestFilter.rsvp==='khong'?'selected':''}>Không tham dự</option>
      </select>
      <div class="spacer"></div>
      <span style="color:var(--ink-soft);font-size:12.5px;">${rows.length} kết quả</span>
    </div>
    ${rows.length? `<table><thead><tr>
      <th>Mã</th><th>Họ tên</th><th>Bên</th><th>Nhóm</th><th>SĐT</th><th>Số suất mời</th><th>Gửi thiệp</th><th>RSVP</th><th>Bàn</th><th></th>
    </tr></thead><tbody>
      ${rows.map(g=>`<tr>
        <td>${g.id}</td>
        <td><strong>${esc(g.hoTen)}</strong></td>
        <td>${g.ben}</td>
        <td>${esc(g.nhom||'')}</td>
        <td>${esc(g.sdt||'')}</td>
        <td>${g.soNguoiMoi}</td>
        <td>${invitePill(g)}</td>
        <td>${rsvpPill(g)}</td>
        <td>${g.banId? (tableById(g.banId)?.ten || '—') : '—'}</td>
        <td><button class="btn secondary small" data-edit="${g.id}">Sửa</button></td>
      </tr>`).join('')}
    </tbody></table>` : `<div class="empty"><span class="serif">Chưa có khách mời nào khớp</span>Thêm khách hoặc điều chỉnh bộ lọc phía trên.</div>`}
  </div>`;
}
attachHandlers.guests = ()=>{
  document.getElementById('fq').addEventListener('input', e=>{
    guestFilter.q=e.target.value; renderAll();
    const el = document.getElementById('fq'); el.focus(); el.selectionStart = el.value.length;
  });
  document.getElementById('fBen').addEventListener('change', e=>{guestFilter.ben=e.target.value; renderAll();});
  document.getElementById('fRsvp').addEventListener('change', e=>{guestFilter.rsvp=e.target.value; renderAll();});
  document.getElementById('btnAddGuest').addEventListener('click', ()=>{modal={type:'editGuest', id:null}; renderAll();});
  document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>{modal={type:'editGuest', id:b.dataset.edit}; renderAll();}));
  document.getElementById('btnTemplate').addEventListener('click', downloadTemplate);
  document.getElementById('btnExport').addEventListener('click', exportExcel);
  document.getElementById('btnImport').addEventListener('click', ()=>document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', handleImport);
};

function downloadTemplate(){
  const wsData = [
    ['Họ tên','Bên (Nhà trai/Nhà gái)','Nhóm quan hệ','Số điện thoại','Email','Số suất mời','Ghi chú'],
    ['Nguyễn Văn A','Nhà trai','Bạn bè','0900000000','','2','Ăn chay']
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:22},{wch:20},{wch:16},{wch:14},{wch:20},{wch:12},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachKhach');
  XLSX.writeFile(wb, 'mau_danh_sach_khach_moi.xlsx');
}
function exportExcel(){
  const rows = state.guests.map(g=>({
    'Mã khách': g.id, 'Họ tên': g.hoTen, 'Bên': g.ben, 'Nhóm quan hệ': g.nhom,
    'Số điện thoại': g.sdt, 'Email': g.email, 'Số suất mời': g.soNguoiMoi,
    'Đã gửi thiệp': g.trangThaiMoi==='da_gui'?'Có':'Chưa',
    'RSVP': g.trangThaiRSVP==='co'?'Tham dự':g.trangThaiRSVP==='khong'?'Không tham dự':'Chưa phản hồi',
    'Số người tham dự thực tế': g.soNguoiThamDuThucTe ?? '',
    'Bàn': g.banId? (tableById(g.banId)?.ten||'') : '',
    'Đã check-in': g.daCheckin?'Có':'Chưa', 'Giờ check-in': g.checkinTime||'',
    'Ghi chú': g.ghiChu||''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KhachMoi');
  XLSX.writeFile(wb, 'danh_sach_khach_moi.xlsx');
}
function handleImport(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (evt)=>{
    try{
      const wb = XLSX.read(evt.target.result, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      const payload = rows.map(r=>({
        hoTen: (r['Họ tên']||'').toString().trim(),
        ben: (r['Bên (Nhà trai/Nhà gái)']||r['Bên']||'Nhà trai').toString().trim(),
        nhom: (r['Nhóm quan hệ']||'').toString().trim(),
        sdt: (r['Số điện thoại']||'').toString().trim(),
        email: (r['Email']||'').toString().trim(),
        soNguoiMoi: Number(r['Số suất mời']||1) || 1,
        ghiChu: (r['Ghi chú']||'').toString().trim()
      })).filter(r=>r.hoTen);
      const result = await apiPost('/guests/import', payload);
      await refreshState();
      showToast(`Đã nhập ${result.added} khách từ Excel`);
      renderAll();
    }catch(err){
      handleApiError(err instanceof Error ? err : new Error('Không đọc được file. Kiểm tra định dạng theo mẫu.'));
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value='';
}

/* ============================= INVITES / QR ============================= */
function renderInvites(){
  const notSent = state.guests.filter(g=>g.trangThaiMoi!=='da_gui').length;
  return `
  <div class="page-head">
    <div><h1>Thiệp mời &amp; mã QR</h1><p>Mỗi khách có một đường link RSVP riêng — quét mã QR sẽ mở đúng trang của họ trên chính website này</p></div>
    <div><span class="pill notsent">${notSent} khách chưa gửi thiệp</span></div>
  </div>
  <div class="card">
    <table><thead><tr><th>Mã</th><th>Họ tên</th><th>Bên</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody>
      ${state.guests.map(g=>`<tr>
        <td>${g.id}</td><td><strong>${esc(g.hoTen)}</strong></td><td>${g.ben}</td><td>${invitePill(g)}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn secondary small" data-qr="${g.id}">Xem thiệp &amp; QR</button>
          <button class="btn secondary small" data-toggle-sent="${g.id}">${g.trangThaiMoi==='da_gui'?'Bỏ đánh dấu':'Đánh dấu đã gửi'}</button>
        </td>
      </tr>`).join('')}
    </tbody></table>
  </div>`;
}
attachHandlers.invites = ()=>{
  document.querySelectorAll('[data-qr]').forEach(b=>b.addEventListener('click', ()=>{modal={type:'qr', id:b.dataset.qr}; renderAll();}));
  document.querySelectorAll('[data-toggle-sent]').forEach(b=>b.addEventListener('click', async ()=>{
    const g = guestById(b.dataset.toggleSent);
    try{
      await apiPut(`/guests/${g.id}`, { trangThaiMoi: g.trangThaiMoi==='da_gui' ? 'chua_gui' : 'da_gui' });
      await refreshState(); renderAll();
    }catch(e){ handleApiError(e); }
  }));
};

function inviteCardHTML(g, showQR){
  const timeStr = state.settings.eventTime ? `${state.settings.eventTime}, ` : '';
  const photo = state.settings.couplePhoto;
  return `
  <div class="invite-card">
    <div class="orn">✦ ✦ ✦</div>
    ${photo? `<img src="${esc(photo)}" class="couple-photo" alt="Ảnh cô dâu chú rể">` : ''}
    <div style="font-size:12.5px;color:var(--ink-soft);">Trân trọng kính mời</div>
    <div class="names-inv">${esc(g.hoTen)}</div>
    <div style="font-size:12.5px;color:var(--ink-soft);">tới dự lễ thành hôn của</div>
    <h2>${esc(state.settings.groomName)} &amp; ${esc(state.settings.brideName)}</h2>
    <div class="meta" style="font-weight:600;color:var(--ink);">${timeStr}${fmtDate(state.settings.weddingDate)}</div>
    <div class="meta">${esc(state.settings.venue)}</div>
    ${showQR? `<div class="qr-wrap"><div id="qrHolder"></div></div>
    <div style="font-size:11.5px;color:var(--ink-soft);">Quét mã để xác nhận tham dự (RSVP) và check-in ngày cưới</div>` : ''}
  </div>`;
}

function qrModal(id){
  const g = guestById(id);
  const link = guestLink(id);
  return `<button class="modal-close" id="mClose">×</button>
  <h2>Thiệp mời &amp; mã QR — ${esc(g.hoTen)}</h2>
  ${inviteCardHTML(g, true)}
  <div style="text-align:center;margin-top:14px;color:var(--ink-soft);font-size:11.5px;">Mã khách: ${g.id} · Dùng để RSVP và check-in</div>
  <div style="text-align:center;margin-top:6px;font-size:11.5px;word-break:break-all;color:var(--ink-soft);">${esc(link)}</div>
  <div style="display:flex;justify-content:center;gap:8px;margin-top:16px;flex-wrap:wrap;">
    <button class="btn secondary" id="mCopyLink">Sao chép link</button>
    <button class="btn secondary" id="mOpenLink">Mở thử trang khách</button>
    <button class="btn secondary" id="mPrint">In thiệp này</button>
  </div>`;
}
function wireQrModal(id){
  document.getElementById('mClose').addEventListener('click', ()=>{modal=null; renderAll();});
  const holder = document.getElementById('qrHolder');
  const link = guestLink(id);
  if(holder && window.QRCode){
    holder.innerHTML='';
    new QRCode(holder, {text: link, width:120, height:120, colorDark:'#20232C', colorLight:'#ffffff'});
  }
  document.getElementById('mPrint').addEventListener('click', ()=>{
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Thiệp mời</title><link rel="stylesheet" href="/css/style.css"></head><body style="padding:30px;">${document.querySelector('.modal .invite-card').outerHTML}</body></html>`);
    w.document.close(); setTimeout(()=>w.print(), 300);
  });
  document.getElementById('mOpenLink').addEventListener('click', ()=>window.open(link, '_blank'));
  document.getElementById('mCopyLink').addEventListener('click', ()=>{
    navigator.clipboard?.writeText(link).then(()=>showToast('Đã sao chép link RSVP')).catch(()=>showToast('Không sao chép được, hãy bôi đen thủ công'));
  });
}

/* ============================= RSVP (theo dõi phản hồi) ============================= */
function renderRSVP(){
  const answered = state.guests.filter(g=>g.trangThaiRSVP!=='chua_phan_hoi');
  const pending = state.guests.filter(g=>g.trangThaiRSVP==='chua_phan_hoi');
  return `
  <div class="page-head">
    <div><h1>RSVP</h1><p>Khách tự xác nhận qua trang riêng của họ (mở từ mã QR trong thiệp) — đây là nơi theo dõi kết quả</p></div>
  </div>
  <div class="row-2">
    <div class="card">
      <h2>Đã phản hồi (${answered.length})</h2>
      ${answered.length? `<table><thead><tr><th>Khách</th><th>Trạng thái</th><th>Số người</th></tr></thead><tbody>
        ${answered.map(x=>`<tr><td>${esc(x.hoTen)}</td><td>${rsvpPill(x)}</td><td>${x.trangThaiRSVP==='co'? (x.soNguoiThamDuThucTe ?? x.soNguoiMoi):'—'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Chưa có phản hồi nào.</div>`}
    </div>
    <div class="card">
      <h2>Chưa phản hồi (${pending.length})</h2>
      ${pending.length? `<table><thead><tr><th>Khách</th><th></th></tr></thead><tbody>
        ${pending.map(x=>`<tr><td>${esc(x.hoTen)}</td><td><button class="btn secondary small" data-open="${x.id}">Mở trang của khách</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Mọi khách đã phản hồi.</div>`}
    </div>
  </div>`;
}
attachHandlers.rsvp = ()=>{
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click', ()=>window.open(guestLink(b.dataset.open), '_blank')));
};

/* ============================= REMINDERS ============================= */
function renderReminders(){
  const pending = state.guests.filter(g=>g.trangThaiRSVP==='chua_phan_hoi');
  const dLeft = daysUntil(state.settings.rsvpDeadline);
  const dLeftText = dLeft>=0 ? `còn ${dLeft} ngày` : `đã quá hạn ${Math.abs(dLeft)} ngày`;
  return `
  <div class="page-head">
    <div><h1>Nhắc khách phản hồi</h1><p>Hạn RSVP: ${fmtDate(state.settings.rsvpDeadline)} (${dLeftText}) · ${pending.length} khách chưa phản hồi</p></div>
  </div>
  <div class="card">
    ${pending.length? `<table><thead><tr><th>Khách</th><th>Bên</th><th>SĐT</th><th>Gửi thiệp</th><th></th></tr></thead><tbody>
      ${pending.map(g=>`<tr>
        <td><strong>${esc(g.hoTen)}</strong></td><td>${g.ben}</td><td>${esc(g.sdt||'')}</td><td>${invitePill(g)}</td>
        <td><button class="btn secondary small" data-remind="${g.id}">Xem tin nhắn nhắc</button></td>
      </tr>`).join('')}
    </tbody></table>` : `<div class="empty"><span class="serif">Mọi khách đã phản hồi</span>Không còn ai cần nhắc thêm.</div>`}
  </div>`;
}
attachHandlers.reminders = ()=>{
  document.querySelectorAll('[data-remind]').forEach(b=>b.addEventListener('click', ()=>{
    modal = {type:'remindMsg', id:b.dataset.remind}; renderAll();
  }));
};
function reminderText(g){
  return `Kính gửi ${g.hoTen},\n\nGia đình ${state.settings.groomName} & ${state.settings.brideName} chưa nhận được phản hồi tham dự lễ cưới ngày ${fmtDate(state.settings.weddingDate)} tại ${state.settings.venue}.\nMong ${g.hoTen} quét mã QR trên thiệp hoặc bấm vào link sau để phản hồi trước ngày ${fmtDate(state.settings.rsvpDeadline)}:\n${guestLink(g.id)}\n\nTrân trọng!`;
}

/* ============================= SEATING ============================= */
function renderSeating(){
  const unassigned = state.guests.filter(g=>!g.banId && g.trangThaiRSVP!=='khong');
  return `
  <div class="page-head">
    <div><h1>Xếp bàn tiệc</h1><p>${state.tables.length} bàn đã tạo · ${unassigned.length} khách chưa xếp bàn</p></div>
    <button class="btn rose" id="btnAddTable">+ Thêm bàn</button>
  </div>
  <div class="table-grid" style="margin-bottom:22px;">
    ${state.tables.map(t=>{
      const gs = guestsInTable(t.id);
      const used = gs.reduce((s,x)=>s+Number(x.soNguoiThamDuThucTe ?? x.soNguoiMoi ?? 0),0);
      const over = used > t.sucChua;
      return `<div class="table-box">
        <div class="tname">${esc(t.ten)}</div>
        <div class="cap ${over?'over':''}">${used} / ${t.sucChua} khách${over?' · vượt sức chứa':''}</div>
        <div class="bar"><div class="${over?'over':''}" style="width:${Math.min(100,used/t.sucChua*100)}%;"></div></div>
        ${gs.map(g=>`<div class="guest-chip">${esc(g.hoTen)} <span style="color:var(--ink-soft);">(${g.soNguoiThamDuThucTe ?? g.soNguoiMoi})</span></div>`).join('') || `<div style="color:var(--ink-soft);font-size:12px;">Chưa có khách</div>`}
        <button class="btn secondary small" style="margin-top:10px;" data-del-table="${t.id}">Xóa bàn</button>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <h2>Gán khách vào bàn</h2>
    <p class="desc">Chỉ hiển thị khách đã xác nhận tham dự hoặc chưa phản hồi</p>
    <table><thead><tr><th>Khách</th><th>RSVP</th><th>Số người</th><th>Bàn hiện tại</th><th>Chuyển tới</th></tr></thead><tbody>
      ${state.guests.filter(g=>g.trangThaiRSVP!=='khong').map(g=>`<tr>
        <td>${esc(g.hoTen)}</td><td>${rsvpPill(g)}</td><td>${g.soNguoiThamDuThucTe ?? g.soNguoiMoi}</td>
        <td>${g.banId? tableById(g.banId)?.ten:'—'}</td>
        <td><select data-assign="${g.id}">
          <option value="">— Không xếp —</option>
          ${state.tables.map(t=>`<option value="${t.id}" ${g.banId===t.id?'selected':''}>${esc(t.ten)}</option>`).join('')}
        </select></td>
      </tr>`).join('')}
    </tbody></table>
  </div>`;
}
attachHandlers.seating = ()=>{
  document.getElementById('btnAddTable').addEventListener('click', async ()=>{
    try{ await apiPost('/tables', {}); await refreshState(); renderAll(); }catch(e){ handleApiError(e); }
  });
  document.querySelectorAll('[data-del-table]').forEach(b=>b.addEventListener('click', async ()=>{
    try{ await apiDelete(`/tables/${b.dataset.delTable}`); await refreshState(); renderAll(); }catch(e){ handleApiError(e); }
  }));
  document.querySelectorAll('[data-assign]').forEach(sel=>sel.addEventListener('change', async ()=>{
    try{ await apiPut(`/guests/${sel.dataset.assign}`, {banId: sel.value}); await refreshState(); renderAll(); }catch(e){ handleApiError(e); }
  }));
};

/* ============================= CHECK-IN ============================= */
let checkinQuery = '';
let checkinFeedback = null;
function renderCheckin(){
  const checkedIn = state.guests.filter(g=>g.daCheckin);
  const matches = checkinQuery ? state.guests.filter(g=>
    g.id.toLowerCase()===checkinQuery.toLowerCase() ||
    g.hoTen.toLowerCase().includes(checkinQuery.toLowerCase()) ||
    g.sdt.includes(checkinQuery)
  ) : [];
  return `
  <div class="page-head">
    <div><h1>Check-in ngày cưới</h1><p>Quét mã QR của khách (hoặc nhập mã/tên/SĐT) để xác nhận đã tới</p></div>
    <div class="stat sage" style="min-width:130px;"><div class="num">${checkedIn.length}</div><div class="lbl">Đã check-in</div></div>
  </div>
  <div class="card">
    <div class="checkin-hero">
      <input type="text" id="checkinInput" placeholder="Nhập mã khách (VD: KM-0001), tên hoặc số điện thoại..." value="${esc(checkinQuery)}" autofocus>
      <button class="btn rose" id="checkinGo">Tìm</button>
    </div>
    <div class="scanline">Mẹo: khi in thiệp, mã QR mã hoá trực tiếp link RSVP của khách — quét bằng máy quét QR thường sẽ tự mở đúng khách này.</div>
    ${checkinFeedback? `<div class="msg-tpl" style="border-color:var(--sage);color:var(--sage);background:var(--sage-bg);margin-top:14px;">${esc(checkinFeedback)}</div>`:''}
    ${matches.length? `<table style="margin-top:16px;"><thead><tr><th>Mã</th><th>Họ tên</th><th>Bàn</th><th>RSVP</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${matches.map(g=>`<tr>
        <td>${g.id}</td><td><strong>${esc(g.hoTen)}</strong></td><td>${g.banId?tableById(g.banId)?.ten:'—'}</td><td>${rsvpPill(g)}</td>
        <td>${g.daCheckin? `<span class="pill checked">Đã check-in ${g.checkinTime}</span>`:`<span class="pill notsent">Chưa tới</span>`}</td>
        <td>${g.daCheckin? `<button class="btn secondary small" data-undo="${g.id}">Hủy check-in</button>`:`<button class="btn rose small" data-checkin="${g.id}">Check-in</button>`}</td>
      </tr>`).join('')}
    </tbody></table>` : (checkinQuery? `<div class="empty">Không tìm thấy khách phù hợp.</div>`:'')}
  </div>
  <div class="card">
    <h2>Danh sách đã check-in</h2>
    ${checkedIn.length? `<table><thead><tr><th>Khách</th><th>Bàn</th><th>Giờ tới</th></tr></thead><tbody>
      ${checkedIn.map(g=>`<tr><td>${esc(g.hoTen)}</td><td>${g.banId?tableById(g.banId)?.ten:'—'}</td><td>${g.checkinTime}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">Chưa có khách nào check-in.</div>`}
  </div>`;
}
attachHandlers.checkin = ()=>{
  const inp = document.getElementById('checkinInput');
  const go = ()=>{checkinQuery=inp.value.trim(); checkinFeedback=null; renderAll();};
  document.getElementById('checkinGo').addEventListener('click', go);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
  document.querySelectorAll('[data-checkin]').forEach(b=>b.addEventListener('click', async ()=>{
    try{
      await apiPut(`/guests/${b.dataset.checkin}/checkin`, {daCheckin:true});
      await refreshState();
      checkinFeedback = `Đã check-in cho ${guestById(b.dataset.checkin).hoTen}.`;
      renderAll();
    }catch(e){ handleApiError(e); }
  }));
  document.querySelectorAll('[data-undo]').forEach(b=>b.addEventListener('click', async ()=>{
    try{ await apiPut(`/guests/${b.dataset.undo}/checkin`, {daCheckin:false}); await refreshState(); renderAll(); }catch(e){ handleApiError(e); }
  }));
};

/* ============================= RECONCILE ============================= */
function renderReconcile(){
  const g = state.guests;
  const invited = g.reduce((s,x)=>s+Number(x.soNguoiMoi||0),0);
  const yes = g.filter(x=>x.trangThaiRSVP==='co');
  const no = g.filter(x=>x.trangThaiRSVP==='khong');
  const pending = g.filter(x=>x.trangThaiRSVP==='chua_phan_hoi');
  const confirmed = yes.reduce((s,x)=>s+Number(x.soNguoiThamDuThucTe ?? x.soNguoiMoi ?? 0),0);
  const attended = g.filter(x=>x.daCheckin);
  const noShow = yes.filter(x=>!x.daCheckin);
  const walkIn = attended.filter(x=>x.trangThaiRSVP!=='co');

  const bySide = ['Nhà trai','Nhà gái'].map(side=>{
    const gg = g.filter(x=>x.ben===side);
    return {side, invited: gg.reduce((s,x)=>s+Number(x.soNguoiMoi||0),0), confirmed: gg.filter(x=>x.trangThaiRSVP==='co').reduce((s,x)=>s+Number(x.soNguoiThamDuThucTe??x.soNguoiMoi??0),0), attended: gg.filter(x=>x.daCheckin).length};
  });

  return `
  <div class="page-head">
    <div><h1>Đối soát sau tiệc</h1><p>So sánh số mời – số xác nhận – số thực tế tham dự để chốt chi phí đặt cỗ</p></div>
    <button class="btn secondary" id="btnExportReport">Xuất báo cáo Excel</button>
  </div>
  <div class="stats">
    <div class="stat"><div class="num">${invited}</div><div class="lbl">Tổng suất mời</div></div>
    <div class="stat sage"><div class="num">${confirmed}</div><div class="lbl">Xác nhận tham dự (RSVP)</div></div>
    <div class="stat rose"><div class="num">${attended.length}</div><div class="lbl">Thực tế check-in</div></div>
    <div class="stat gold"><div class="num">${noShow.length}</div><div class="lbl">Xác nhận nhưng vắng</div></div>
    <div class="stat"><div class="num">${walkIn.length}</div><div class="lbl">Tới bất ngờ / chưa RSVP</div></div>
  </div>
  <div class="row-2">
    <div class="card">
      <h2>Theo hai bên gia đình</h2>
      <table><thead><tr><th>Bên</th><th>Mời</th><th>Xác nhận</th><th>Có mặt</th></tr></thead><tbody>
        ${bySide.map(s=>`<tr><td>${s.side}</td><td>${s.invited}</td><td>${s.confirmed}</td><td>${s.attended}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card">
      <h2>Tình trạng phản hồi</h2>
      <table><thead><tr><th>Trạng thái</th><th>Số hộ</th></tr></thead><tbody>
        <tr><td>Tham dự</td><td>${yes.length}</td></tr>
        <tr><td>Không tham dự</td><td>${no.length}</td></tr>
        <tr><td>Chưa phản hồi</td><td>${pending.length}</td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="card">
    <h2>Khách xác nhận nhưng vắng mặt</h2>
    <p class="desc">Cân nhắc khi chốt số bàn tiệc lần sau</p>
    ${noShow.length? `<table><thead><tr><th>Khách</th><th>Bên</th><th>Bàn</th></tr></thead><tbody>
      ${noShow.map(x=>`<tr><td>${esc(x.hoTen)}</td><td>${x.ben}</td><td>${x.banId?tableById(x.banId)?.ten:'—'}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">Không có trường hợp nào.</div>`}
  </div>`;
}
attachHandlers.reconcile = ()=>{
  document.getElementById('btnExportReport').addEventListener('click', ()=>{
    const g = state.guests;
    const rows = g.map(x=>({
      'Mã':x.id,'Họ tên':x.hoTen,'Bên':x.ben,'Số suất mời':x.soNguoiMoi,
      'RSVP': x.trangThaiRSVP==='co'?'Tham dự':x.trangThaiRSVP==='khong'?'Không tham dự':'Chưa phản hồi',
      'Số xác nhận': x.soNguoiThamDuThucTe ?? '', 'Check-in': x.daCheckin?'Có':'Không', 'Giờ tới': x.checkinTime||'',
      'Bàn': x.banId? (tableById(x.banId)?.ten||'') : ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DoiSoat');
    XLSX.writeFile(wb,'doi_soat_sau_tiec.xlsx');
  });
};

/* ============================= MODAL ============================= */
function renderModal(){
  let old = document.querySelector('.modal-bg');
  if(old) old.remove();
  if(!modal) return;
  const bg = document.createElement('div');
  bg.className='modal-bg';
  bg.addEventListener('click', e=>{ if(e.target===bg){ modal=null; renderAll(); } });

  let inner = '';
  if(modal.type==='editGuest') inner = editGuestModal(modal.id);
  if(modal.type==='qr') inner = qrModal(modal.id);
  if(modal.type==='remindMsg') inner = remindModal(modal.id);

  bg.innerHTML = `<div class="modal">${inner}</div>`;
  document.body.appendChild(bg);

  if(modal.type==='editGuest') wireEditGuestModal(modal.id);
  if(modal.type==='qr') wireQrModal(modal.id);
  if(modal.type==='remindMsg') wireRemindModal(modal.id);
}

function editGuestModal(id){
  const g = id? guestById(id) : {hoTen:'',ben:'Nhà trai',nhom:'',sdt:'',email:'',soNguoiMoi:1,ghiChu:''};
  return `
  <button class="modal-close" id="mClose">×</button>
  <h2>${id? 'Sửa thông tin khách':'Thêm khách mời'}</h2>
  <div class="field"><label>Họ tên</label><input type="text" id="mHoTen" value="${esc(g.hoTen)}"></div>
  <div class="row-2">
    <div class="field"><label>Bên</label><select id="mBen"><option ${g.ben==='Nhà trai'?'selected':''}>Nhà trai</option><option ${g.ben==='Nhà gái'?'selected':''}>Nhà gái</option></select></div>
    <div class="field"><label>Nhóm quan hệ</label><input type="text" id="mNhom" value="${esc(g.nhom||'')}" placeholder="Gia đình / Bạn bè / Đồng nghiệp"></div>
  </div>
  <div class="row-2">
    <div class="field"><label>Số điện thoại</label><input type="text" id="mSdt" value="${esc(g.sdt||'')}"></div>
    <div class="field"><label>Email</label><input type="text" id="mEmail" value="${esc(g.email||'')}"></div>
  </div>
  <div class="field"><label>Số suất mời</label><input type="number" min="1" id="mSoNguoi" value="${g.soNguoiMoi}"></div>
  <div class="field"><label>Ghi chú</label><textarea id="mGhiChu" rows="2">${esc(g.ghiChu||'')}</textarea></div>
  <div style="display:flex;justify-content:space-between;margin-top:18px;">
    ${id? `<button class="btn secondary" id="mDelete" style="border-color:var(--rose);color:var(--rose-deep);">Xóa khách</button>` : `<span></span>`}
    <button class="btn rose" id="mSave">${id?'Lưu thay đổi':'Thêm khách'}</button>
  </div>`;
}
function wireEditGuestModal(id){
  document.getElementById('mClose').addEventListener('click', ()=>{modal=null; renderAll();});
  document.getElementById('mSave').addEventListener('click', async ()=>{
    const hoTen = document.getElementById('mHoTen').value.trim();
    if(!hoTen){ showToast('Vui lòng nhập họ tên'); return; }
    const data = {
      hoTen, ben: document.getElementById('mBen').value,
      nhom: document.getElementById('mNhom').value.trim(),
      sdt: document.getElementById('mSdt').value.trim(),
      email: document.getElementById('mEmail').value.trim(),
      soNguoiMoi: Number(document.getElementById('mSoNguoi').value)||1,
      ghiChu: document.getElementById('mGhiChu').value.trim(),
    };
    try{
      if(id){ await apiPut(`/guests/${id}`, data); } else { await apiPost('/guests', data); }
      await refreshState(); modal=null; renderAll(); showToast('Đã lưu khách mời');
    }catch(e){ handleApiError(e); }
  });
  const delBtn = document.getElementById('mDelete');
  delBtn && delBtn.addEventListener('click', async ()=>{
    try{ await apiDelete(`/guests/${id}`); await refreshState(); modal=null; renderAll(); showToast('Đã xóa khách mời'); }
    catch(e){ handleApiError(e); }
  });
}

function remindModal(id){
  const g = guestById(id);
  return `<button class="modal-close" id="mClose">×</button>
  <h2>Tin nhắn nhắc khách</h2>
  <p class="desc">Sao chép và gửi qua Zalo / SMS / Email cho ${esc(g.hoTen)}</p>
  <div class="msg-tpl" id="tplText">${esc(reminderText(g))}</div>
  <div style="display:flex;justify-content:flex-end;margin-top:14px;gap:8px;">
    <button class="btn secondary" id="mCopy">Sao chép</button>
    <button class="btn rose" id="mClose2">Đóng</button>
  </div>`;
}
function wireRemindModal(id){
  const close = ()=>{modal=null; renderAll();};
  document.getElementById('mClose').addEventListener('click', close);
  document.getElementById('mClose2').addEventListener('click', close);
  document.getElementById('mCopy').addEventListener('click', ()=>{
    const g = guestById(id);
    navigator.clipboard?.writeText(reminderText(g)).then(()=>showToast('Đã sao chép tin nhắn')).catch(()=>showToast('Không sao chép được, hãy bôi đen thủ công'));
  });
}

/* ============================= BOOT ============================= */
async function boot(){
  renderShell();
  try{
    await refreshState();
    renderAll();
  }catch(e){
    if(e && e.unauthorized){ renderLogin(); }
    else { handleApiError(e); }
  }
}

if(!adminKey){
  renderLogin();
}else{
  boot();
}
