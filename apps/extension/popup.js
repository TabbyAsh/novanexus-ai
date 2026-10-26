const message = document.getElementById('message');
document.getElementById('scan').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open an ordinary product or auction page first.');
    message.textContent = 'Reading source…';
    let reply;
    try { reply = await chrome.tabs.sendMessage(tab.id, { type: 'lens:scan' }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lens-core.js', 'capture.js', 'content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['card.css'] });
      reply = await chrome.tabs.sendMessage(tab.id, { type: 'lens:scan' });
    }
    if (!reply?.ok) throw new Error(reply?.error || 'Page could not be captured.');
    message.textContent = reply.data.kind === 'comps' ? `${reply.data.rows.length} visible comparison rows saved. Review comparability in Lens.` : 'Source snapshot saved. Open Lens to appraise or watch.';
  } catch (e) { message.textContent = e.message; }
};
document.getElementById('open').onclick = () => chrome.runtime.openOptionsPage();
