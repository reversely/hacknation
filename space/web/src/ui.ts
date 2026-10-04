// A small element builder, so screens read as markup without a framework dependency.

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, '').toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

// A labelled control; `value` is an optional element shown at the label's right, such as a live total.
export function field(label: string, control: HTMLElement, value?: HTMLElement): HTMLElement {
  return h('label', { class: 'field' }, h('div', { class: 'label' }, h('span', {}, label), value ?? null), control);
}
