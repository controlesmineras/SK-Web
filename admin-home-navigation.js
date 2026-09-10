// Navegación principal de SK Web Administrador: Inicio -> Consultar / Registrar.
(()=>{
function go(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='queries') window.dispatchEvent(new Event('skweb-open-queries'));
  window.scrollTo({top:0,behavior:'smooth'});
}
function closeMenu(){document.querySelector('#adminRegisterMenu')?.remove()}
function openRegisterMenu(){
  closeMenu();
  const box=document.createElement('div');box.id='adminRegisterMenu';box.className='adminHomeMenuOverlay';
  box.innerHTML=`<div class="adminHomeMenu"><div class="sectionHead"><h2>Hacer registros</h2><button type="button" data-close-register>×</button></div><p class="hint">Selecciona el módulo que vas a administrar.</p><div class="adminHomeMenuGrid"><button type="button" data-open="personal">Personal</button><button type="button" data-open="assets">Activos fijos</button><button type="button" data-open="novelties">Novedades de activos</button><button type="button" data-open="consumption">Consumo YT / Columnas</button></div></div>`;
  document.body.append(box);
  box.addEventListener('click',e=>{if(e.target===box||e.target.closest('[data-close-register]'))return closeMenu();const b=e.target.closest('[data-open]');if(b){closeMenu();go(b.dataset.open)}});
}
function mount(){
  const nav=document.querySelector('#nav');if(nav){nav.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view!=='home')b.hidden=true})}
  const consult=document.querySelector('.homeAccessBtn[data-home-view="queries"]');
  const register=document.querySelector('.homeAccessRegister');
  if(consult)consult.onclick=()=>go('queries');
  if(register){register.removeAttribute('data-home-view');register.onclick=openRegisterMenu}
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
}
window.SKAdminNav={go,openRegisterMenu};
window.addEventListener('load',()=>setTimeout(mount,50));
})();