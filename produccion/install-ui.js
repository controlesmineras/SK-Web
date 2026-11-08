(()=>{
  const button=document.querySelector('#installProduction');
  const instructions=document.querySelector('#installProductionHelp');
  const standalone=window.matchMedia('(display-mode: standalone)');
  const agent=navigator.userAgent;
  const appleMobile=/iPhone|iPad|iPod/i.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let offer=null,installed=false,prompting=false;

  function update(){
    button.hidden=installed||standalone.matches||navigator.standalone===true;
    button.disabled=prompting;
    if(button.hidden)instructions.hidden=true;
  }

  function showInstructions(){
    if(appleMobile){
      instructions.textContent='Abre Producción en Safari. Toca Compartir → Agregar a pantalla de inicio → Agregar. Si aparece «Abrir como app web», déjalo activado.';
    }else if(/Android/i.test(agent)){
      instructions.textContent='En Chrome, abre el menú ⋮ y elige Instalar aplicación o Agregar a pantalla principal. Si ya está instalada, busca Producción en tus aplicaciones.';
    }else if(/Edg\//.test(agent)){
      instructions.textContent='En Edge, abre el menú ⋯ → Aplicaciones → Instalar este sitio como una aplicación. Si ya la instalaste, búscala en el menú Inicio.';
    }else{
      instructions.textContent='En Chrome, usa el icono de instalación de la barra de direcciones o abre el menú ⋮ y busca Instalar Producción. En Windows, puedes usar Chrome o Edge y abrir la app instalada desde el menú Inicio.';
    }
    instructions.hidden=false;
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    offer=event;
  });
  window.addEventListener('appinstalled',()=>{
    installed=true;
    offer=null;
    update();
  });
  standalone.addEventListener?.('change',update);
  button.addEventListener('click',async()=>{
    if(prompting)return;
    if(!offer){showInstructions();return}
    const prompt=offer;
    offer=null;
    prompting=true;
    instructions.hidden=true;
    update();
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')installed=true;
    }catch{
      showInstructions();
    }finally{
      prompting=false;
      update();
    }
  });
  update();
})();
