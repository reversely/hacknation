// Inline SVG icons for the phone: the status bar and the dashboard's gear. Static markup only.

const svg = (body: string, viewBox: string, width: number, height: number, label?: string) => {
  const span = document.createElement('span');
  span.className = 'icon';
  if (label) span.setAttribute('aria-label', label);
  else span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${width}" height="${height}" viewBox="${viewBox}" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  return span;
};

export const signalIcon = () => svg('<rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/>', '0 0 17 11', 17, 11);
export const wifiIcon = () => svg('<path d="M7.75 2.2c2.3 0 4.4.88 5.98 2.32l1.17-1.2A10.07 10.07 0 0 0 7.75.5 10.07 10.07 0 0 0 .6 3.32l1.17 1.2A8.36 8.36 0 0 1 7.75 2.2Z"/><path d="M7.75 5.6c1.36 0 2.6.5 3.56 1.32l1.18-1.2a6.7 6.7 0 0 0-9.48 0l1.18 1.2A5.03 5.03 0 0 1 7.75 5.6Z"/><path d="M10.1 8.12a3.36 3.36 0 0 0-4.7 0L7.75 10.5l2.35-2.38Z"/>', '0 0 15.5 11', 16, 11);
export const batteryIcon = () => svg('<rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="16" height="8" rx="1.6"/><path d="M24 4v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" opacity="0.45"/>', '0 0 26 12', 26, 12);
export const gearIcon = (label: string) => svg('<path fill-rule="evenodd" d="M11.3 1.6a1 1 0 0 1 1.4 0l1.1 1.1c.24.24.58.34.9.27l1.53-.33a1 1 0 0 1 1.19.78l.33 1.53c.07.33.3.6.62.72l1.46.55a1 1 0 0 1 .59 1.28l-.55 1.46c-.12.32-.07.67.12.95l.9 1.27a1 1 0 0 1-.23 1.39l-1.27.9c-.28.2-.43.53-.4.87l.13 1.56a1 1 0 0 1-.91 1.08l-1.56.13c-.34.03-.64.23-.8.53l-.73 1.38a1 1 0 0 1-1.35.42l-1.38-.73a1 1 0 0 0-.94 0l-1.38.73a1 1 0 0 1-1.35-.42l-.73-1.38a1 1 0 0 0-.8-.53l-1.56-.13a1 1 0 0 1-.91-1.08l.13-1.56a1 1 0 0 0-.4-.87l-1.27-.9a1 1 0 0 1-.23-1.39l.9-1.27c.2-.28.24-.63.12-.95l-.55-1.46a1 1 0 0 1 .59-1.28l1.46-.55c.32-.12.55-.39.62-.72l.33-1.53a1 1 0 0 1 1.19-.78l1.53.33c.32.07.66-.03.9-.27l1.1-1.1ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>', '0 0 24 24', 18, 18, label);
