// Usa la pestaña de WhatsApp Web que ya está abierta; si no hay ninguna, abre una.
// Primero intenta abrir el chat sin recargar; si no se logra, cambia la dirección de la pestaña.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || typeof msg.url !== 'string' || !msg.url.startsWith('https://web.whatsapp.com/send')) {
    responder({ ok: false });
    return;
  }
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    if (!tabs || !tabs.length) {
      chrome.tabs.create({ url: msg.url }, () => responder({ ok: true }));
      return;
    }
    const tab = tabs[0];
    chrome.tabs.update(tab.id, { active: true }, () => {
      chrome.windows.update(tab.windowId, { focused: true });
      chrome.tabs.sendMessage(tab.id, { tipo: 'LC_ABRIR_CHAT_SIN_RECARGAR', url: msg.url }, (resp) => {
        void chrome.runtime.lastError;
        if (resp && resp.ok) return responder({ ok: true });
        chrome.tabs.update(tab.id, { url: msg.url }, () => responder({ ok: true }));
      });
    });
  });
  return true;
});
