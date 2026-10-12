let socket,
  context,
  settings = {},
  state = { methods: [] },
  groups = {},
  readParams = () => ({}),
  searchResults = [];
const $ = (id) => document.getElementById(id);
const groupNames = ['Music', 'Browser', 'Call', 'Speakers', 'Headset', 'Microphone', 'EQ App'];
for (const group of groupNames) {
  const option = new Option(group, group);
  $('group').add(option);
}
function send(event, payload) {
  if (socket?.readyState === 1) socket.send(JSON.stringify({ event, context, ...payload }));
}
function backend(payload) {
  send('sendToPlugin', { payload });
}
window.connectElgatoStreamDeckSocket = function (port, uuid, event, appInfo, actionInfo) {
  context = uuid;
  settings = JSON.parse(actionInfo).payload.settings ?? {};
  socket = new WebSocket('ws://127.0.0.1:' + port);
  socket.onopen = () => {
    socket.send(JSON.stringify({ event, uuid }));
    backend({ event: 'catalog' });
  };
  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.event === 'didReceiveSettings') {
      settings = data.payload.settings;
      render();
      return;
    }
    if (data.event !== 'sendToPropertyInspector') return;
    const p = data.payload;
    if (p.event === 'catalog') {
      state = p.state;
      groups = p.groups ?? {};
      settings = p.settings ?? settings;
      render();
    } else if (p.event === 'state') {
      const hadMethods = state.methods?.length;
      state = p.state;
      groups = p.groups ?? groups;
      status();
      if (!hadMethods && state.methods?.length) render();
    } else if (p.event === 'autoeqSearch') {
      searchResults = p.result.entries ?? [];
      renderFields();
    } else if (p.event === 'error') $('result').textContent = p.message;
    else if (p.event === 'result') $('result').textContent = summary(p.result);
  };
};
function status() {
  $('status').textContent = state.message ?? 'Offline';
  $('setup').hidden = state.status === 'ready';
}
function render() {
  status();
  const select = $('method');
  select.replaceChildren();
  select.add(new Option('Choose action…', ''));
  for (const d of state.methods ?? []) select.add(new Option(d.title, d.method));
  select.value = settings.method ?? '';
  $('group').value = settings.group ?? '';
  $('step').value = settings.step ?? 1;
  $('push').value = settings.pushMethod ?? '';
  renderFields();
}
function source(name) {
  const s = state.snapshot ?? {};
  if (name === 'apps')
    return (s.apps ?? [])
      .map((a) => ({ value: { appId: a.appId }, name: a.name + (a.active ? '' : ' (inactive)') }))
      .concat([{ value: { selector: 'audibleApp' }, name: 'Currently audible app' }]);
  if (['devices', 'inputs', 'outputs'].includes(name))
    return (s.devices?.devices ?? [])
      .filter((d) => name === 'devices' || d.direction === (name === 'inputs' ? 'input' : 'output'))
      .map((d) => ({
        value: { deviceUID: d.deviceUID, direction: d.direction },
        id: d.deviceUID,
        name: d.name + ' (' + d.direction + ')',
      }));
  if (['eqPresets', 'userPresets'].includes(name))
    return (s.eq?.presets ?? [])
      .filter((p) => name === 'eqPresets' || !p.builtin)
      .map((p) => ({ id: p.id, name: p.name }));
  if (['autoeq', 'importedProfiles'].includes(name))
    return [...(s.autoeq?.profiles ?? []), ...searchResults]
      .filter((p) => name === 'autoeq' || p.source === 'imported')
      .map((p) => ({ id: p.id, name: p.name }));
  if (name === 'bluetooth')
    return (s.bluetooth?.devices ?? []).map((d) => ({ id: d.id, name: d.name }));
  return [];
}
function element(tag, text, parent) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}
function inputField(field, value, parent) {
  const label = element('label', field.name.replace(/([A-Z])/g, ' $1'), parent);
  if (field.type === 'strings' && field.ordered) {
    const items = source(field.source ?? 'devices');
    const values = Array.isArray(value) ? [...value] : [];
    const rows = element('div', null, label);
    const select = element('select', null, label);
    select.add(new Option('Add device…', ''));
    for (const item of items) select.add(new Option(item.name, item.id));
    const render = () => {
      rows.replaceChildren();
      values.forEach((uid, index) => {
        const row = element('div', null, rows);
        row.className = 'scene-row';
        element('span', items.find((i) => i.id === uid)?.name ?? 'Unavailable: ' + uid, row);
        const up = element('button', '↑', row);
        up.dataset.move = 'up';
        up.dataset.uid = uid;
        up.disabled = index === 0;
        up.onclick = () => {
          [values[index - 1], values[index]] = [values[index], values[index - 1]];
          render();
        };
        const down = element('button', '↓', row);
        down.disabled = index === values.length - 1;
        down.onclick = () => {
          [values[index + 1], values[index]] = [values[index], values[index + 1]];
          render();
        };
        const remove = element('button', 'Remove', row);
        remove.onclick = () => {
          values.splice(index, 1);
          render();
        };
      });
    };
    select.onchange = () => {
      if (select.value && !values.includes(select.value)) values.push(select.value);
      select.value = '';
      render();
    };
    render();
    return () => [...values];
  }
  if (
    field.type === 'target' ||
    (field.source && field.type === 'string') ||
    field.type === 'strings'
  ) {
    const select = element('select', null, label);
    select.multiple = field.type === 'strings';
    if (!select.multiple) select.add(new Option('Choose…', ''));
    const items = source(field.source ?? (field.type === 'target' ? 'apps' : ''));
    if(field.type==='target'&&['devices','outputs','inputs'].includes(field.source)) {
      if(field.source!=='inputs')items.push({value:{selector:'defaultOutput'},name:'Current system output'});
      if(field.source!=='outputs')items.push({value:{selector:'defaultInput'},name:'Current system input'});
    }
    const picked = field.type === 'target' ? JSON.stringify(value) : value;
    for (const item of items) {
      const option = new Option(
        item.name,
        field.type === 'target' ? JSON.stringify(item.value) : item.id,
      );
      if (Array.isArray(value)) option.selected = value.includes(item.id);
      select.add(option);
    }
    if (field.type === 'target' && settings.group) value = groups[settings.group] ?? value;
    if (!select.multiple) {
      const current = field.type === 'target' ? JSON.stringify(value) : value;
      if (current && !Array.from(select.options).some((o) => o.value === current))
        select.add(
          new Option(
            'Unavailable: ' +
              String(typeof value === 'object' ? (value.appId ?? value.deviceUID) : value),
            current,
          ),
        );
      select.value = current ?? '';
    }
    if (field.source === 'autoeq') {
      const search = element('input', null, label);
      search.placeholder = 'Search headphones…';
      const b = element('button', 'Search', label);
      b.onclick = () => backend({ event: 'searchAutoEQ', query: search.value });
    }
    return () =>
      select.multiple
        ? Array.from(select.selectedOptions).map((o) => o.value)
        : select.value
          ? field.type === 'target'
            ? JSON.parse(select.value)
            : select.value
          : undefined;
  }
  if (field.type === 'boolean' || field.choices) {
    const select = element('select', null, label);
    select.add(new Option(field.required === false ? 'Leave unchanged' : 'Choose…', ''));
    for (const v of field.type === 'boolean' ? [true, false] : field.choices)
      select.add(new Option(v === true ? 'On' : v === false ? 'Off' : String(v), String(v)));
    select.value = value === undefined ? '' : String(value);
    return () =>
      select.value === ''
        ? undefined
        : field.type === 'boolean'
          ? select.value === 'true'
          : select.value;
  }
  if (field.type === 'bands') {
    const grid = element('div', null, label);
    grid.className = 'bands';
    const frequencies = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const inputs = frequencies.map((hz, i) => {
      const l = element('label', hz + ' Hz', grid);
      const input = element('input', null, l);
      input.type = 'number';
      input.min = -12;
      input.max = 12;
      input.step = 0.5;
      input.value = value?.[i] ?? 0;
      return input;
    });
    return () => inputs.map((i) => Number(i.value));
  }
  if (field.type === 'profileText') {
    const file = element('input', null, label);
    file.type = 'file';
    file.accept = '.txt';
    const text = element('textarea', null, label);
    text.placeholder = 'ParametricEQ.txt content';
    text.value = value ?? '';
    file.onchange = async () => {
      if (!file.files?.[0]) return;
      if (file.files[0].size > 250000) {
        $('result').textContent = 'Profile text exceeds 250 KB';
        return;
      }
      text.value = await file.files[0].text();
    };
    return () => text.value;
  }
  if (field.type === 'preferences') {
    const select = element('select', null, label);
    const prefs = state.snapshot?.preferences ?? {};
    const allowed = [
      'launchAtLogin',
      'menuBarIconStyle',
      'defaultNewAppVolume',
      'lockInputDevice',
      'showDeviceDisconnectAlerts',
      'loudnessCompensationEnabled',
      'loudnessEqualizationEnabled',
      'hudStyle',
      'mediaKeyControlEnabled',
      'volumeHotkeyStep',
      'appearance',
      'popupSize',
    ];
    for (const key of allowed) select.add(new Option(key.replace(/([A-Z])/g, ' $1'), key));
    select.value = Object.keys(value ?? {})[0] ?? allowed[0];
    const area = element('div', null, label);
    let getter;
    const choices = {
      menuBarIconStyle: ['Default', 'Speaker', 'Device', 'Waveform', 'Equalizer'],
      hudStyle: ['tahoe', 'classic'],
      volumeHotkeyStep: ['coarse', 'normal', 'fine', 'extraFine'],
      appearance: ['system', 'light', 'dark'],
      popupSize: ['compact', 'comfortable', 'spacious'],
    };
    const build = () => {
      area.replaceChildren();
      const key = select.value;
      getter = inputField(
        {
          name: key,
          type:
            typeof prefs[key] === 'boolean'
              ? 'boolean'
              : typeof prefs[key] === 'number'
                ? 'number'
                : 'string',
          minimum: 0,
          maximum: 1,
          choices: choices[key],
        },
        value?.[key] ?? prefs[key],
        area,
      );
    };
    select.onchange = build;
    build();
    return () => ({ [select.value]: getter() });
  }
  if (field.type === 'commands') {
    const area = element('div', null, label);
    const rows = [];
    const add = (command = {}) => {
      const box = element('div', null, area);
      box.className = 'scene-row';
      const select = element('select', null, box);
      select.add(new Option('Choose command…', ''));
      for (const d of state.methods ?? []) {
        if (
          d.method === 'batch.execute' ||
          /\.(step|toggle|cycle|get|list|search|describe|subscribe|status)$/.test(d.method) ||
          d.destructive
        )
          continue;
        select.add(new Option(d.title, d.method));
      }
      select.value = command.method ?? '';
      const fields = element('div', null, box);
      let read = () => ({});
      const row = { read: () => ({ method: select.value, params: read() }) };
      rows.push(row);
      const build = () => {
        fields.replaceChildren();
        const d = state.methods?.find((x) => x.method === select.value);
        const getters = (d?.fields ?? []).map((f) => [
          f.name,
          inputField(f, command.params?.[f.name], fields),
        ]);
        read = () =>
          Object.fromEntries(getters.map(([k, g]) => [k, g()]).filter(([, v]) => v !== undefined));
      };
      select.onchange = build;
      build();
      const remove = element('button', 'Remove', box);
      remove.onclick = () => {
        rows.splice(rows.indexOf(row), 1);
        box.remove();
      };
    };
    for (const command of value ?? []) add(command);
    const b = element('button', 'Add command', label);
    b.onclick = () => {
      if (rows.length < 64) add();
    };
    return () => rows.map((r) => r.read());
  }
  const input = element('input', null, label);
  input.type = field.type === 'number' ? 'number' : 'text';
  if (field.minimum !== undefined) input.min = field.minimum;
  if (field.maximum !== undefined) input.max = field.maximum;
  input.step = 'any';
  input.value = value ?? '';
  return () =>
    input.value === '' ? undefined : field.type === 'number' ? Number(input.value) : input.value;
}
function renderFields() {
  const area = $('fields');
  area.replaceChildren();
  const descriptor = state.methods?.find((d) => d.method === $('method').value);
  $('dial').hidden = !(
    descriptor?.dialParameter ||
    ['app.volume.set', 'device.volume.set'].includes(descriptor?.method)
  );
  if (!descriptor) {
    readParams = () => ({});
    return;
  }
  const getters = descriptor.fields.map((f) => [
    f.name,
    inputField(f, settings.params?.[f.name], area),
  ]);
  if (descriptor.destructive) {
    const text = element(
      'p',
      'This action resets or deletes saved settings. Select it deliberately; it is excluded from the starter profile.',
      area,
    );
    text.className = 'hint';
  }
  if (descriptor.available === false)
    element('p', descriptor.unavailableReason ?? 'Unavailable', area);
  if (descriptor.method === 'shortcut.set') {
    const b = element('button', 'Record keyboard shortcut', area);
    b.onclick = () => {
      b.textContent = 'Press your shortcut…';
      window.addEventListener(
        'keydown',
        (e) => {
          e.preventDefault();
          const codes = {
            KeyA: 0,
            KeyS: 1,
            KeyD: 2,
            KeyF: 3,
            KeyH: 4,
            KeyG: 5,
            KeyZ: 6,
            KeyX: 7,
            KeyC: 8,
            KeyV: 9,
            KeyB: 11,
            KeyQ: 12,
            KeyW: 13,
            KeyE: 14,
            KeyR: 15,
            KeyY: 16,
            KeyT: 17,
            Digit1: 18,
            Digit2: 19,
            Digit3: 20,
            Digit4: 21,
            Digit6: 22,
            Digit5: 23,
            Equal: 24,
            Digit9: 25,
            Digit7: 26,
            Minus: 27,
            Digit8: 28,
            Digit0: 29,
            BracketRight: 30,
            KeyO: 31,
            KeyU: 32,
            BracketLeft: 33,
            KeyI: 34,
            KeyP: 35,
            Enter: 36,
            KeyL: 37,
            KeyJ: 38,
            Quote: 39,
            KeyK: 40,
            Semicolon: 41,
            Backslash: 42,
            Comma: 43,
            Slash: 44,
            KeyN: 45,
            KeyM: 46,
            Period: 47,
            Tab: 48,
            Space: 49,
            Backquote: 50,
            Backspace: 51,
            Escape: 53,
            ArrowLeft: 123,
            ArrowRight: 124,
            ArrowDown: 125,
            ArrowUp: 126,
          };
          const code = codes[e.code];
          if (code === undefined) {
            b.textContent = 'Unsupported key; try another';
            return;
          }
          const inputs = area.querySelectorAll('input');
          if (inputs.length >= 2) {
            inputs[0].value = code;
            inputs[1].value =
              (e.metaKey ? 256 : 0) |
              (e.shiftKey ? 512 : 0) |
              (e.altKey ? 2048 : 0) |
              (e.ctrlKey ? 4096 : 0);
          }
          b.textContent = e.key + ' recorded';
        },
        { once: true },
      );
    };
  }
  readParams = () =>
    Object.fromEntries(
      getters.map(([key, get]) => [key, get()]).filter(([, value]) => value !== undefined),
    );
}
$('method').onchange = () => {
  settings = { ...settings, method: $('method').value, params: {} };
  renderFields();
};
$('group').onchange = () => {
  settings.group = $('group').value;
  renderFields();
};
$('save').onclick = () => {
  const params = readParams();
  const group = $('group').value;
  if (group && params.target) {
    backend({ event: 'setGroupTarget', group, target: params.target });
    delete params.target;
  }
  settings = {
    ...settings,
    schemaVersion: 1,
    method: $('method').value,
    group,
    params,
    step: Number($('step').value) || 1,
    pushMethod: $('push').value || undefined,
  };
  send('setSettings', { payload: settings });
  $('result').textContent = 'Saved';
};
$('refresh').onclick = () => backend({ event: 'catalog' });
function summary(value, depth = 0) {
  if (depth > 4) return '';
  if (value === null) return 'Unavailable';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value))
    return value
      .slice(0, 40)
      .map((v) => summary(v, depth + 1))
      .join('\n');
  return Object.entries(value)
    .filter(([k]) => !['instanceId', 'revision'].includes(k))
    .map(([k, v]) => k + ': ' + summary(v, depth + 1))
    .join('\n');
}
