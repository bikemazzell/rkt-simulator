export interface ComboOption { value: string; label: string; }

// A small type-ahead combobox: a text input that filters a dropdown list.
// Keyboard: ArrowUp/Down to move, Enter to pick, Escape to close/revert.
export class Combo {
  readonly el = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly list = document.createElement('div');
  private options: ComboOption[] = [];
  private filtered: ComboOption[] = [];
  private value = '';
  private highlighted = -1;

  constructor(placeholder: string, private readonly onChange: (value: string) => void) {
    this.el.className = 'rkt-combo';
    this.input.className = 'rkt-input rkt-combo-input';
    this.input.type = 'text';
    this.input.placeholder = placeholder;
    this.input.setAttribute('autocomplete', 'off');
    this.list.className = 'rkt-combo-list';
    this.list.hidden = true;
    this.el.append(this.input, this.list);

    this.input.addEventListener('focus', () => { this.input.select(); this.open(''); });
    this.input.addEventListener('input', () => this.open(this.input.value));
    this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.input.addEventListener('blur', () => {
      // Delay so an option's mousedown selection runs first.
      setTimeout(() => { this.close(); this.input.value = this.labelFor(this.value); }, 120);
    });
  }

  setOptions(options: ComboOption[]): void {
    this.options = options;
    if (!options.some((o) => o.value === this.value)) {
      this.value = options[0]?.value ?? '';
    }
    this.input.value = this.labelFor(this.value);
  }

  getValue(): string { return this.value; }

  setValue(value: string): void {
    if (this.options.some((o) => o.value === value)) {
      this.value = value;
      this.input.value = this.labelFor(value);
    }
  }

  private labelFor(value: string): string {
    return this.options.find((o) => o.value === value)?.label ?? '';
  }

  private open(query: string): void {
    const q = query.trim().toLowerCase();
    this.filtered = q === ''
      ? this.options
      : this.options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    this.highlighted = this.filtered.findIndex((o) => o.value === this.value);
    this.renderList();
    this.list.hidden = false;
  }

  private close(): void { this.list.hidden = true; }

  private renderList(): void {
    this.list.replaceChildren();
    if (this.filtered.length === 0) {
      const none = document.createElement('div');
      none.className = 'rkt-combo-empty';
      none.textContent = 'No matches';
      this.list.append(none);
      return;
    }
    this.filtered.forEach((o, i) => {
      const item = document.createElement('div');
      item.className = 'rkt-combo-item' + (i === this.highlighted ? ' is-active' : '');
      item.textContent = o.label;
      // mousedown (not click) so it fires before the input's blur.
      item.addEventListener('mousedown', (e) => { e.preventDefault(); this.select(o.value); });
      this.list.append(item);
    });
  }

  private select(value: string): void {
    this.value = value;
    this.input.value = this.labelFor(value);
    this.close();
    this.onChange(value);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.list.hidden) this.open(this.input.value);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      this.highlighted = this.filtered.length
        ? (this.highlighted + dir + this.filtered.length) % this.filtered.length
        : -1;
      this.renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = this.filtered[this.highlighted] ?? this.filtered[0];
      if (opt) this.select(opt.value);
    } else if (e.key === 'Escape') {
      this.close();
      this.input.value = this.labelFor(this.value);
      this.input.blur();
    }
  }
}
