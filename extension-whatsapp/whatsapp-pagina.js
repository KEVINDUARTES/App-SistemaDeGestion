// Corre dentro de WhatsApp Web: intenta abrir el chat sin recargar la pestaña,
// como cuando se toca un link de WhatsApp dentro de un chat.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || msg.tipo !== 'LC_ABRIR_CHAT_SIN_RECARGAR') return;
  let texto = '';
  try { texto = new URL(msg.url).searchParams.get('text') || ''; } catch (e) { /* url inválida */ }
  const muestra = texto.replace(/\s+/g, ' ').trim().slice(0, 20);

  console.log('[LC-WA] Intentando abrir el chat sin recargar…');
  const enlace = document.createElement('a');
  enlace.href = msg.url;
  enlace.style.display = 'none';
  (document.querySelector('#app') || document.body).appendChild(enlace);
  enlace.click();
  setTimeout(() => enlace.remove(), 100);

  // Se considera logrado si el mensaje aparece escrito en la caja del chat.
  const hasta = Date.now() + 3000;
  const revisar = () => {
    const caja = document.querySelector('footer [contenteditable="true"]');
    const escrito = caja ? caja.textContent.replace(/\s+/g, ' ').trim() : '';
    if (muestra ? escrito.indexOf(muestra) !== -1 : !!caja) {
      console.log('[LC-WA] Chat abierto sin recargar.');
      return responder({ ok: true });
    }
    if (Date.now() > hasta) {
      console.log('[LC-WA] No se pudo abrir sin recargar: caja de texto', caja ? 'encontrada pero sin el mensaje' : 'no encontrada', '- se recarga la pestaña.');
      return responder({ ok: false });
    }
    setTimeout(revisar, 250);
  };
  setTimeout(revisar, 400);
  return true;
});
