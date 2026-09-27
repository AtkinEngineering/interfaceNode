/* dynet_ui.js — DyNet UI, single script.
 *
 * Loaded at the end of <body> in dynet_ui.html, so the DOM is ready when it runs.
 * Sections, in load order (each can be worked on independently):
 *   1. SYSTEM BUILDER IMPORT  sbXmlToJob(): Dynalite System Builder job XML → UI config
 *   2. CORE                   DyNet 1 protocol, WebSocket, console, rooms, favourites, files
 *   3. CONFIG EDITOR          Config tab: site, favourites, rooms / buttons / channels
 *   4. THEME                  Theme tab: mode, presets, colours, background, shape, button icons
 *   5. ICON HELPERS           iconSvg(), icon picker (icon data: dynet_ui_icons.js)
 * Search for "§1".."§5" to jump between them.
 */

/* ========================================================================
 * §1  SYSTEM BUILDER IMPORT — Dynalite System Builder logical XML → UI config
 * ======================================================================== */

/* Philips Dynalite System Builder "Logical" XML export
 * → dynet_ui job JSON.
 *
 * Standalone: no dependency on the other sections. Exposes one function:
 *
 *   const { config, report } = sbXmlToJob(xmlText, options);
 *
 * `config` is a complete dynet_ui.json object ({version, site, job}).
 * `report` lists counts and anything that was skipped, with the reason.
 *
 * Mapping
 *   <Folder id="...">          → room (name = folder id), nested as in the file
 *   <Area name=".." id="..">   → room holding that area's controls
 *     <Preset name id>         → button  "preset": [area, preset, fade]
 *     <Channel name id>        → slider  "channel": [area, channel]
 *   Document order is kept, so the menu matches System Builder's tree.
 *
 * Only the <Preset> and <Channel> elements are used — <ChannelLevel>
 * (preset levels / excludes) is ignored.
 *
 * Area numbers: DyNet area = <Area id> − areaOffset (default 1000, so
 * id="1088" → area 88). Pass options.areaOffset; 'auto' picks 1000 when any
 * id is above 255, else 0.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    areaOffset: 1000,              // DyNet area = Area id − offset; 'auto' → 1000 if any id > 255, else 0
    fade: 2,                       // s, preset buttons (the export has no fade)
    includeDefaultPresets: true,   // false → drop presets still called "Preset N"
    includeSpareChannels: true,    // false → drop channels named *SPARE*
    includeChannels: true,         // add a slider per channel
    includeEmptyAreas: true,       // areas that end up with no buttons or sliders
    site: null,                    // {name, connection, port, path, binary} — kept from the current config if given
  };
  const MAX_PRESET = 2048;         // banked preset select: 8 × 256 banks
  const DEFAULT_PRESET_NAME = /^preset\s+\d+$/i;
  const SPARE_NAME = /\*+\s*spare\s*\*+/i;

  function sbXmlToJob(xmlText, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('XML parse error: ' + err.textContent.trim().split('\n')[0]);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'LogicalExport') throw new Error('not a System Builder logical export (root element is <' + (root && root.nodeName) + '>, expected <LogicalExport>)');

    const report = { areas: 0, rooms: 0, buttons: 0, sliders: 0, highPresets: 0, skipped: [], warnings: [] };

    // ---- area number offset ----
    const ids = [...root.getElementsByTagName('Area')].map(a => parseInt(a.getAttribute('id'), 10)).filter(n => !isNaN(n));
    let offset = opt.areaOffset;
    if (offset === 'auto') offset = ids.some(n => n > 255) ? 1000 : 0;
    offset = parseInt(offset, 10) || 0;
    report.areaOffset = offset;

    // ---- walk ----
    const walk = (el) => {
      const out = {};
      let nRoom = 0;
      for (const child of el.children) {
        if (child.nodeName === 'Folder') {
          const r = folderRoom(child);
          if (r) out['room-' + (++nRoom)] = r;
        } else if (child.nodeName === 'Area') {
          const r = areaRoom(child);
          if (r) out['room-' + (++nRoom)] = r;
        }
      }
      return out;
    };

    const folderRoom = (f) => {
      const name = f.getAttribute('id') || f.getAttribute('description') || 'Folder';
      const kids = walk(f);
      if (!Object.keys(kids).length) { report.skipped.push(`Folder "${name}": nothing controllable inside`); return null; }
      report.rooms++;
      return Object.assign({ name }, kids);
    };

    const areaRoom = (a) => {
      const name = a.getAttribute('name') || ('Area ' + a.getAttribute('id'));
      const sbId = parseInt(a.getAttribute('id'), 10);
      const area = sbId - offset;
      report.areas++;
      if (!(area >= 1 && area <= 255)) {
        report.skipped.push(`Area "${name}" (id ${sbId}): DyNet 1 area ${area} is outside 1–255`);
        return null;
      }
      // names like "Lounge (2)" carry the area number — cross-check the offset
      const m = name.match(/\((\d+)\)\s*$/);
      if (m && +m[1] !== area) report.warnings.push(`Area "${name}" (id ${sbId}) maps to area ${area}, but its name says ${m[1]}`);

      const room = { name, _area: area };
      let n = 0;

      for (const p of a.getElementsByTagName('Preset')) {
        const pid = parseInt(p.getAttribute('id'), 10);
        const pname = (p.getAttribute('name') || '').trim() || ('Preset ' + pid);
        if (!(pid >= 1)) continue;
        if (pid > MAX_PRESET) {   // Emergency 65530 / Panic 65534: outside DyNet 1 preset select (1–2048)
          report.highPresets++;
          continue;
        }
        if (!opt.includeDefaultPresets && DEFAULT_PRESET_NAME.test(pname)) continue;
        room['button-' + (++n)] = { name: pname, preset: [area, pid, opt.fade] };
        report.buttons++;
      }

      if (opt.includeChannels) {
        for (const c of a.getElementsByTagName('Channel')) {
          const cid = parseInt(c.getAttribute('id'), 10);
          const cname = (c.getAttribute('name') || '').trim() || ('Channel ' + cid);
          if (!(cid >= 1 && cid <= 255)) { report.skipped.push(`Area ${area} channel ${cid}: outside 1–255`); continue; }
          if (!opt.includeSpareChannels && SPARE_NAME.test(cname)) continue;
          room['slider-' + (++n)] = { name: cname, channel: [area, cid] };
          report.sliders++;
        }
      }

      if (!n && !opt.includeEmptyAreas) { report.skipped.push(`Area "${name}": no controls`); return null; }
      report.rooms++;
      return room;
    };

    const job = walk(root);
    if (report.highPresets) report.skipped.push(`${report.highPresets} presets numbered above ${MAX_PRESET} (Emergency 65530 / Panic 65534) — DyNet 1 preset select only reaches 1–${MAX_PRESET}`);
    const site = Object.assign({ name: root.getAttribute('job') || 'System Builder job', connection: '', port: 8080, path: '/ws', binary: true }, opt.site || {});
    if (root.getAttribute('job')) site.name = root.getAttribute('job');

    const config = {
      version: '1.0.0',
      _source: {
        from: 'Dynalite System Builder logical export',
        job: root.getAttribute('job') || '',
        exported: [root.getAttribute('date'), root.getAttribute('time')].filter(Boolean).join(' '),
        area_offset: offset,
        converted: new Date().toISOString(),
      },
      site,
      job,
    };
    return { config, report };
  }

  global.sbXmlToJob = sbXmlToJob;
  if (typeof module !== 'undefined' && module.exports) module.exports = { sbXmlToJob };
})(typeof window !== 'undefined' ? window : globalThis);

/* ========================================================================
 * §2  CORE — DyNet 1 protocol, WebSocket, console, rooms, file handling
 * ======================================================================== */

/* dynet_ui.js — DyNet UI logic.
 * Loaded at the end of <body> in dynet_ui.html, so the DOM is ready when this runs. */

/* ============================================================
 * DyNet 1 definitions — single place to adjust against the
 * DyNet Protocol Reference if anything differs.
 * ============================================================ */
const SYNC_LOGICAL = 0x1C, SYNC_PHYSICAL = 0x5C, SYNC_D2 = 0xAC;

const OP = {
  PRESET_1_4:  [0x00, 0x01, 0x02, 0x03],   // preset 1..4 within bank
  PRESET_5_8:  [0x0A, 0x0B, 0x0C, 0x0D],   // preset 5..8 within bank
  OFF:          0x04,
  REPORT_LEVEL: 0x60,
  REQ_LEVEL:    0x61,
  REPORT_PRESET:0x62,
  REQ_PRESET:   0x63,
  LINEAR_PRESET:0x65,
  RAMP_100MS:   0x71,   // channel to level, rate byte in 0.1 s steps (ref §3.3.15)
  FADE_1S:      0x72,   // 1 s steps
  FADE_1MIN:    0x73,   // 1 min steps
  SET_CH_FADE:  [0x80, 0x81, 0x82, 0x83],  // Set Channel 1–4 of a group of 4 to Level with Fade (ref §3.3)
  STOP_FADE:    0x76,
};

const OP_NAMES = {
  0x00:'Select',0x01:'Select',0x02:'Select',0x03:'Select',0x04:'Off',
  0x0A:'Select',0x0B:'Select',0x0C:'Select',0x0D:'Select',
  0x08:'Program preset',0x17:'Panic',0x18:'Un-panic',
  0x60:'Report channel level',0x61:'Request channel level',
  0x62:'Report preset',0x63:'Request preset',0x65:'Linear preset',
  0x71:'Channel level (0.1 s steps)',0x72:'Channel level (1 s steps)',0x73:'Channel level (1 min steps)',
  0x80:'Set channel level',0x81:'Set channel level',0x82:'Set channel level',0x83:'Set channel level',
  0x76:'Stop fade',
};

/* ---------- checksum / encoding helpers ---------- */
const d1Checksum = b => (-b.slice(0,7).reduce((a,c)=>a+c,0)) & 0xFF;
const d1Frame = b7 => { const f = b7.map(v=>v&0xFF); f.push(d1Checksum(f)); return f; };
const hex = arr => arr.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
const pctToByte = p => 0xFF - Math.round(Math.max(0,Math.min(100,p)) * 2.54);  // 100%→0x01, 0%→0xFF
const byteToPct = b => b === 0 ? 100 : Math.round((0xFF - b) / 2.54);

function fadeTicks20ms(sec){ return Math.max(0, Math.min(0xFFFF, Math.round(sec / 0.02))); }

function channelFade(sec){
  if (sec <= 25.5) return {op:OP.RAMP_100MS, v:Math.round(sec/0.1)};
  if (sec <= 255)  return {op:OP.FADE_1S,    v:Math.round(sec)};
  return {op:OP.FADE_1MIN, v:Math.min(255, Math.round(sec/60))};
}
const CH_FADE_UNIT = {0x71:0.1, 0x72:1, 0x73:60};
const fmtSec = s => s >= 60 ? `${(s/60).toFixed(s % 60 ? 1 : 0)} min` : `${s.toFixed(s < 10 ? 2 : 1)} s`;

/* ---------- frame builders ---------- */
function buildPreset(area, preset, fadeSec, join){
  const i = preset - 1, bank = Math.floor(i/8), idx = i % 8;
  const op = idx < 4 ? OP.PRESET_1_4[idx] : OP.PRESET_5_8[idx-4];
  const t = fadeTicks20ms(fadeSec);
  return d1Frame([SYNC_LOGICAL, area, t & 0xFF, op, t >> 8, bank, join]);
}
function buildLinearPreset(area, preset, fadeSec, join){   // presets 1–256
  const t = fadeTicks20ms(fadeSec);
  return d1Frame([SYNC_LOGICAL, area, (preset - 1) & 0xFF, OP.LINEAR_PRESET, t & 0xFF, t >> 8, join]);
}
function buildPresetFmt(area, preset, fadeSec, join){
  return $('presetFmt').value === 'linear'
    ? buildLinearPreset(area, Math.min(preset, 256), fadeSec, join)
    : buildPreset(area, preset, fadeSec, join);
}
function buildOff(area, fadeSec, join){
  const t = fadeTicks20ms(fadeSec);
  return d1Frame([SYNC_LOGICAL, area, t & 0xFF, OP.OFF, t >> 8, 0, join]);
}
function buildReqPreset(area, join){
  return d1Frame([SYNC_LOGICAL, area, 0, OP.REQ_PRESET, 0, 0, join]);
}
function buildChannel(area, chan, pct, fadeSec, join){   // chan 1-based, 0 = all
  const f = channelFade(fadeSec);
  return d1Frame([SYNC_LOGICAL, area, chan === 0 ? 0xFF : chan - 1, f.op, pctToByte(pct), f.v, join]);
}
function buildReqLevel(area, chan, join){
  return d1Frame([SYNC_LOGICAL, area, chan - 1, OP.REQ_LEVEL, 0, 0, join]);
}

/* ---------- decoding ---------- */
function decode(f){
  if (f[0] === SYNC_D2) return {type:'DyNet2', text:`DyNet 2, ${f.length} B, cmd 0x${f[2].toString(16).toUpperCase().padStart(2,'0')}`};
  if (f.length !== 8) return {type:'?', text:`${f.length} B (not a DyNet 1 frame)`};
  const ok = d1Checksum(f) === f[7];
  const cs = ok ? '' : ' [checksum BAD]';
  if (f[0] === SYNC_PHYSICAL) return {type:'D1-Phy', ok, text:`Physical dev 0x${f[1].toString(16).toUpperCase()} box ${f[2]} op 0x${f[3].toString(16).toUpperCase()}${cs}`};
  if (f[0] !== SYNC_LOGICAL) return {type:'?', ok, text:'Unknown sync'+cs};

  const area = f[1], op = f[3], join = f[6];
  const name = OP_NAMES[op] || `Opcode 0x${op.toString(16).toUpperCase().padStart(2,'0')}`;
  let detail = '';
  const presetIdx = OP.PRESET_1_4.indexOf(op) >= 0 ? OP.PRESET_1_4.indexOf(op) : (OP.PRESET_5_8.indexOf(op) >= 0 ? OP.PRESET_5_8.indexOf(op) + 4 : -1);
  if (presetIdx >= 0){
    const p = f[5]*8 + presetIdx + 1;
    detail = `Preset ${p} (op 0x${op.toString(16).toUpperCase().padStart(2,'0')}, bank ${f[5]+1}, P${presetIdx+1}), fade ${(((f[4]<<8)|f[2])*0.02).toFixed(2)} s`;
    updateState(area, {preset:p});
  } else if (op === OP.OFF){
    detail = `fade ${(((f[4]<<8)|f[2])*0.02).toFixed(2)} s`;
    updateState(area, {preset:'Off'});
  } else if (op === OP.LINEAR_PRESET){
    detail = `Preset ${f[2]+1} (bank ${Math.floor(f[2]/8)+1}, P${f[2]%8+1}), fade ${(((f[5]<<8)|f[4])*0.02).toFixed(2)} s`;
    updateState(area, {preset:f[2]+1});
  } else if (op === OP.REPORT_PRESET){
    detail = `= Preset ${f[2]+1}`;
    updateState(area, {preset:f[2]+1});
  } else if (OP.SET_CH_FADE.includes(op)){
    // byte2 = level, byte4 = channel offset, byte5 = fade (20 ms/unit)
    // offset 0xFF → ch 1–4, 0x00 → ch 5–8, 0x01 → ch 9–12 … (ref §3.3)
    const ch = ((f[4] + 1) & 0xFF) * 4 + (op - 0x80) + 1;
    detail = `Ch ${ch} → ${byteToPct(f[2])}% (op 0x${op.toString(16).toUpperCase()}, offset 0x${f[4].toString(16).toUpperCase().padStart(2,'0')}), fade ${fmtSec(f[5]*0.02)}`;
    updateState(area, {chan:[ch, byteToPct(f[2])]});
  } else if (op >= OP.RAMP_100MS && op <= OP.FADE_1MIN){
    const unit = CH_FADE_UNIT[op];
    const ch = f[2] === 0xFF ? 'all' : f[2]+1;
    detail = `Ch ${ch} → ${byteToPct(f[4])}%, fade ${fmtSec(f[5]*unit)}`;
    updateState(area, {chan:[f[2] === 0xFF ? 0 : f[2]+1, byteToPct(f[4])]});
  } else if (op === OP.REPORT_LEVEL){
    detail = `Ch ${f[2]+1} target ${byteToPct(f[4])}%, current ${byteToPct(f[5])}%`;
    updateState(area, {chan:[f[2]+1, byteToPct(f[4])]});   // target level: where the channel is heading
  } else if (op === OP.REQ_LEVEL){
    detail = `Ch ${f[2]+1}`;
  }
  const j = join !== 0xFF ? ` join 0x${join.toString(16).toUpperCase().padStart(2,'0')}` : '';
  return {type:'D1-Log', ok, text:`Area ${area}: ${name} ${detail}${j}${cs}`};
}

/* ---------- stream framing for RX (frames may arrive split or concatenated) ---------- */
let rxBuf = [];
function feed(bytes){
  rxBuf.push(...bytes);
  while (rxBuf.length){
    const s = rxBuf[0];
    if (s === SYNC_LOGICAL || s === SYNC_PHYSICAL){
      if (rxBuf.length < 8) return;
      emit(rxBuf.splice(0,8));
    } else if (s === SYNC_D2){
      if (rxBuf.length < 2) return;
      const len = 4*rxBuf[1] + 4;
      if (len < 12){ rxBuf.shift(); continue; }
      if (rxBuf.length < len) return;
      emit(rxBuf.splice(0,len));
    } else {
      rxBuf.shift();   // junk byte, resync
    }
  }
}
function emit(frame){ logFrame('RX', frame); }

/* ---------- log ---------- */
const logEl = document.getElementById('log');
let nTx = 0, nRx = 0, nBad = 0;
function ts(){ const d=new Date(); return d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0'); }
function logLine(dir, hexStr, text, cls, isD2){
  const div = document.createElement('div');
  div.className = 'ln';
  div.dataset.dir = dir; if (isD2) div.dataset.d2 = '1';
  div.innerHTML = `<span class="t">${ts()}</span><span class="d ${dir}">${dir}</span><span class="hex">${hexStr}</span><span class="dec ${cls||''}"></span>`;
  div.lastChild.textContent = text;
  applyFilter(div);
  logEl.appendChild(div);
  while (logEl.children.length > 2000) logEl.firstChild.remove();
  if (document.getElementById('autoscroll').checked) logEl.scrollTop = logEl.scrollHeight;
}
let decodingRx = false;
function logFrame(dir, frame){
  decodingRx = dir === 'RX';
  const d = decode(frame);
  decodingRx = false;
  if (dir === 'TX') nTx++; else nRx++;
  if (d.ok === false) nBad++;
  logLine(dir, frame.length > 16 ? hex(frame.slice(0,16))+' …' : hex(frame), d.text, d.ok === false ? 'bad' : '', d.type === 'DyNet2');
  document.getElementById('counts').textContent = `TX ${nTx} · RX ${nRx}` + (nBad ? ` · bad ${nBad}` : '');
}
function sys(msg){ logLine('SYS', '', msg); }
function applyFilter(el){
  const tx = document.getElementById('showTx').checked, rx = document.getElementById('showRx').checked, d2 = document.getElementById('showD2').checked;
  const dir = el.dataset.dir;
  el.style.display = (dir==='TX' && !tx) || (dir==='RX' && !rx) || (el.dataset.d2 && !d2) ? 'none' : '';
}
['showTx','showRx','showD2'].forEach(id => document.getElementById(id).addEventListener('change', () => [...logEl.children].forEach(applyFilter)));
document.getElementById('clearLog').onclick = () => { logEl.innerHTML=''; nTx=nRx=nBad=0; document.getElementById('counts').textContent=''; };

/* ---------- observed state ---------- */
const state = new Map();
function updateState(area, u){
  // both what we send (TX) and what arrives from the bus (RX) drive state
  const s = state.get(area) || {preset:'–', chans:new Map()};
  if (u.preset !== undefined){
    if (s.preset !== '–' && s.preset !== u.preset) onPresetChanged(area);   // a real change, not the first report
    s.preset = u.preset;
    if (typeof u.preset === 'number' && area === getArea() && $('followBank').checked) $('bank').value = Math.floor((u.preset-1)/8) + 1; if (pending.preset && pending.preset.area === area) pending.preset = null; }
  if (u.chan){
    const [c, l] = u.chan;
    if (c === 0){ s.chans.forEach((_, k) => s.chans.set(k, l)); s.all = l; }   // "all channels" message
    else s.chans.set(c, l);
    if (pending.chan && pending.chan.area === area) pending.chan = null;
  }
  state.set(area, s);
  const body = document.getElementById('stateBody');
  body.innerHTML = '';
  [...state.keys()].sort((a,b)=>a-b).forEach(a => {
    const st = state.get(a), tr = document.createElement('tr');
    const ch = [...st.chans.entries()].sort((x,y)=>x[0]-y[0]).map(([c,l])=>`${c}:${l}%`).join('  ') || '–';
    tr.innerHTML = `<td>${a}</td><td>${st.preset}</td><td style="font-family:var(--mono);font-size:12px"></td>`;
    tr.lastChild.textContent = ch;
    body.appendChild(tr);
  });
  refreshControls();
  refreshRoom();
}

/* ---------- WebSocket ---------- */
let ws = null;
const dot = document.getElementById('dot'), statusTxt = document.getElementById('statusTxt'), connectBtn = document.getElementById('connectBtn');
function setStatus(cls, txt){ dot.className = 'dot ' + cls; statusTxt.textContent = txt; }

let wantConnected = false, reconnectTimer = null;
function connect(){
  if (ws){ wantConnected = false; clearTimeout(reconnectTimer); ws.close(); return; }
  wantConnected = true;
  const url = `ws://${host.value.trim()}:${port.value.trim()}${path.value.trim()}`;
  setStatus('wait', 'Connecting…'); sys('Connecting to ' + url);
  try { ws = new WebSocket(url); } catch(e){ setStatus('err', 'Bad URL'); sys(String(e)); ws = null; return; }
  ws.binaryType = 'arraybuffer';
  connectBtn.textContent = 'Disconnect';
  ws.onopen = () => { setStatus('on', 'Connected'); sys('Connected'); save(); requestRoomState(); };
  ws.onclose = e => {
    setStatus(e.wasClean ? '' : 'err', 'Disconnected'); sys(`Closed (code ${e.code})`);
    ws = null; connectBtn.textContent = 'Connect'; rxBuf = []; txQueue.length = 0;
    if (wantConnected){ setStatus('wait', 'Reconnecting…'); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { if (!ws && wantConnected){ wantConnected = false; connect(); } }, 3000); }
  };
  ws.onerror = () => setStatus('err', 'Error');
  ws.onmessage = e => {
    if (e.data instanceof ArrayBuffer) feed([...new Uint8Array(e.data)]);
    else {
      const b = parseHex(e.data);
      if (b) feed(b); else sys('Text: ' + e.data);
    }
  };
}
connectBtn.onclick = () => { if (!ws && reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer = null; wantConnected = false; setStatus('', 'Disconnected'); return; } connect(); };

function send(frame){
  if (!ws || ws.readyState !== WebSocket.OPEN){ sys('Not connected — frame not sent: ' + hex(frame)); return false; }
  if (fmt.value === 'binary') ws.send(new Uint8Array(frame));
  else ws.send(hex(frame));
  logFrame('TX', frame);
  return true;
}

/* Status requests go through a paced queue so a room with many
 * controls doesn't burst the bus. */
const txQueue = []; let txTimer = null;
const TX_GAP_MS = 80;
function queueSend(frame){
  if (txQueue.some(f => f.join() === frame.join())) return;   // drop duplicates already waiting
  txQueue.push(frame);
  if (!txTimer) pumpQueue();
}
function pumpQueue(){
  const f = txQueue.shift();
  if (!f){ txTimer = null; return; }
  if (ws && ws.readyState === WebSocket.OPEN) send(f);
  txTimer = setTimeout(pumpQueue, TX_GAP_MS);
}

function parseHex(s){
  const t = s.replace(/0x/gi,'').replace(/[^0-9a-f]/gi,' ').trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  const out = [];
  for (const p of parts){
    if (p.length > 2 && p.length % 2 === 0){ for (let i=0;i<p.length;i+=2) out.push(parseInt(p.substr(i,2),16)); }
    else if (p.length <= 2) out.push(parseInt(p,16));
    else return null;
  }
  return out.some(isNaN) ? null : out;
}

/* ---------- UI wiring ---------- */
const $ = id => document.getElementById(id);
const clampInt = (v, lo, hi, d) => { v = parseInt(v,10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
const getArea = () => clampInt($('area').value, 1, 255, 1);
const getJoin = () => { const v = parseInt($('join').value, 16); return isNaN(v) ? 0xFF : v & 0xFF; };
const getFade = () => Math.max(0, parseFloat($('fade').value) || 0);
const getChan = () => $('chanAll').checked ? 0 : clampInt($('chan').value, 1, 255, 1);

const presetBtns = $('presetBtns');
const getBank = () => clampInt($('bank').value, 1, 256, 1) - 1;   // 0-based
const btnPreset = i => getBank()*8 + i + 1;
for (let i = 0; i < 8; i++){
  const b = document.createElement('button');
  b.onclick = () => { const p = btnPreset(i); if (send(buildPresetFmt(getArea(), p, getFade(), getJoin()))) setPending('preset', p); };
  presetBtns.appendChild(b);
}
function labelPresetBtns(){
  [...presetBtns.children].forEach((b,i) => {
    const p = btnPreset(i);
    b.textContent = getBank() ? `P${p}` : `P${i+1}`;
    b.title = `Preset ${p} (bank ${getBank()+1}, P${i+1})`;
    b.disabled = $('presetFmt').value === 'linear' && p > 256;
  });
}
/* ---------- controls follow RX feedback ----------
 * A button lights when it is pressed (the TX frame updates state) and
 * also whenever that state is seen on the bus from any other source (RX),
 * e.g. a wall panel selecting a different preset. */
const pending = {preset:null, chan:null};
const pendTimers = {};
function setPending(kind, value){
  pending[kind] = {area:getArea(), value};
  clearTimeout(pendTimers[kind]);
  pendTimers[kind] = setTimeout(() => { pending[kind] = null; refreshControls(); }, 3000);
  refreshControls();
}
let dragging = false;
function refreshControls(){
  const area = getArea(), st = state.get(area);
  const cur = st ? st.preset : null;
  const pend = pending.preset && pending.preset.area === area ? pending.preset.value : null;
  labelPresetBtns();
  [...presetBtns.children].forEach((b,i) => {
    const p = btnPreset(i);
    b.classList.toggle('active', cur === p);
    b.classList.toggle('pending', pend === p && cur !== p);
  });
  $('presetOff').classList.toggle('active', cur === 'Off');
  $('presetOff').classList.toggle('pending', pend === 'Off' && cur !== 'Off');
  const ni = clampInt($('presetNum').value,1,2048,1);
  $('presetGo').classList.toggle('active', cur === ni);
  $('presetGo').classList.toggle('pending', pend === ni && cur !== ni);

  // channel: slider + 100%/0% follow reported level for the selected channel
  let lvl;
  if (st){ lvl = $('chanAll').checked ? st.all : st.chans.get(getChan()); if (lvl === undefined && !$('chanAll').checked) lvl = st.all; }
  const pc = pending.chan && pending.chan.area === area ? pending.chan.value : null;
  if (lvl !== undefined && !dragging){ level.value = lvl; levelOut.textContent = lvl + '%'; }
  $('levelOut').style.color = lvl === undefined ? 'var(--muted)' : '';
  $('chanOn').classList.toggle('active', lvl === 100);
  $('chanOff').classList.toggle('active', lvl === 0);
  $('chanOn').classList.toggle('pending', pc === 100 && lvl !== 100);
  $('chanOff').classList.toggle('pending', pc === 0 && lvl !== 0);
  $('chanSet').classList.toggle('pending', pc !== null && pc !== 100 && pc !== 0 && lvl !== pc);
  updatePreviews();
}

$('presetGo').onclick = () => {
  const p = clampInt($('presetNum').value,1,2048,1);
  if ($('presetFmt').value === 'linear' && p > 256){ sys('Linear preset (0x65) only reaches presets 1–256'); return; }
  if (send(buildPresetFmt(getArea(), p, getFade(), getJoin()))) setPending('preset', p);
};
['bank','presetFmt'].forEach(id => $(id).addEventListener('input', refreshControls));
$('presetOff').onclick = () => { if (send(buildOff(getArea(), getFade(), getJoin()))) setPending('preset', 'Off'); };
$('presetReq').onclick = () => send(buildReqPreset(getArea(), getJoin()));

const level = $('level'), levelOut = $('levelOut');
let liveTimer = null;
level.oninput = () => {
  dragging = true;
  levelOut.textContent = level.value + '%'; updatePreviews();
  if ($('liveSlider').checked){
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { if (send(buildChannel(getArea(), getChan(), +level.value, 0.1, getJoin()))) setPending('chan', +level.value); }, 80);
  }
};
level.onchange = () => { dragging = false; };
function sendLevel(pct){ if (send(buildChannel(getArea(), getChan(), pct, getFade(), getJoin()))) setPending('chan', pct); }
$('chanSet').onclick = () => { dragging = false; sendLevel(+level.value); };
$('chanOn').onclick  = () => sendLevel(100);
$('chanOff').onclick = () => sendLevel(0);
$('chanReq').onclick = () => {
  if ($('chanAll').checked){ sys('Request level needs a single channel'); return; }
  send(buildReqLevel(getArea(), getChan(), getJoin()));
};
$('chanAll').onchange = () => { $('chan').disabled = $('chanAll').checked; refreshControls(); };

$('rawSend').onclick = () => {
  const b = parseHex($('raw').value);
  if (!b || b.length < 7){ sys('Raw: need 7 hex bytes'); return; }
  if (b.length === 8) send(b);             // already has a checksum — send as-is
  else send(d1Frame(b.slice(0,7)));
};

function updatePreviews(){
  const p = clampInt($('presetNum').value,1,2048,1);
  $('presetPreview').textContent = `Preset ${p}: ` + hex(buildPresetFmt(getArea(), p, getFade(), getJoin()));
  $('chanPreview').textContent = `Level: ` + hex(buildChannel(getArea(), getChan(), +level.value, getFade(), getJoin()));
}
['join','fade'].forEach(id => $(id).addEventListener('input', updatePreviews));
['presetNum','chan'].forEach(id => $(id).addEventListener('input', refreshControls));
// switching area re-reads its state; ask the bus for its current preset
let areaTimer = null;
$('area').addEventListener('input', () => {
  refreshControls();
  clearTimeout(areaTimer);
  areaTimer = setTimeout(() => { if (ws && ws.readyState === WebSocket.OPEN) send(buildReqPreset(getArea(), getJoin())); }, 400);
});

/* ============================================================
 * Rooms — built from dynet_ui.json
 *
 * Any object under "job" is a room. Inside a room:
 *   { "name": ..., "preset": [area, preset, fade] }   → button
 *   { "name": ..., "channel": [area, channel, fade?] } → slider
 *   any other object with children                    → sub-room
 * Keys starting with "_" are ignored. Order follows the file.
 * "enabled": false on a button, slider or room hides it (kept in the file).
 * ============================================================ */
const CONFIG_FILE = 'dynet_ui.json';
const SLIDER_FADE_DEFAULT = 0.5;       // s, when a channel entry has no 3rd element
const LEVEL_REQ_DELAY_MS = 300;        // after a preset change, before asking for channel levels
let config = null, rooms = [], roomIndex = new Map(), selectedRoom = null;

function parseRoom(key, obj, path){
  const room = {key, path:[...path, key], name: obj.name || key, controls: [], children: []};
  for (const [k, v] of Object.entries(obj)){
    if (k.startsWith('_') || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (v.enabled === false) continue;
    if (Array.isArray(v.preset)){
      const [area, preset, fade] = v.preset.map(Number);
      if (area >= 1 && area <= 255 && preset >= 1) room.controls.push({type:'button', key:k, name:v.name || k, area, preset, fade: isNaN(fade) ? 2 : fade, icon: v.icon || '', show: v.show || ''});
      else sys(`Config: ${room.path.join('/')}/${k} has an invalid preset [area, preset, fade]`);
    } else if (Array.isArray(v.channel)){
      const [area, channel, fade] = v.channel.map(Number);
      if (area >= 1 && area <= 255 && channel >= 1 && channel <= 255) room.controls.push({type:'slider', key:k, name:v.name || k, area, channel, fade: isNaN(fade) ? SLIDER_FADE_DEFAULT : fade, icon: v.icon || ''});
      else sys(`Config: ${room.path.join('/')}/${k} has an invalid channel [area, channel]`);
    } else {
      room.children.push(parseRoom(k, v, room.path));
    }
  }
  room.controls.forEach(c => { c.ref = room.path.join('/') + '#' + c.key; c.roomName = room.name; });
  return room;
}
function allRooms(list, out = []){ list.forEach(r => { out.push(r); allRooms(r.children, out); }); return out; }
function controlsIn(room){ return [room, ...allRooms(room.children)].flatMap(r => r.controls); }

function applyConfig(cfg, source){
  if (!cfg || typeof cfg !== 'object' || !cfg.job || typeof cfg.job !== 'object') throw new Error('missing "job" section');
  config = cfg;
  rooms = parseJob(cfg.job);
  roomIndex = new Map(allRooms(rooms).map(r => [r.path.join('/'), r]));

  const site = cfg.site || {};
  $('siteName').textContent = site.name || 'DyNet UI';
  document.title = site.name ? `${site.name} — DyNet UI` : 'DyNet UI';
  if (site.connection) $('host').value = site.connection;
  if (site.port) $('port').value = site.port;
  if (site.path) $('path').value = site.path;
  if (site.binary !== undefined) $('fmt').value = site.binary ? 'binary' : 'hex';
  $('cfgInfo').textContent = `UI configuration: ${source}` + (cfg.version ? ` · v${cfg.version}` : '') + ` · ${roomIndex.size} room${roomIndex.size === 1 ? '' : 's'}`;
  sys(`Loaded configuration (${source}), ${roomIndex.size} rooms`);

  $('cfgSave').disabled = false;
  setDirty(false);
  buildMenu();
  let want = null;
  try { want = decodeURIComponent(location.hash.slice(1)) || localStorage.getItem('dynet1room'); } catch(e){}
  selectRoom(want === FAV || roomIndex.has(want) ? want : (rooms[0] ? rooms[0].path.join('/') : null));
  if (typeof editorLoad === 'function') editorLoad();
  if (typeof themeLoad === 'function') themeLoad();

  // (re)connect to the site in the file
  if (ws){ wantConnected = false; ws.close(); }
  setTimeout(() => { if (!ws && site.connection) connect(); }, 50);
}

function parseJob(job){
  return Object.entries(job || {}).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && v.enabled !== false).map(([k, v]) => parseRoom(k, v, []));
}

/* Called by the config editor after every change: rebuild the Rooms view
 * from `config` in place (no reconnect), remember it in this browser and
 * flag it as unsaved. */
function commitConfig(){
  if (!config) return;
  const keep = selectedRoom ? selectedRoom.path.join('/') : null;
  rooms = parseJob(config.job);
  roomIndex = new Map(allRooms(rooms).map(r => [r.path.join('/'), r]));
  const site = config.site || {};
  $('siteName').textContent = site.name || 'DyNet UI';
  document.title = site.name ? `${site.name} — DyNet UI` : 'DyNet UI';
  buildMenu();
  selectedRoom = keep === FAV ? favRoom() : (keep && roomIndex.get(keep)) || rooms[0] || null;
  const p = selectedRoom ? selectedRoom.path.join('/') : null;
  document.querySelectorAll('#roomMenu a').forEach(a => a.classList.toggle('sel', a.dataset.path === p));
  renderRoom();
  updateMenuCurrent();
  try { localStorage.setItem('dynet1configAt', Date.now()); localStorage.setItem('dynet1config', JSON.stringify(config)); } catch(e){}
  setDirty(true);
}
let dirty = false;
function setDirty(d){
  dirty = d;
  $('cfgDirty').hidden = !d;
  $('cfgSave').textContent = d ? 'Save UI config (.json) •' : 'Save UI config (.json)';
}
window.addEventListener('beforeunload', e => { if (dirty){ e.preventDefault(); e.returnValue = ''; } });

/* collapsed folders in the Rooms menu, remembered per browser */
let collapsed = new Set();
try { collapsed = new Set(JSON.parse(localStorage.getItem('dynet1collapsed') || '[]')); } catch(e){}
function toggleCollapsed(path, li, caret){
  if (collapsed.has(path)) collapsed.delete(path); else collapsed.add(path);
  li.classList.toggle('collapsed', collapsed.has(path));
  caret.textContent = collapsed.has(path) ? '▸' : '▾';
  try { localStorage.setItem('dynet1collapsed', JSON.stringify([...collapsed])); } catch(e){}
}

function buildMenu(){
  const nav = $('roomMenu');
  nav.innerHTML = '';
  if (!rooms.length){ nav.innerHTML = '<div class="empty">No rooms in configuration</div>'; return; }
  const mk = list => {
    const ul = document.createElement('ul');
    list.forEach(r => {
      const li = document.createElement('li'), row = document.createElement('div'), a = document.createElement('a');
      const path = r.path.join('/'), caret = document.createElement('span');
      row.className = 'mrow';
      caret.className = 'caret' + (r.children.length ? '' : ' none');
      a.textContent = r.name; a.dataset.path = path;
      a.onclick = () => selectRoom(path);
      row.append(caret, a); li.appendChild(row);
      if (r.children.length){
        a.classList.add('parent');
        caret.textContent = collapsed.has(path) ? '▸' : '▾';
        caret.title = 'Show / hide the rooms inside';
        caret.onclick = e => { e.stopPropagation(); toggleCollapsed(path, li, caret); };
        li.classList.toggle('collapsed', collapsed.has(path));
        li.appendChild(mk(r.children));
      }
      ul.appendChild(li);
    });
    return ul;
  };
  // ★ Favourites always sits at the top
  const fav = document.createElement('a');
  fav.textContent = '★ Favourites' + (favRefs().length ? ` (${favRefs().length})` : '');
  fav.dataset.path = FAV; fav.className = 'fav-link';
  fav.onclick = () => selectRoom(FAV);
  const favRow = document.createElement('div'); favRow.className = 'mrow';
  const sp = document.createElement('span'); sp.className = 'caret none';
  favRow.append(sp, fav);
  nav.appendChild(favRow);
  nav.appendChild(mk(rooms));
}

/* ---------- favourites ----------
 * config.favorites = ["room-2/room-1#button-1", "room-3#slider-4", …]
 * (room path # control key). Toggled with the ☆ on any control; ordered and
 * removed in Config → Favourites. Refs that no longer resolve are skipped. */
const FAV = '★';
const favRefs = () => (config && Array.isArray(config.favorites)) ? config.favorites : [];
function favControls(){
  return favRefs().map(ref => {
    const [p, k] = ref.split('#');
    const r = roomIndex.get(p);
    return r && r.controls.find(c => c.key === k);
  }).filter(Boolean);
}
function favRoom(){ return {key: FAV, path: [FAV], name: 'Favourites', controls: favControls(), children: [], fav: true}; }
function toggleFav(c){
  if (!config) return;
  const list = config.favorites = favRefs().slice();
  const i = list.indexOf(c.ref);
  if (i >= 0) list.splice(i, 1); else list.push(c.ref);
  commitConfig();
}
function starFor(c){
  const s = document.createElement('span');
  const on = favRefs().includes(c.ref);
  s.className = 'star' + (on ? ' on' : '');
  s.textContent = on ? '★' : '☆';
  s.title = on ? 'Remove from favourites' : 'Add to favourites';
  s.onclick = e => { e.stopPropagation(); e.preventDefault(); toggleFav(c); };
  return s;
}

/* phone drawer for the room tree; keep it just under the (possibly wrapped) header */
function syncHeaderH(){ document.documentElement.style.setProperty('--header-h', document.querySelector('header').offsetHeight + 'px'); }
window.addEventListener('resize', syncHeaderH); syncHeaderH();
function setMenuOpen(open){
  $('roomsView').classList.toggle('menu-open', open);
  $('menuToggle').setAttribute('aria-expanded', open);
}
$('menuToggle').onclick = () => setMenuOpen(!$('roomsView').classList.contains('menu-open'));
function updateMenuCurrent(){
  $('menuCurrent').textContent = selectedRoom ? (selectedRoom.fav ? '★ Favourites' : crumbsOf(selectedRoom.path)) : '—';
}
function crumbsOf(path){ return path.map((k,i) => (roomIndex.get(path.slice(0,i+1).join('/')) || {name:k}).name).join(' › '); }

function selectRoom(path){
  setMenuOpen(false);
  selectedRoom = path === FAV ? favRoom() : path ? roomIndex.get(path) : null;
  document.querySelectorAll('#roomMenu a').forEach(a => a.classList.toggle('sel', a.dataset.path === path));
  try { localStorage.setItem('dynet1room', path || ''); history.replaceState(null, '', '#' + encodeURIComponent(path || '')); } catch(e){}
  renderRoom();
  updateMenuCurrent();
  requestRoomState();
}

// the selected room plus every sub-room below it, each as its own card
function renderRoom(){
  const box = $('roomContent');
  box.innerHTML = '';
  if (!selectedRoom){ box.innerHTML = '<section class="empty">No rooms yet — load, import or build one in the <b>Config</b> tab</section>'; return; }
  const crumbs = path => path.map((k,i) => (roomIndex.get(path.slice(0,i+1).join('/')) || {name:k}).name).join(' › ');
  let cards;
  if (selectedRoom.fav){
    // one card per source room, in favourites order
    const groups = new Map();
    selectedRoom.controls.forEach(c => {
      const p = c.ref.split('#')[0];
      if (!groups.has(p)) groups.set(p, {name: c.roomName, sub: crumbs(p.split('/').slice(0,-1)), controls: []});
      groups.get(p).controls.push(c);
    });
    cards = [...groups.values()];
    if (!cards.length){ box.innerHTML = '<section class="empty">No favourites yet — tap the ☆ on any button or slider to pin it here</section>'; refreshRoom(); return; }
  } else {
    cards = [selectedRoom, ...allRooms(selectedRoom.children)].filter(r => r.controls.length)
      .map(r => ({name: r.name, sub: r === selectedRoom ? '' : crumbs(r.path.slice(0,-1)), controls: r.controls}));
  }
  if (!cards.length){ box.innerHTML = '<section class="empty">This room has no controls</section>'; return; }
  cards.forEach(r => {
    const sec = document.createElement('section');
    sec.className = 'room-card';
    const h = document.createElement('h2'); h.textContent = r.name; sec.appendChild(h);
    if (r.sub){ const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = r.sub; sec.appendChild(sub); }
    const btns = r.controls.filter(c => c.type === 'button');
    if (btns.length){
      const g = document.createElement('div'); g.className = 'ctl-buttons';
      btns.forEach(c => {
        const b = document.createElement('button');
        const ip = iconPrefs(), show = c.icon && iconSvg(c.icon) ? (c.show || ip.show) : 'text';
        if (show !== 'text'){ const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = iconSvg(c.icon); b.appendChild(ic); }
        if (show !== 'icon'){ const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = c.name; b.appendChild(tx); }
        b.className = 'show-' + show + (show === 'both' ? ' pos-' + ip.pos : '');
        b.title = `${show === 'icon' ? c.name + ' — ' : ''}Area ${c.area}, preset ${c.preset}, fade ${c.fade} s`;
        b.onclick = () => send(buildPresetFmt(c.area, c.preset, c.fade, 0xFF));
        b.appendChild(starFor(c));
        c.el = b; g.appendChild(b);
      });
      sec.appendChild(g);
    }
    r.controls.filter(c => c.type === 'slider').forEach(c => {
      const wrap = document.createElement('div'); wrap.className = 'ctl-slider unknown';
      wrap.innerHTML = '<div class="lbl"><span></span><span>–</span></div><input type="range" min="0" max="100" value="0">';
      wrap.querySelector('.lbl span').textContent = c.name;
      if (c.icon && iconSvg(c.icon)){ const ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = iconSvg(c.icon); wrap.querySelector('.lbl span').prepend(ic); }
      wrap.querySelector('.lbl span').prepend(starFor(c));
      wrap.title = `Area ${c.area}, channel ${c.channel}`;
      const rng = wrap.querySelector('input'), out = wrap.querySelector('.lbl > span:last-child');
      let t = null, last = null;
      const push = () => { if (+rng.value !== last){ last = +rng.value; send(buildChannel(c.area, c.channel, last, c.fade, 0xFF)); } };
      rng.oninput = () => { c.dragging = true; out.textContent = rng.value + '%'; if (!t) t = setTimeout(() => { t = null; push(); }, 200); };
      rng.onchange = () => { clearTimeout(t); t = null; push(); c.dragging = false; };
      c.el = wrap; c.rng = rng; c.out = out;
      sec.appendChild(wrap);
    });
    box.appendChild(sec);
  });
  refreshRoom();
}

// light buttons / move sliders from observed state
function refreshRoom(){
  if (!selectedRoom) return;
  controlsIn(selectedRoom).forEach(c => {
    if (!c.el) return;
    const st = state.get(c.area);
    if (c.type === 'button'){
      c.el.classList.toggle('active', !!st && st.preset === c.preset);
    } else {
      let lvl = st ? st.chans.get(c.channel) : undefined;
      if (lvl === undefined && st) lvl = st.all;
      c.el.classList.toggle('unknown', lvl === undefined);
      if (lvl !== undefined && !c.dragging){ c.rng.value = lvl; c.out.textContent = lvl + '%'; }
    }
  });
}

// on room load / connect: ask each area for its preset, each slider for its level
function requestRoomState(){
  if (!selectedRoom || !ws || ws.readyState !== WebSocket.OPEN) return;
  const ctl = controlsIn(selectedRoom);
  [...new Set(ctl.map(c => c.area))].forEach(a => queueSend(buildReqPreset(a, 0xFF)));
  ctl.filter(c => c.type === 'slider').forEach(c => queueSend(buildReqLevel(c.area, c.channel, 0xFF)));
}

// when an area's preset changes, re-read the levels of any slider in that area on screen
const levelReqTimers = new Map();
function onPresetChanged(area){
  if (!selectedRoom) return;
  const sliders = controlsIn(selectedRoom).filter(c => c.type === 'slider' && c.area === area);
  if (!sliders.length) return;
  clearTimeout(levelReqTimers.get(area));
  levelReqTimers.set(area, setTimeout(() => sliders.forEach(c => queueSend(buildReqLevel(c.area, c.channel, 0xFF))), LEVEL_REQ_DELAY_MS));
}

/* ---------- loading the JSON ----------
 * 1. fetch() next to the page — works when served over http(s)
 * 2. otherwise (file://) use the last file picked, cached in this browser
 * 3. "Load file…" button or drag-and-drop a .json onto the page */
async function loadConfig(){
  try {
    const r = await fetch(CONFIG_FILE + '?t=' + Date.now(), {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const cfg = await r.json();
    applyConfig(cfg, CONFIG_FILE);
    try { localStorage.setItem('dynet1configAt', Date.now()); localStorage.setItem('dynet1config', JSON.stringify(cfg)); } catch(e){}
    return;
  } catch(e){
    sys(`Could not read ${CONFIG_FILE} (${e.message}) — browsers block this when the page is opened as a file`);
  }
  // opened as a file: fall back to the copy this browser remembered —
  // unless the page was opened with ?fresh, or "Clear cached" was used
  const fresh = new URLSearchParams(location.search).has('fresh');
  try {
    const cached = fresh ? null : localStorage.getItem('dynet1config');
    if (cached){
      const when = localStorage.getItem('dynet1configAt');
      applyConfig(JSON.parse(cached), 'cached copy' + (when ? ' from ' + new Date(+when).toLocaleString() : '') + ' — change it in the Config tab');
      return;
    }
  } catch(e){ sys('Cached configuration unreadable: ' + e.message); }
  $('cfgInfo').textContent = `UI configuration: not loaded — open Config → "Open UI config (.json)…", or import a System Builder job`;
  renderRoom();
}
function loadFromFile(file){
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const text = String(rd.result);
      if (/\.xml$/i.test(file.name) || text.trimStart().startsWith('<')) importSystemBuilder(text, file.name);
      else {
        const cfg = JSON.parse(text);
        applyConfig(cfg, file.name);
        try { localStorage.setItem('dynet1configAt', Date.now()); localStorage.setItem('dynet1config', text); } catch(e){}
      }
    } catch(e){ sys(`${file.name}: ${e.message}`); $('cfgInfo').textContent = `Configuration error in ${file.name}: ${e.message}`; }
  };
  rd.readAsText(file);
}

/* ---------- System Builder XML → job JSON (§1) ----------
 * Keeps the current connection settings; the export has none. */
function importSystemBuilder(xml, fileName){
  if (typeof sbXmlToJob !== 'function') throw new Error('System Builder import section (§1) is missing');
  const site = {
    connection: $('host').value.trim(), port: +$('port').value || 8080,
    path: $('path').value.trim() || '/ws', binary: $('fmt').value === 'binary',
  };
  const areaOffset = Math.max(0, parseInt($('sbOffset').value, 10) || 0);
  const { config: cfg, report } = sbXmlToJob(xml, { site, areaOffset });
  sys(`${fileName}: ${report.areas} areas → ${report.rooms} rooms, ${report.buttons} buttons, ${report.sliders} sliders (area offset ${report.areaOffset})`);
  report.warnings.forEach(w => sys('Import warning: ' + w));
  report.skipped.forEach(w => sys('Import skipped: ' + w));
  applyConfig(cfg, `imported from System Builder job ${fileName}`);
  try { localStorage.setItem('dynet1configAt', Date.now()); localStorage.setItem('dynet1config', JSON.stringify(cfg)); } catch(e){}
  saveConfigFile();   // offer the JSON so it can sit next to the page from now on
}

function saveConfigFile(){
  if (!config) return;
  setDirty(false);
  const blob = new Blob([JSON.stringify(config, null, 2) + '\n'], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = CONFIG_FILE;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('cfgSave').onclick = saveConfigFile;
$('cfgPick').onclick = () => $('cfgFile').click();
$('cfgFile').onchange = e => { if (e.target.files[0]) loadFromFile(e.target.files[0]); e.target.value = ''; };
$('sbPick').onclick = () => { if (dirty && !confirm('Importing replaces the current UI configuration, which has unsaved changes. Continue?')) return; $('sbFile').click(); };
$('sbFile').onchange = e => { if (e.target.files[0]) loadFromFile(e.target.files[0]); e.target.value = ''; };
$('cfgReload').onclick = loadConfig;
$('cfgForget').onclick = () => {
  try { ['dynet1config','dynet1configAt','dynet1room'].forEach(k => localStorage.removeItem(k)); } catch(e){}
  location.replace(location.pathname);   // reload without the #room so nothing old is restored
};
document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drop'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
document.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) loadFromFile(f); });

/* ---------- view tabs ---------- */
function showView(v){
  ['rooms','config','theme','console'].forEach(n => {
    $(n + 'View').hidden = v !== n;
    $('tab' + n[0].toUpperCase() + n.slice(1)).classList.toggle('on', v === n);
  });
  if (v === 'config' && typeof editorLoad === 'function') editorLoad();
}
$('tabRooms').onclick = () => showView('rooms');
$('tabConsole').onclick = () => showView('console');
$('tabConfig').onclick = () => showView('config');
$('tabTheme').onclick = () => showView('theme');

/* ---------- remember connection + addressing (per browser) ---------- */
const KEEP = ['host','port','path','fmt','area','join','fade','presetFmt','sbOffset'];
function save(){ try { localStorage.setItem('dynet1console', JSON.stringify(Object.fromEntries(KEEP.map(k=>[k,$(k).value])))); } catch(e){} }
try { const s = JSON.parse(localStorage.getItem('dynet1console')||'{}'); KEEP.forEach(k => { if (s[k] != null) $(k).value = s[k]; }); } catch(e){}
KEEP.forEach(k => $(k).addEventListener('change', save));
if (location.hostname && location.protocol.startsWith('http')) $('host').value = location.hostname;

refreshControls();
sys('Ready.');
loadConfig();

/* ========================================================================
 * §3  CONFIG EDITOR — Config tab
 * ======================================================================== */

/* Config tab: edit the job in place.
 *
 * Works directly on the loaded `config` object (same JSON as
 * dynet_ui.json) and calls commitConfig() after every change, which
 * rebuilds the Rooms view, keeps a copy in this browser and flags it unsaved.
 * "Save UI config" writes the file.
 *
 * Uses the CORE section's globals:
 *   config, commitConfig(), applyConfig(), setDirty(), connect(), ws, $, sys
 *
 * JSON conventions kept by the editor
 *   room    : { "name": "...", <rooms/buttons/channels in display order> }
 *   button  : { "name": "...", "preset":  [area, preset, fade] }
 *   channel : { "name": "...", "channel": [area, channel(, fade)] }
 *   "enabled": false on any of them hides it without deleting it.
 *   New keys are room-N / button-N / slider-N (next free N in that room).
 */
(function () {
  'use strict';

  let edPath = [];                 // keys from config.job down to the selected room
  let edCollapsed = new Set();
  try { edCollapsed = new Set(JSON.parse(localStorage.getItem('dynet1edcollapsed') || '[]')); } catch (e) {}

  /* ---------- helpers on the raw JSON ---------- */
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const kind = v => !isObj(v) ? null : Array.isArray(v.preset) ? 'button' : Array.isArray(v.channel) ? 'slider' : 'room';
  const entries = (obj, k) => Object.entries(obj).filter(([key, v]) => !key.startsWith('_') && kind(v) === k);
  const node = path => path.reduce((o, k) => (o && isObj(o[k]) ? o[k] : null), config && config.job);
  const parentOf = path => path.length > 1 ? node(path.slice(0, -1)) : config.job;
  const clamp = (v, lo, hi, d) => { v = Number(v); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  function nextKey(obj, prefix) {
    let n = 0;
    Object.keys(obj).forEach(k => { const m = k.match(new RegExp('^' + prefix + '-(\\d+)$')); if (m) n = Math.max(n, +m[1]); });
    return prefix + '-' + (n + 1);
  }
  // reorder keys in place (object identity is kept, the parent still points at it)
  function reorder(obj, keys) {
    const saved = keys.map(k => [k, obj[k]]);
    keys.forEach(k => delete obj[k]);
    saved.forEach(([k, v]) => { obj[k] = v; });
  }
  // move `key` past the neighbouring entry of the same kind
  function move(obj, key, dir) {
    const all = Object.keys(obj);
    const same = all.filter(k => !k.startsWith('_') && kind(obj[k]) === kind(obj[key]));
    const i = same.indexOf(key), j = i + dir;
    if (j < 0 || j >= same.length) return false;
    const a = all.indexOf(key), b = all.indexOf(same[j]);
    [all[a], all[b]] = [all[b], all[a]];
    reorder(obj, all);
    return true;
  }
  // area to suggest for new controls: the room's _area, else its first control, else 1
  function roomArea(room) {
    if (room._area) return room._area;
    const c = Object.values(room).find(v => kind(v) === 'button' || kind(v) === 'slider');
    return c ? (c.preset || c.channel)[0] : 1;
  }

  function changed({ tree = false, form = false } = {}) {
    commitConfig();
    renderFavs();
    if (tree) renderTree();
    if (form) renderRoomForm();
  }

  /* ---------- entry point, called by the console on load / tab switch ---------- */
  window.editorLoad = function () {
    renderSite();
    renderFavs();
    if (!config) { $('edTree').innerHTML = ''; $('edRoom').innerHTML = '<div class="empty">Load or import a configuration, or press New</div>'; return; }
    if (!node(edPath)) {
      const first = Object.keys(config.job).find(k => kind(config.job[k]) === 'room');
      edPath = first ? [first] : [];
    }
    renderTree();
    renderRoomForm();
  };

  /* ---------- site ---------- */
  function renderSite() {
    const s = (config && config.site) || {};
    $('siteNameIn').value = s.name || '';
    $('siteHost').value = s.connection || $('host').value;
    $('sitePort').value = s.port || $('port').value;
    $('sitePath').value = s.path || $('path').value;
    $('siteFmt').value = s.binary === false ? 'hex' : 'binary';
  }
  $('siteApply').onclick = () => {
    if (!config) return;
    config.site = Object.assign(config.site || {}, {
      name: $('siteNameIn').value.trim(),
      connection: $('siteHost').value.trim(),
      port: clamp($('sitePort').value, 1, 65535, 8080),
      path: $('sitePath').value.trim() || '/ws',
      binary: $('siteFmt').value === 'binary',
    });
    $('host').value = config.site.connection; $('port').value = config.site.port;
    $('path').value = config.site.path; $('fmt').value = $('siteFmt').value;
    changed();
    sys(`Site set to ws://${config.site.connection}:${config.site.port}${config.site.path} — reconnecting`);
    if (ws) { wantConnected = false; ws.close(); }
    setTimeout(() => { if (!ws && config.site.connection) connect(); }, 100);
  };

  $('cfgNew').onclick = () => {
    if (dirty && !confirm('Discard the unsaved changes and start an empty configuration?')) return;
    const cfg = {
      version: '1.0.0',
      site: { name: 'New site', connection: $('host').value, port: +$('port').value || 8080, path: $('path').value || '/ws', binary: $('fmt').value === 'binary' },
      job: { 'room-1': { name: 'Room 1' } },
    };
    applyConfig(cfg, 'new (unsaved)');
    edPath = ['room-1'];
    commitConfig();           // cache it and mark unsaved
    editorLoad();
  };

  /* ---------- favourites: order / remove ---------- */
  function describeRef(ref) {
    const [p, k] = ref.split('#'), keys = p.split('/');
    const names = []; let o = config.job;
    for (const key of keys) { o = o && isObj(o[key]) ? o[key] : null; if (!o) break; names.push(o.name || key); }
    const c = o && isObj(o[k]) ? o[k] : null;
    if (!c) return { missing: true, name: ref, where: 'no longer in the configuration' };
    const what = kind(c) === 'button' ? `preset ${c.preset[1]}` : `channel ${c.channel[1]}`;
    return { name: c.name || k, where: `${names.join(' › ')} · area ${(c.preset || c.channel)[0]}, ${what}` + (c.enabled === false ? ' · hidden' : '') };
  }
  function renderFavs() {
    const ul = $('favList');
    ul.innerHTML = '';
    const list = (config && Array.isArray(config.favorites)) ? config.favorites : [];
    if (!list.length) { ul.appendChild(el('li', { className: 'hint', textContent: 'None yet' })); return; }
    list.forEach((ref, i) => {
      const d = describeRef(ref);
      const mv = dir => { const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); };
      ul.appendChild(el('li', {},
        el('span', { className: 'nm' }, el('b', { textContent: '★ ' + d.name }), ' ', el('span', { className: 'where', textContent: d.where })),
        el('button', { textContent: '↑', title: 'Move up', onclick: () => mv(-1) }),
        el('button', { textContent: '↓', title: 'Move down', onclick: () => mv(+1) }),
        el('button', { textContent: '✕', title: 'Remove from favourites', className: 'danger', onclick: () => { list.splice(i, 1); changed(); } })));
    });
  }

  /* ---------- room tree ---------- */
  function renderTree() {
    const nav = $('edTree');
    nav.innerHTML = '';
    const tools = el('div', { className: 'tree-tools' },
      el('button', { textContent: '+ Room', title: 'Add a top-level room', onclick: () => addRoom([]) }),
      el('button', { textContent: 'Collapse', title: 'Collapse all', onclick: () => { allRoomPaths(config.job, []).forEach(p => edCollapsed.add(p)); saveCollapsed(); renderTree(); } }),
      el('button', { textContent: 'Expand', title: 'Expand all', onclick: () => { edCollapsed.clear(); saveCollapsed(); renderTree(); } }));
    nav.appendChild(tools);
    const mk = (obj, path) => {
      const ul = el('ul');
      entries(obj, 'room').forEach(([k, v]) => {
        const p = [...path, k], id = p.join('/');
        const subs = entries(v, 'room').length;
        const li = el('li'), caret = el('span', { className: 'caret' + (subs ? '' : ' none') });
        const a = el('a', { textContent: (v.name || k) + (v.enabled === false ? ' (hidden)' : '') });
        if (id === edPath.join('/')) a.classList.add('sel');
        a.onclick = () => { edPath = p; renderTree(); renderRoomForm(); };
        li.appendChild(el('div', { className: 'mrow' }, caret, a));
        if (subs) {
          caret.textContent = edCollapsed.has(id) ? '▸' : '▾';
          caret.onclick = () => { edCollapsed.has(id) ? edCollapsed.delete(id) : edCollapsed.add(id); saveCollapsed(); renderTree(); };
          li.classList.toggle('collapsed', edCollapsed.has(id));
          li.appendChild(mk(v, p));
        }
        ul.appendChild(li);
      });
      return ul;
    };
    nav.appendChild(mk(config.job, []));
  }
  const allRoomPaths = (obj, path) => entries(obj, 'room').flatMap(([k, v]) => [[...path, k].join('/'), ...allRoomPaths(v, [...path, k])]);
  function saveCollapsed() { try { localStorage.setItem('dynet1edcollapsed', JSON.stringify([...edCollapsed])); } catch (e) {} }

  function addRoom(parentPath) {
    const parent = parentPath.length ? node(parentPath) : config.job;
    const key = nextKey(parent, 'room');
    parent[key] = { name: 'New room' };
    edPath = [...parentPath, key];
    edCollapsed.delete(parentPath.join('/')); saveCollapsed();
    changed({ tree: true, form: true });
    const nameIn = document.querySelector('#edRoom .ed-head input'); if (nameIn) { nameIn.focus(); nameIn.select(); }
  }

  /* ---------- selected room ---------- */
  function renderRoomForm() {
    const box = $('edRoom');
    box.innerHTML = '';
    const room = node(edPath);
    if (!edPath.length || !room) { box.innerHTML = '<div class="empty">Select a room, or add one with “+ Room”</div>'; return; }
    const parent = parentOf(edPath), key = edPath[edPath.length - 1];

    // header: name, visibility, order, add sub-room, delete
    const nameIn = el('input', { type: 'text', value: room.name || '' });
    nameIn.onchange = () => { room.name = nameIn.value.trim() || key; changed({ tree: true }); };
    const vis = el('input', { type: 'checkbox', checked: room.enabled !== false, title: 'Show this room in the Rooms menu' });
    vis.onchange = () => { if (vis.checked) delete room.enabled; else room.enabled = false; changed({ tree: true }); };
    box.appendChild(el('div', { className: 'ed-head' },
      el('label', {}, 'Room name', nameIn),
      el('label', { className: 'inline' }, vis, 'Visible'),
      el('button', { textContent: '↑', title: 'Move up', onclick: () => { if (move(parent, key, -1)) changed({ tree: true }); } }),
      el('button', { textContent: '↓', title: 'Move down', onclick: () => { if (move(parent, key, +1)) changed({ tree: true }); } }),
      el('button', { textContent: '+ Sub-room', onclick: () => addRoom(edPath) }),
      el('button', { textContent: 'Delete room', className: 'danger', onclick: () => {
        const n = allRoomPaths(room, []).length;
        if (!confirm(`Delete "${room.name || key}"${n ? ` and the ${n} room${n > 1 ? 's' : ''} inside it` : ''}?`)) return;
        delete parent[key]; edPath = edPath.slice(0, -1); changed({ tree: true, form: true });
      } })));

    // buttons
    box.appendChild(controlTable(room, 'button', 'Buttons (presets)', ['Name', 'Area', 'Preset', 'Fade s'],
      (v) => [v.name, v.preset[0], v.preset[1], v.preset[2] ?? 2],
      (v, i, val) => { if (i === 0) v.name = val; else { const lim = [[1, 255, 1], [1, 2048, 1], [0, 1300, 2]][i - 1]; v.preset[i - 1] = clamp(val, ...lim); } },
      () => {
        const area = roomArea(room), used = entries(room, 'button').map(([, v]) => v.preset[1]);
        return { name: 'New button', preset: [area, used.length ? Math.max(...used) + 1 : 1, 2] };
      },
      { headers: ['Icon', 'Show'], cells: v => [iconCell(v), showCell(v)] }));

    // channels
    box.appendChild(controlTable(room, 'slider', 'Channels (sliders)', ['Name', 'Area', 'Channel', 'Fade s'],
      (v) => [v.name, v.channel[0], v.channel[1], v.channel[2] ?? ''],
      (v, i, val) => {
        if (i === 0) v.name = val;
        else if (i === 3) { if (val === '' || val === null) v.channel.length = 2; else v.channel[2] = clamp(val, 0, 1300, 0.5); }
        else v.channel[i - 1] = clamp(val, 1, 255, 1);
      },
      () => {
        const area = roomArea(room), used = entries(room, 'slider').map(([, v]) => v.channel[1]);
        return { name: 'New channel', channel: [area, used.length ? Math.min(255, Math.max(...used) + 1) : 1] };
      },
      { headers: ['Icon'], cells: v => [iconCell(v)] }));

    // sub-rooms, for quick navigation
    const subs = entries(room, 'room');
    if (subs.length) {
      const list = el('div', { className: 'ed-sub' }, el('h3', { textContent: 'Rooms inside' }));
      const row = el('div', { className: 'cfg-bar' });
      subs.forEach(([k, v]) => row.appendChild(el('button', { textContent: v.name || k, onclick: () => { edPath = [...edPath, k]; renderTree(); renderRoomForm(); } })));
      list.appendChild(row); box.appendChild(list);
    }
  }

  /* Icon column: button showing the chosen icon, opens the picker */
  function iconCell(v) {
    const b = el('button', { type: 'button', className: 'ed-icon' });
    const paint = () => { b.innerHTML = v.icon && iconSvg(v.icon) ? iconSvg(v.icon) : '<span class="hint">none</span>'; b.title = v.icon ? v.icon.replace(/_/g, ' ') + ' — click to change' : 'Choose an icon'; };
    paint();
    b.onclick = () => openIconPicker(b, v.icon || '', n => { if (n) v.icon = n; else { delete v.icon; delete v.show; } paint(); changed({ form: true }); });
    return el('td', { className: 'ic' }, b);
  }
  /* Show column: default / text / icon / both */
  function showCell(v) {
    const s = el('select', { title: 'How this button is drawn — Default follows Theme → Buttons' });
    [['', 'Default'], ['text', 'Text'], ['icon', 'Icon'], ['both', 'Both']].forEach(([val, t]) => s.appendChild(el('option', { value: val, textContent: t })));
    s.value = v.show || ''; s.disabled = !v.icon;
    s.onchange = () => { if (s.value) v.show = s.value; else delete v.show; changed(); };
    return el('td', {}, s);
  }

  /* one table for buttons or channels: enable, fields, order, delete, add */
  function controlTable(room, k, title, headers, read, write, make, extra) {
    const wrap = el('div', { className: 'ed-sub' }, el('h3', { textContent: title }));
    wrap.dataset.k = k;
    const table = el('table', { className: 'ed' });
    const head = el('tr', {}, el('th', { textContent: 'On', title: 'Enabled — untick to hide without deleting' }));
    headers.forEach(h => head.appendChild(el('th', { textContent: h })));
    if (extra) extra.headers.forEach(h => head.appendChild(el('th', { textContent: h })));
    head.appendChild(el('th'));
    table.appendChild(el('thead', {}, head));
    const body = el('tbody');
    entries(room, k).forEach(([key, v]) => {
      const tr = el('tr', { className: v.enabled === false ? 'off' : '' });
      const on = el('input', { type: 'checkbox', checked: v.enabled !== false });
      on.onchange = () => { if (on.checked) delete v.enabled; else v.enabled = false; tr.classList.toggle('off', !on.checked); changed(); };
      tr.appendChild(el('td', { className: 'chk' }, on));
      read(v).forEach((val, i) => {
        const inp = el('input', { type: i === 0 ? 'text' : 'number', value: val, step: i === 3 ? '0.1' : '1' });
        if (i === 3 && k === 'slider') inp.placeholder = 'default';
        inp.onchange = () => { write(v, i, i === 0 ? inp.value.trim() : (inp.value === '' ? '' : inp.value)); const now = read(v)[i]; inp.value = now; changed(); };
        tr.appendChild(el('td', { className: i ? 'n' : '' }, inp));
      });
      if (extra) extra.cells(v).forEach(td => tr.appendChild(td));
      tr.appendChild(el('td', { className: 'act' },
        el('button', { textContent: '↑', title: 'Move up', onclick: () => { if (move(room, key, -1)) changed({ form: true }); } }),
        el('button', { textContent: '↓', title: 'Move down', onclick: () => { if (move(room, key, +1)) changed({ form: true }); } }),
        el('button', { textContent: '✕', title: 'Delete', className: 'danger', onclick: () => { delete room[key]; changed({ form: true }); } })));
      body.appendChild(tr);
    });
    if (!body.children.length) body.appendChild(el('tr', {}, el('td', { colSpan: headers.length + (extra ? extra.headers.length : 0) + 2, className: 'hint', textContent: 'None' })));
    table.appendChild(body);
    wrap.appendChild(table);
    wrap.appendChild(el('button', { textContent: k === 'button' ? '+ Add button' : '+ Add channel', onclick: () => {
      room[nextKey(room, k)] = make(); changed({ form: true });
      const inp = document.querySelector(`#edRoom .ed-sub[data-k="${k}"] tbody tr:last-child input[type=text]`);
      if (inp) { inp.focus(); inp.select(); }
    } }));
    return wrap;
  }

  editorLoad();
})();

/* ========================================================================
 * §4  THEME — Theme tab
 * ======================================================================== */

/* Theme tab: light/dark mode, colour presets, custom
 * colours, background image, panel transparency, corner radius, text size.
 *
 * Everything is driven through the CSS custom properties declared at the top
 * of dynet_ui.css (--bg, --panel, --accent, --radius, --bg-image …),
 * set as inline styles on <html>. Nothing else in the page needs to know
 * about themes.
 *
 * Storage: the theme object is kept in this browser (localStorage
 * "dynet1theme") and, once a configuration is loaded, in config.theme so it
 * travels with dynet_ui.json:
 *
 *   "theme": {
 *     "mode": "auto" | "light" | "dark",
 *     "preset": "default" | "slate" | "warm" | "contrast" | "ocean" | "forest" | "sunset" |
 *               "lavender" | "rose" | "sand" | "nord" | "solarized" | "graphite",
 *     "colors": { "light": { "accent": "#…", … }, "dark": { … } },   // overrides
 *     "image": "", "fit": "cover", "dim": 30, "panelOpacity": 100, "blur": 0,
 *     "radius": 10, "fontSize": 14
 *   }
 *
 * Uses config / commitConfig() / $ from the CORE section.
 */
(function () {
  'use strict';

  /* ---------- palettes ---------- */
  const KEYS = [   // key, CSS variable, label
    ['bg', '--bg', 'Background'], ['panel', '--panel', 'Panels'], ['ink', '--ink', 'Text'],
    ['muted', '--muted', 'Secondary text'], ['line', '--line', 'Lines / borders'],
    ['accent', '--accent', 'Accent (active buttons)'], ['accentInk', '--accent-ink', 'Text on accent'],
    ['btn', '--btn', 'Buttons'], ['btnHover', '--btn-hover', 'Button hover'],
  ];
  // must match the defaults in dynet_ui.css
  const BASE = {
    light: { bg: '#f5f6f8', panel: '#ffffff', ink: '#1b1f24', muted: '#667085', line: '#dfe3e8', accent: '#1f6feb', accentInk: '#ffffff', btn: '#eef1f4', btnHover: '#e2e6ea' },
    dark:  { bg: '#0f1216', panel: '#171b21', ink: '#e6e8eb', muted: '#8b949e', line: '#2a3038', accent: '#4493f8', accentInk: '#ffffff', btn: '#222831', btnHover: '#2c333d' },
  };
  const PRESETS = {
    default:  { name: 'Default', light: {}, dark: {} },
    slate:    { name: 'Slate',
      light: { bg: '#eef2f6', accent: '#0f766e', btn: '#e3e9ef', btnHover: '#d6dee6' },
      dark:  { bg: '#0b1220', panel: '#111a2e', ink: '#e2e8f0', muted: '#94a3b8', line: '#1f2a44', accent: '#14b8a6', accentInk: '#04201d', btn: '#1a2540', btnHover: '#223052' } },
    warm:     { name: 'Warm',
      light: { bg: '#faf6f0', panel: '#fffdf9', ink: '#2b2118', muted: '#7a6a58', line: '#eadfce', accent: '#c2410c', btn: '#f3eadc', btnHover: '#eadcc8' },
      dark:  { bg: '#17120d', panel: '#211a13', ink: '#f3e9dc', muted: '#b39f86', line: '#3a2e22', accent: '#fb923c', accentInk: '#1b1109', btn: '#2c2219', btnHover: '#382b1f' } },
    contrast: { name: 'High contrast',
      light: { bg: '#ffffff', panel: '#ffffff', ink: '#000000', muted: '#333333', line: '#000000', accent: '#0000cc', btn: '#f0f0f0', btnHover: '#dddddd' },
      dark:  { bg: '#000000', panel: '#000000', ink: '#ffffff', muted: '#dddddd', line: '#ffffff', accent: '#ffd400', accentInk: '#000000', btn: '#111111', btnHover: '#222222' } },
    ocean:    { name: 'Ocean',
      light: { bg: '#eef6fb', panel: '#ffffff', ink: '#0f2a3d', muted: '#557083', line: '#d3e4ef', accent: '#0277bd', btn: '#e2eff7', btnHover: '#d2e5f1' },
      dark:  { bg: '#071a26', panel: '#0c2433', ink: '#dcecf5', muted: '#8aa9bc', line: '#173646', accent: '#29b6f6', accentInk: '#03202d', btn: '#12303f', btnHover: '#1a3b4d' } },
    forest:   { name: 'Forest',
      light: { bg: '#f1f5ef', panel: '#ffffff', ink: '#1d2a1c', muted: '#5f705c', line: '#d9e3d4', accent: '#2e7d32', btn: '#e5ede1', btnHover: '#d8e4d2' },
      dark:  { bg: '#0d140d', panel: '#141e14', ink: '#e1eadf', muted: '#93a58f', line: '#243324', accent: '#66bb6a', accentInk: '#0b1a0c', btn: '#1c291c', btnHover: '#253425' } },
    sunset:   { name: 'Sunset',
      light: { bg: '#fdf3f0', panel: '#ffffff', ink: '#2e1a1f', muted: '#7d5d63', line: '#f1dcd6', accent: '#e8505b', btn: '#f8e6e1', btnHover: '#f2d8d1' },
      dark:  { bg: '#1a0f14', panel: '#24151c', ink: '#f5e4e6', muted: '#b88f96', line: '#3a2229', accent: '#ff7a59', accentInk: '#2a0d06', btn: '#301c23', btnHover: '#3c242c' } },
    lavender: { name: 'Lavender',
      light: { bg: '#f5f3fb', panel: '#ffffff', ink: '#231d33', muted: '#6c6484', line: '#e2ddf0', accent: '#6d4aff', btn: '#ece8f8', btnHover: '#e0daf3' },
      dark:  { bg: '#120f1c', panel: '#1a1627', ink: '#e8e4f5', muted: '#9f97bb', line: '#2c2640', accent: '#a78bfa', accentInk: '#1a0f3a', btn: '#241e35', btnHover: '#2e2743' } },
    rose:     { name: 'Rose',
      light: { bg: '#fdf2f6', panel: '#ffffff', ink: '#2d1621', muted: '#7f5b6b', line: '#f2d9e3', accent: '#d6336c', btn: '#f8e5ec', btnHover: '#f2d6e1' },
      dark:  { bg: '#190c12', panel: '#22111a', ink: '#f7e3eb', muted: '#bd8ea1', line: '#3b1f2c', accent: '#f06595', accentInk: '#2a0615', btn: '#2e1823', btnHover: '#3a202d' } },
    sand:     { name: 'Sand',
      light: { bg: '#f7f3ea', panel: '#fffdf8', ink: '#2c2718', muted: '#766d55', line: '#e8e0cc', accent: '#a67c00', btn: '#efe8d6', btnHover: '#e6dcc4' },
      dark:  { bg: '#15130c', panel: '#1e1b12', ink: '#efe9d8', muted: '#aba183', line: '#34301f', accent: '#e0b43c', accentInk: '#1f1705', btn: '#29251a', btnHover: '#342f21' } },
    nord:     { name: 'Nord',
      light: { bg: '#eceff4', panel: '#ffffff', ink: '#2e3440', muted: '#4c566a', line: '#d8dee9', accent: '#5e81ac', btn: '#e5e9f0', btnHover: '#d8dee9' },
      dark:  { bg: '#2e3440', panel: '#3b4252', ink: '#eceff4', muted: '#a3adc2', line: '#4c566a', accent: '#88c0d0', accentInk: '#1d232d', btn: '#434c5e', btnHover: '#4c566a' } },
    solarized:{ name: 'Solarized',
      light: { bg: '#fdf6e3', panel: '#fffbef', ink: '#073642', muted: '#657b83', line: '#eee8d5', accent: '#268bd2', btn: '#eee8d5', btnHover: '#e4ddc8' },
      dark:  { bg: '#002b36', panel: '#073642', ink: '#eee8d5', muted: '#93a1a1', line: '#0f4553', accent: '#2aa198', accentInk: '#002b36', btn: '#0b3f4c', btnHover: '#124a58' } },
    graphite: { name: 'Graphite',
      light: { bg: '#f2f2f2', panel: '#ffffff', ink: '#1a1a1a', muted: '#666666', line: '#dcdcdc', accent: '#3a3a3a', btn: '#e8e8e8', btnHover: '#dddddd' },
      dark:  { bg: '#121212', panel: '#1b1b1b', ink: '#e8e8e8', muted: '#9a9a9a', line: '#2d2d2d', accent: '#d0d0d0', accentInk: '#121212', btn: '#252525', btnHover: '#303030' } },
  };
  const DEFAULT_THEME = { mode: 'auto', preset: 'default', colors: { light: {}, dark: {} },
    image: '', fit: 'cover', dim: 30, panelOpacity: 100, blur: 0, radius: 10, fontSize: 14,
    iconShow: 'both', iconPos: 'top', iconSize: 24 };

  const clone = o => JSON.parse(JSON.stringify(o));
  const norm = t => { t = Object.assign(clone(DEFAULT_THEME), t || {}); t.colors = Object.assign({ light: {}, dark: {} }, t.colors || {}); if (!PRESETS[t.preset]) t.preset = 'default'; return t; };
  let theme = norm(null);
  try { const s = localStorage.getItem('dynet1theme'); if (s) theme = norm(JSON.parse(s)); } catch (e) {}

  const osDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  const effMode = () => theme.mode === 'auto' ? (osDark.matches ? 'dark' : 'light') : theme.mode;
  const palette = mode => Object.assign({}, BASE[mode], PRESETS[theme.preset][mode], theme.colors[mode]);

  function hexToRgb(h) {
    h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;

  /* ---------- apply to the page ---------- */
  function apply() {
    const root = document.documentElement, mode = effMode(), pal = palette(mode);
    if (theme.mode === 'auto') root.removeAttribute('data-mode'); else root.setAttribute('data-mode', theme.mode);
    KEYS.forEach(([k, v]) => root.style.setProperty(v, pal[k]));
    const op = Math.max(0.3, Math.min(1, (theme.panelOpacity ?? 100) / 100));
    root.style.setProperty('--panel', op < 1 ? rgba(pal.panel, op) : pal.panel);
    root.style.setProperty('--panel-blur', (theme.blur || 0) + 'px');
    root.style.setProperty('--radius', theme.radius + 'px');
    root.style.setProperty('--radius-sm', Math.round(theme.radius * 0.6) + 'px');
    root.style.setProperty('--font-size', theme.fontSize + 'px');
    root.style.setProperty('--icon-size', (theme.iconSize || 24) + 'px');
    if (theme.image) {
      const dim = rgba(pal.bg, (theme.dim || 0) / 100);
      root.style.setProperty('--bg-image', `linear-gradient(${dim},${dim}),url("${String(theme.image).replace(/"/g, '%22')}")`);
      const fit = { cover: ['cover', 'no-repeat'], contain: ['contain', 'no-repeat'], tile: ['auto', 'repeat'], center: ['auto', 'no-repeat'] }[theme.fit] || ['cover', 'no-repeat'];
      root.style.setProperty('--bg-size', fit[0]); root.style.setProperty('--bg-repeat', fit[1]);
    } else {
      root.style.setProperty('--bg-image', 'none');
    }
  }
  osDark.addEventListener && osDark.addEventListener('change', () => { if (theme.mode === 'auto') { apply(); renderForm(); } });

  /* save: browser now, config (debounced, marks unsaved) */
  let saveTimer = null;
  function changed(rerender) {
    apply();
    try { localStorage.setItem('dynet1theme', JSON.stringify(theme)); } catch (e) {}
    if (rerender) renderForm();
    if (typeof config !== 'undefined' && config) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { config.theme = clone(theme); commitConfig(); }, 400);
    }
  }

  /* called by the console after a configuration loads */
  window.themeIconPrefs = () => ({ show: theme.iconShow || 'both', pos: theme.iconPos || 'top', size: theme.iconSize || 24 });
  const rerenderRooms = () => { if (typeof renderRoom === 'function' && typeof config !== 'undefined' && config) renderRoom(); };

  window.themeLoad = function () {
    if (typeof config !== 'undefined' && config && config.theme) theme = norm(config.theme);
    apply();
    try { localStorage.setItem('dynet1theme', JSON.stringify(theme)); } catch (e) {}
    renderForm();
  };

  /* ---------- form ---------- */
  const $id = id => document.getElementById(id);
  function renderForm() {
    $id('thMode').value = theme.mode;
    const mode = effMode(), pal = palette(mode);
    $id('thColMode').textContent = mode;

    const pbox = $id('thPresets'); pbox.innerHTML = '';
    Object.entries(PRESETS).forEach(([key, p]) => {
      const pp = Object.assign({}, BASE[mode], p[mode]);
      const sw = document.createElement('span'); sw.className = 'th-swatch';
      ['bg', 'panel', 'accent', 'ink'].forEach(k => { const i = document.createElement('i'); i.style.background = pp[k]; sw.appendChild(i); });
      const b = document.createElement('button');
      b.append(sw, document.createTextNode(p.name));
      b.classList.toggle('active', theme.preset === key);
      b.onclick = () => { theme.preset = key; theme.colors = { light: {}, dark: {} }; changed(true); };
      pbox.appendChild(b);
    });

    const cbox = $id('thColours'); cbox.innerHTML = '';
    KEYS.forEach(([k, , label]) => {
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = pal[k];
      inp.oninput = () => { theme.colors[mode][k] = inp.value; changed(false); };
      const lab = document.createElement('label'); lab.append(label + (theme.colors[mode][k] ? ' •' : ''), inp);
      cbox.appendChild(lab);
    });

    $id('thImgUrl').value = theme.image && !theme.image.startsWith('data:') ? theme.image : '';
    $id('thImgUrl').placeholder = theme.image.startsWith('data:') ? 'embedded image (from file)' : 'https://… or leave empty';
    $id('thImgInfo').textContent = theme.image.startsWith('data:') ? `Embedded image, ${Math.round(theme.image.length * 0.75 / 1024)} KB in the JSON.` : '';
    $id('thFit').value = theme.fit;
    setRange('thDim', theme.dim, '%'); setRange('thPanel', theme.panelOpacity, '%'); setRange('thBlur', theme.blur, ' px');
    setRange('thRad', theme.radius, ' px'); setRange('thFont', theme.fontSize, ' px');
    $id('thIconShow').value = theme.iconShow; $id('thIconPos').value = theme.iconPos; setRange('thIconSize', theme.iconSize, ' px');
  }
  function setRange(id, v, unit) { $id(id).value = v; $id(id + 'Out').textContent = v + unit; }

  $id('thMode').onchange = () => { theme.mode = $id('thMode').value; changed(true); };
  $id('thReset').onclick = () => { if (confirm('Reset the whole theme to default?')) { theme = norm(null); changed(true); rerenderRooms(); } };
  $id('thColReset').onclick = () => { theme.colors[effMode()] = {}; changed(true); };
  $id('thFit').onchange = () => { theme.fit = $id('thFit').value; changed(false); };
  $id('thIconShow').onchange = () => { theme.iconShow = $id('thIconShow').value; changed(false); rerenderRooms(); };
  $id('thIconPos').onchange = () => { theme.iconPos = $id('thIconPos').value; changed(false); rerenderRooms(); };
  [['thDim', 'dim', '%'], ['thPanel', 'panelOpacity', '%'], ['thBlur', 'blur', ' px'], ['thRad', 'radius', ' px'], ['thFont', 'fontSize', ' px'], ['thIconSize', 'iconSize', ' px']]
    .forEach(([id, key, unit]) => { $id(id).oninput = () => { theme[key] = +$id(id).value; $id(id + 'Out').textContent = theme[key] + unit; changed(false); }; });
  $id('thImgUrl').onchange = () => { theme.image = $id('thImgUrl').value.trim(); changed(true); };
  $id('thImgClear').onclick = () => { theme.image = ''; changed(true); };
  $id('thImgPick').onclick = () => $id('thImgFile').click();
  $id('thImgFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) shrinkImage(f, 1920, 0.82).then(url => { theme.image = url; changed(true); }).catch(err => alert('Could not read image: ' + err.message));
  };

  // scale big photos down so the JSON stays a sensible size
  function shrinkImage(file, maxW, q) {
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onerror = () => reject(rd.error);
      rd.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('not an image'));
        img.onload = () => {
          const s = Math.min(1, maxW / img.width);
          if (s === 1 && file.size < 400 * 1024) return resolve(rd.result);   // small already
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', q));
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  apply();
  renderForm();
})();

/* ========================================================================
 * §5  ICON HELPERS — iconSvg(), iconPrefs(), icon picker
 * ========================================================================
 * The icon data itself lives in dynet_ui_icons.js (window.DYNET_ICONS and
 * window.DYNET_ICON_GROUPS), loaded before this file. Without it, buttons
 * fall back to text and the picker says the library is missing.
 */
/* iconSvg(name) → inline <svg> markup (currentColor), or '' if the name is unknown */
function iconSvg(name){
  const d = name && window.DYNET_ICONS && window.DYNET_ICONS[name];
  return d ? `<svg viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${d}"/></svg>` : '';
}
/* iconPrefs() → theme defaults for button icons {show, pos, size} */
function iconPrefs(){
  return (window.themeIconPrefs && window.themeIconPrefs()) || { show: 'both', pos: 'top', size: 24 };
}

/* openIconPicker(anchor, current, onPick) — searchable popover grid; onPick('') = no icon */
function openIconPicker(anchor, current, onPick){
  document.querySelectorAll('.icon-picker').forEach(p => p.remove());
  const pop = document.createElement('div'); pop.className = 'icon-picker';
  pop.innerHTML = '<div class="ip-head"><input type="search" placeholder="Search icons…"><button type="button" class="ip-none">No icon</button><button type="button" class="ip-close" title="Close">✕</button></div><div class="ip-body"></div>';
  const q = pop.querySelector('input'), body = pop.querySelector('.ip-body');
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
  const outside = e => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const pick = n => { close(); onPick(n); };
  const MAX_HITS = 300;
  const cell = n => {
    const b = document.createElement('button'); b.type = 'button'; b.title = n.replace(/_/g, ' ');
    b.innerHTML = iconSvg(n); b.dataset.icon = n;
    if (n === current) b.classList.add('active');
    b.onclick = () => pick(n);
    return b;
  };
  const grid = list => { const g = document.createElement('div'); g.className = 'ip-grid'; list.forEach(n => g.appendChild(cell(n))); return g; };
  function draw(){
    const groups = window.DYNET_ICON_GROUPS || [], open = window.DYNET_ICON_OPEN_GROUPS ?? groups.length;
    body.innerHTML = '';
    if (!window.DYNET_ICONS){ body.innerHTML = '<p class="hint">Icon library not loaded — keep dynet_ui_icons.js next to dynet_ui.html.</p>'; return; }
    const raw = q.value.trim().toLowerCase(), f = raw.replace(/[\s-]+/g, '_');
    if (f){
      // search: one flat list, names first, then everything in a matching group
      const hits = new Set(Object.keys(window.DYNET_ICONS).filter(n => n.includes(f)));
      groups.forEach(([g, names]) => { if (g.toLowerCase().includes(raw)) names.forEach(n => hits.add(n)); });
      const list = [...hits];
      const h = document.createElement('h4');
      h.textContent = list.length ? `${list.length} match${list.length > 1 ? 'es' : ''}${list.length > MAX_HITS ? ` — showing first ${MAX_HITS}, keep typing` : ''}` : 'No match';
      body.appendChild(h);
      if (list.length) body.appendChild(grid(list.slice(0, MAX_HITS)));
      return;
    }
    // browse: suggested groups open, the rest collapsed and drawn on demand
    groups.forEach(([g, names], i) => {
      if (!names.length) return;
      const det = document.createElement('details'); det.open = i < open;
      const sum = document.createElement('summary'); sum.textContent = `${g} (${names.length})`; det.appendChild(sum);
      const fill = () => { if (!det.dataset.filled){ det.dataset.filled = 1; det.appendChild(grid(names)); } };
      if (det.open) fill(); else det.addEventListener('toggle', () => det.open && fill());
      body.appendChild(det);
    });
  }
  q.oninput = draw;
  pop.querySelector('.ip-none').onclick = () => pick('');
  pop.querySelector('.ip-close').onclick = close;
  draw();
  document.body.appendChild(pop);
  // position under the anchor, kept on screen
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left));
  let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); q.focus(); });
}
