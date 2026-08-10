// Copy text to the clipboard, with a fallback for non-secure contexts.
//
// `navigator.clipboard` only exists in a secure context (https, or localhost).
// Pulse is served over plain http at http://synology:3004/pulse/, so on the NAS
// the property is undefined and calling it throws — which is why copy buttons
// worked in local dev but did nothing once deployed. Fall back to a hidden
// textarea + document.execCommand('copy'), which is deprecated but still the
// only thing that works over http in Chrome and Firefox.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or the document isn't focused — try the fallback.
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Keep it off-screen and non-scrolling, but still focusable/selectable.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
