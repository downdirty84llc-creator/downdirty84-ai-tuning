import {measuredChannelEntries,filterMeasuredChannels,channelStatistics,channelViews} from './measuredChannels.mjs';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const number=value=>value===null||value===undefined?'—':Number(value.toPrecision(7)).toString();
const name=entry=>entry.name||'Unnamed channel '+(entry.before??entry.after).id;
const units=entry=>entry.unit||'Unspecified units';
const coverage=c=>!c?'Not recorded':c.rows===0?'No included rows':`${c.numeric} / ${c.rows} (${Math.floor(c.percent*10)/10}%)`;
const flagLabels={CONSTANT_RECORDED_VALUE:'Constant recorded value',MISSING_READINGS:'Missing readings',NONNUMERIC_READINGS:'Nonnumeric readings'};
function makeTable(headers,label){
  const wrap=el('div');wrap.className='measured-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',label);
  const table=el('table'),head=el('thead'),row=el('tr'),body=el('tbody');
  for(const title of headers){const cell=el('th',title);cell.scope='col';row.append(cell);}head.append(row);table.append(head,body);wrap.append(table);return {wrap,body};
}
export function renderMeasuredChannels(root,review){
  const entries=measuredChannelEntries(review),section=el('section');section.className='measured-channels';section.setAttribute('aria-label','Measurement channel explorer');
  section.append(el('h4','Review individual channels'),el('p','Search by channel name, exported unit or ID. View filters change only this display. Numeric coverage is the number of numeric readings divided by included rows; it does not measure sensor accuracy. Changes are later minus earlier statistics, not performance gains.'));
  const controls=el('div');controls.className='trouble-fields';section.append(controls);
  const field=(label,node)=>{const wrapper=el('label',label);node.setAttribute('aria-label',label);wrapper.append(node);controls.append(wrapper);return node;};
  const query=field('Find a channel',el('input'));query.type='search';query.maxLength=240;query.placeholder='RPM, airflow, spark…';
  const statistic=field('Statistic to compare',el('select')),view=field('Show channels',el('select')),unit=field('Exported units',el('select'));
  for(const [value,label]of Object.entries(channelStatistics)){const option=el('option',label);option.value=value;statistic.append(option);}
  for(const [value,label]of Object.entries(channelViews)){const option=el('option',label);option.value=value;view.append(option);}
  const all=el('option','All exported units');all.value='';unit.append(all);
  const unitValues=[...new Set(entries.map(e=>e.unit))].sort();
  unitValues.forEach((value,index)=>{const option=el('option',value||'Unspecified units');option.value=String(index);unit.append(option);});
  const reset=el('button','Reset channel view');reset.type='button';reset.className='secondary';
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-label','Channel view summary');
  const list=el('div'),details=el('div');list.className='measured-channel-list';details.className='measured-channel-detail';details.setAttribute('role','region');details.setAttribute('aria-label','Selected channel details');details.tabIndex=-1;
  section.append(reset,status,list,details);root.append(section);let selected=null;
  const renderDetails=entry=>{
    details.replaceChildren();
    if(!entry){details.append(el('p','Choose a channel to inspect all statistics, reading counts and the saved recording windows.'));return;}
    details.append(el('h4',name(entry)+' · '+units(entry)));
    details.append(el('p',entry.paired?'Comparable exported label and units. The physical sensor meaning and test conditions still require review.':'Unpaired: '+entry.reason));
    for(const [title,key]of [['Earlier','before'],['Later','after']]){
      const c=entry[key],s=review[key],counts=entry[key+'Coverage'];
      if(!c){details.append(el('p',title+': no paired channel entry.'));continue;}
      details.append(el('h5',title+' recording'),el('p',s.source.name+' · channel ID '+c.id),el('p',`${s.selection.start}–${s.selection.end} seconds · ${s.rows} included rows`),el('p',`Numeric: ${counts.numeric} · Missing: ${counts.missing} · Nonnumeric: ${counts.text} · Numeric coverage: ${coverage(counts)}`));
      details.append(el('p',s.selection.filters.length?s.selection.filters.map(f=>`${f.name||f.id} [${f.unit||'unspecified'}]: ${f.min}–${f.max}`).join('; '):'No channel filters. Different operating conditions may explain differences.'));
    }
    const stats=makeTable(['Statistic','Earlier','Later','Later − earlier'],'Selected channel statistics');
    for(const [key,label]of Object.entries(channelStatistics)){
      const row=el('tr');for(const value of [label,number(entry.before?.[key]),number(entry.after?.[key]),number(entry.delta?.[key])])row.append(el('td',value));stats.body.append(row);
    }
    details.append(stats.wrap,el('p','Statistics are weighted by exported rows, not elapsed time. Missing and text readings are excluded from numeric statistics. A constant or zero value does not establish a healthy or failed sensor.'));
  };
  const render=()=>{
    const shown=filterMeasuredChannels(entries,{query:query.value,unit:unit.value===''?null:unitValues[Number(unit.value)],statistic:statistic.value,view:view.value});
    if(!shown.some(e=>e.key===selected))selected=null;
    status.textContent=`${shown.length} of ${entries.length} channel entries shown. ${shown.filter(e=>e.paired).length} comparable; ${shown.filter(e=>!e.paired).length} unpaired. Saved measurements are unchanged.`;
    list.replaceChildren();
    if(!shown.length)list.append(el('p','No channels match this view. Clear the search or reset the channel view.'));
    else{
      const label=channelStatistics[statistic.value],table=makeTable(['Channel','Unit','Earlier '+label.toLowerCase(),'Later '+label.toLowerCase(),'Later − earlier','Earlier numeric coverage','Later numeric coverage','Reading notes'],'Filtered measurement channels');
      for(const entry of shown){
        const row=el('tr'),cell=el('td'),pick=el('button',name(entry));pick.type='button';pick.className='secondary';pick.setAttribute('aria-label','Inspect '+name(entry)+' ['+units(entry)+']'+(entry.paired?'':entry.before?' — earlier only':' — later only'));pick.setAttribute('aria-pressed',String(selected===entry.key));
        pick.onclick=()=>{selected=entry.key;for(const button of list.querySelectorAll('button[aria-pressed]'))button.setAttribute('aria-pressed','false');pick.setAttribute('aria-pressed','true');renderDetails(entry);details.focus();};
        cell.append(pick);row.append(cell);
        const notes=entry.paired?entry.flags.map(f=>flagLabels[f]??f):[entry.reason];
        if(entry.paired&&entry.delta[statistic.value]===null)notes.push('Difference exceeds numeric range');
        for(const value of [entry.unit||'Unspecified',number(entry.before?.[statistic.value]),number(entry.after?.[statistic.value]),number(entry.delta?.[statistic.value]),coverage(entry.beforeCoverage),coverage(entry.afterCoverage),notes.join('; ')||'No missing or text readings'])row.append(el('td',value));
        table.body.append(row);
      }list.append(table.wrap);
    }
    renderDetails(shown.find(e=>e.key===selected));
  };
  query.oninput=render;for(const select of [statistic,view,unit])select.onchange=render;
  reset.onclick=()=>{query.value='';statistic.value='mean';view.value='all';unit.value='';selected=null;render();};
  render();
}
