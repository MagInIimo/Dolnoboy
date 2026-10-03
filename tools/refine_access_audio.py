from pathlib import Path

root=Path(__file__).resolve().parents[1]
def change(file,old,new):
    p=root/file;t=p.read_text(encoding='utf-8')
    if old not in t and t.count(new)==1:return
    assert t.count(old)==1,(file,old[:60],t.count(old))
    p.write_text(t.replace(old,new),encoding='utf-8')

change('game/src/ui.js', "const paths={map:", "const paths={settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18',map:")
change('game/src/ui.js', '${this.t(key)}</button>`;', "${key==='settings'?icon('settings'):''}${this.t(key)}</button>`;")
change('game/src/ui.js', "<span>${this.t('language')}</span>", "<span>${icon('globe')} ${this.t('language')}</span>")
change('game/src/ui.js', "${this.licenseText??''}</pre>", "${String(this.licenseText??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>")
change('game/style.css', '.help-lines{font-size:13px', '.settings-row>span svg{width:18px;height:18px;vertical-align:middle;fill:none;stroke:var(--accent);stroke-width:1.6;margin-right:5px}.hero-links button svg{width:14px;height:14px;margin-right:4px}.help-lines{font-size:13px')
change('game/src/audio.js', 'g.connect(this.ctx.destination);', 'g.connect(this.master);')
change('game/src/input.js', "e.target.matches('input,textarea,select')", "e.target?.matches?.('input,textarea,select')")
change('game/src/input.js', "reset(){this.keys.clear();", "reset(){this.frame.querySelector('#steer-pad').style.setProperty('--steer','50%');this.keys.clear();")
print('Language icons, licence text, focus-safe audio and touch reset updated.')
