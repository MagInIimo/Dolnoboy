from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'game/src/ui.js'
t = p.read_text(encoding='utf-8')
old="else if(this.screen==='garage'){const disabled=at?'':'disabled';"
new="else if(this.screen==='garage'){const refill=Math.min(this.model.capacity-d.truck.fuel,d.money/55),refillCost=Math.ceil(refill*55),repairCost=Math.ceil(d.truck.damage*120);"
assert t.count(old)==1
t=t.replace(old,new)
old='data-ui="refuel" ${disabled}>${this.t(\'refuel\')} · ${this.cash((this.model.capacity-d.truck.fuel)*55)}'
new='data-ui="refuel" ${!at||refill<.5?\'disabled\':\'\'}>${this.t(\'refuel\')} · ${this.cash(refillCost)}'
assert t.count(old)==1
t=t.replace(old,new)
old='data-ui="repair" ${disabled}>${this.t(\'repair\')} · ${this.cash(d.truck.damage*120)}'
new='data-ui="repair" ${!at||repairCost<1||repairCost>d.money?\'disabled\':\'\'}>${this.t(\'repair\')} · ${this.cash(repairCost)}'
assert t.count(old)==1
p.write_text(t.replace(old,new),encoding='utf-8')
print('Garage prices match actual affordable fuel and rounded repair charges.')
