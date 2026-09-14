// Navegación principal de SK Web Administrador: Inicio -> Consultar / Registrar.
(()=>{
'use strict';
function go(id){
  const target=document.getElementById(id);
  if(!target){console.warn('Vista no encontrada:',id);return;}
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='queries') window.dispatchEvent(new Event('skweb-open-queries'));
  if(id==='inventoryItems') window.SKInventoryAdmin?.render?.();
  window.scrollTo({top:0,behavior:'smooth'});
}
function closeMenu(){document.getElementById('adminRegisterMenu')?.remove()}
function ensureStyles(){
  if(document.getElementById('adminRegisterMenuStyles'))return;
  const s=document.createElement('style');s.id='adminRegisterMenuStyles';s.textContent=`
  .adminHomeMenuOverlay{position:fixed;inset:0;z-index:10000;background:rgba(7,25,38,.58);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
  .adminHomeMenu{width:min(560px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 22px 60px rgba(0,0,0,.28)}
  .adminHomeMenu .sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
  .adminHomeMenu .sectionHead h2{margin:0;color:#173d59}.adminHomeMenu [data-close-register]{width:42px;height:42px;padding:0;border-radius:50%;font-size:24px}
  .adminHomeMenuGrid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:16px}
  .adminHomeMenuGrid button{min-height:54px;text-align:left;padding:13px 16px;border-radius:12px;font-weight:700}
  @media(min-width:600px){.adminHomeMenuGrid{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s);
}
function openRegisterMenu(e){
  e?.preventDefault?.();e?.stopPropagation?.();closeMenu();ensureStyles();
  const box=document.createElement('div');box.id='adminRegisterMenu';box.className='adminHomeMenuOverlay';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Hacer registros');
  box.innerHTML=`<div class="adminHomeMenu"><div class="sectionHead"><h2>Hacer registros</h2><button type="button" data-close-register aria-label="Cerrar">×</button></div><p class="hint">Selecciona qué vas a registrar o administrar.</p><div class="adminHomeMenuGrid"><button type="button" data-open="personal">Personal</button><button type="button" data-open="assets">Activos fijos</button><button type="button" data-open="inventoryItems">Elementos de inventario</button><button type="button" data-open="novelties">Novedades de activos</button><button type="button" data-open="consumption">Consumo YT / Columnas</button><button type="button" data-open="incomes">Ingresos</button><button type="button" data-open="importData">Importar Excel</button></div></div>`;
  document.body.appendChild(box);
  box.addEventListener('click',ev=>{if(ev.target===box||ev.target.closest('[data-close-register]')){closeMenu();return}const b=ev.target.closest('[data-open]');if(!b)return;const id=b.dataset.open;closeMenu();go(id)});
  box.querySelector('[data-open]')?.focus();
}
function mount(){
  ensureStyles();
  const nav=document.getElementById('nav');if(nav)nav.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view!=='home')b.hidden=true});
  const consult=document.querySelector('.homeAccessBtn[data-home-view="queries"]');if(consult)consult.onclick=e=>{e.preventDefault();go('queries')};
  const register=document.querySelector('.homeAccessRegister');if(register){register.removeAttribute('data-home-view');register.onclick=openRegisterMenu;register.setAttribute('aria-haspopup','dialog')}
}
// Delegación de respaldo: funciona incluso si otro módulo reemplaza el botón después de cargar.
document.addEventListener('click',e=>{const register=e.target.closest?.('.homeAccessRegister');if(register){openRegisterMenu(e);return}const consult=e.target.closest?.('.homeAccessBtn[data-home-view="queries"]');if(consult){e.preventDefault();go('queries')}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
window.SKAdminNav={go,openRegisterMenu};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('load',mount,{once:true});
})();