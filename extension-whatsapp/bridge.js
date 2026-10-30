// Puente entre la app (la página) y la extensión.
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.tipo === 'LC_WHATSAPP_PING') { window.postMessage({ tipo: 'LC_WHATSAPP_EXTENSION' }, '*'); return; }
  if (event.data.tipo !== 'LC_WHATSAPP_ABRIR') return;
  try {
    chrome.runtime.sendMessage({ url: event.data.url }, () => {
      void chrome.runtime.lastError;
      window.postMessage({ tipo: 'LC_WHATSAPP_LISTO', id: event.data.id }, '*');
    });
  } catch (error) {
    // La extensión se recargó mientras esta pestaña seguía abierta: la app abre WhatsApp por su cuenta.
    window.postMessage({ tipo: 'LC_WHATSAPP_EXTENSION_CAIDA', id: event.data.id }, '*');
  }
});
window.postMessage({ tipo: 'LC_WHATSAPP_EXTENSION' }, '*');
