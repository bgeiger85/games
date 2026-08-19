const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const src = fs.readFileSync(path.join(ROOT,'src','pieces.js'),'utf8').replace(/if \(typeof module[\s\S]*$/,'');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 760, height: 420 } });
  await p.setContent(`<html><head><style>
    body{margin:0;background:#161c2a;font-family:sans-serif;color:#fff}
    .row{display:flex}
    .sq{width:88px;height:88px;display:grid;place-items:center}
    .sq.l{background:#f2dcb6}.sq.d{background:#b1794f}
    svg.pc{width:78%;height:78%;display:block;overflow:visible}
    svg.pc.w path,svg.pc.w rect,svg.pc.w circle{fill:#fff;stroke:#2b2b2b;stroke-width:1.5;stroke-linejoin:round}
    svg.pc.b path,svg.pc.b rect,svg.pc.b circle{fill:#242a36;stroke:#e9edf6;stroke-width:1.2;stroke-linejoin:round}
    svg.pc.w .eye{fill:#2b2b2b;stroke:none}
    svg.pc.b .eye{fill:#e9edf6;stroke:none}
    svg.pc .slit{fill:none;stroke-width:1.6}
    svg.pc.w .slit{stroke:#2b2b2b}svg.pc.b .slit{stroke:#e9edf6}
    .lab{padding:6px 10px;font-size:13px}
  </style></head><body>
  <div class="lab">white on light / white on dark / black on light / black on dark</div>
  <div class="row" id="r1"></div><div class="row" id="r2"></div>
  <div class="lab" id="small">small size (30px squares):</div>
  <div class="row" id="r3"></div>
  </body></html>`);
  await p.evaluate(src + `;
    const names=[1,2,3,4,5,6];
    const r1=document.getElementById('r1'), r2=document.getElementById('r2'), r3=document.getElementById('r3');
    names.forEach((t,i)=>{ const d=document.createElement('div'); d.className='sq '+(i%2?'d':'l'); d.innerHTML=pieceSvg(t,true); r1.appendChild(d); });
    names.forEach((t,i)=>{ const d=document.createElement('div'); d.className='sq '+(i%2?'l':'d'); d.innerHTML=pieceSvg(t,false); r2.appendChild(d); });
    names.forEach((t,i)=>{ const d=document.createElement('div'); d.className='sq '+(i%2?'d':'l'); d.style.width='34px'; d.style.height='34px'; d.innerHTML=pieceSvg(t,true); r3.appendChild(d); });
    names.forEach((t,i)=>{ const d=document.createElement('div'); d.className='sq '+(i%2?'l':'d'); d.style.width='34px'; d.style.height='34px'; d.innerHTML=pieceSvg(t,false); r3.appendChild(d); });
  `);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(ROOT,'docs','screenshots','piece-set.png') });
  await b.close();
  console.log('rendered docs/screenshots/piece-set.png');
})();
