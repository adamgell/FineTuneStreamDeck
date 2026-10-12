from pathlib import Path
import json,struct,zlib,zipfile,uuid
root=Path('com.finetune.streamdeck.sdPlugin')
def png(path, muted=False, size=72):
 w=h=size; rows=[]
 for y in range(h):
  row=bytearray([0])
  for px in range(w):
   x=px*144/w; sy=y*144/h
   c=(15,24,31,255)
   for i,top in enumerate([59,37,25,47,65]):
    if 30+i*18<=x<42+i*18 and top<=sy<=114: c=(248,94,94,255) if muted else (67,224,189,255)
   if muted and abs(sy-(144-x))<5 and 22<x<122: c=(255,245,245,255)
   row.extend(c)
  rows.append(row)
 def chunk(name,data):return struct.pack('!I',len(data))+name+data+struct.pack('!I',zlib.crc32(name+data)&0xffffffff)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
for name in ['plugin','action','category']:
 png(root/'imgs'/f'{name}.png');png(root/'imgs'/f'{name}@2x.png',size=144)
png(root/'imgs/muted.png',True);png(root/'imgs/muted@2x.png',True,size=144)
actions=[('command','FineTune Command'),('app-volume','App Volume'),('app-mute','App Mute'),('app-boost','App Boost'),('routing','App Routing'),('device-volume','Device Volume'),('device-mute','Device Mute'),('device-select','Select Audio Device'),('eq-band','EQ Band'),('eq-preset','EQ Preset'),('autoeq','Headphone Correction'),('loudness','Loudness'),('management','App Management'),('popup','FineTune Popup'),('scene','Audio Scene')]
manifest={'UUID':'com.finetune.streamdeck','Name':'FineTune','Description':'Complete local FineTune audio control, live feedback and shared Stream Deck profiles. Requires the FineTune automation API.','Author':'Adam Gell','Version':'0.1.0.0','SDKVersion':3,'CodePath':'bin/plugin.js','Icon':'imgs/plugin','Category':'FineTune','CategoryIcon':'imgs/category','URL':'https://github.com/ronitsingh10/FineTune','Software':{'MinimumVersion':'7.1'},'OS':[{'Platform':'mac','MinimumVersion':'15.4'}],'Nodejs':{'Version':'24'},'PropertyInspectorPath':'ui/index.html','Actions':[],'Profiles':[{'Name':'profiles/finetune-xl','DeviceType':2,'Readonly':False,'AutoInstall':False}]}
for slug,name in actions:
 d={'UUID':'com.finetune.streamdeck.'+slug,'Name':name,'Icon':'imgs/action','Tooltip':name+' using FineTune automation.','Controllers':['Keypad'],'States':[{'Image':'imgs/action','TitleAlignment':'middle','FontSize':12},{'Image':'imgs/muted','TitleAlignment':'middle','FontSize':12}]}
 if slug in ['command','app-volume','device-volume','eq-band']:
  d['Controllers'].append('Encoder');d['Encoder']={'layout':'$B1','TriggerDescription':{'Rotate':'Adjust value','Push':'Toggle mute (volume controls)','Touch':'Toggle mute (volume controls)'}}
 manifest['Actions'].append(d)
(root/'manifest.json').write_text(json.dumps(manifest,indent=2))
# A fresh export containing only our actions. No installed profiles are modified.
profileId=str(uuid.uuid4()).upper();pageId=str(uuid.uuid4()).upper()
slots=[]
def slot(slug,label,method,group=None,params=None):
 settings={'schemaVersion':1,'method':method,'params':params or {},'label':label}
 if group:settings['group']=group
 slots.append((slug,label,settings))
for group in ['Music','Browser']:
 slot('app-volume',group+' −','app.volume.step',group,{'domain':'percent','delta':-5})
 slot('app-volume',group+' +','app.volume.step',group,{'domain':'percent','delta':5})
 slot('app-mute',group+' Mute','app.mute.toggle',group)
 slot('app-boost',group+' Boost','app.boost.cycle',group)
slot('app-volume','Call −','app.volume.step','Call',{'domain':'percent','delta':-5})
slot('app-volume','Call +','app.volume.step','Call',{'domain':'percent','delta':5})
slot('app-mute','Call Mute','app.mute.toggle','Call')
slot('routing','Call Output','app.routing.set','Call',{'mode':'single'})
slot('device-select','Speakers','device.default.set','Speakers')
slot('device-select','Headset','device.default.set','Headset')
slot('popup','FineTune','ui.popup.toggle')
slot('command','Settings','ui.settings.open')
slot('command','EQ Toggle','app.eq.toggle','EQ App')
slot('eq-band','Bass −','app.eq.band.step','EQ App',{'band':0,'delta':-1})
slot('eq-band','Bass +','app.eq.band.step','EQ App',{'band':0,'delta':1})
slot('eq-preset','Flat EQ','app.eq.preset.apply','EQ App',{'presetId':'flat'})
slot('eq-preset','Voice EQ','app.eq.preset.apply','EQ App',{'presetId':'vocalClarity'})
slot('autoeq','Correction','autoeq.device.setEnabled','Headset',{'enabled':True})
slot('loudness','Loudness On','loudness.set',params={'enabled':True})
slot('loudness','Loudness Off','loudness.set',params={'enabled':False})
slot('device-volume','Mic −','device.volume.step','Microphone',{'delta':-5})
slot('device-volume','Mic +','device.volume.step','Microphone',{'delta':5})
slot('device-mute','Mic Mute','device.mute.toggle','Microphone')
slot('device-select','Select Mic','device.default.set','Microphone')
slot('routing','Call Default','app.routing.set','Call',{'mode':'followDefault'})
slot('command','Lock Mic','input.lock.set',params={'enabled':True})
slot('command','Unlock Mic','input.lock.set',params={'enabled':False})
slot('scene','Audio Scene','batch.execute',params={'commands':[]})
assert len(slots)==32
profile={'Device':{'Model':'20GAT9901','UUID':str(uuid.uuid4())},'Name':'FineTune XL','Pages':{'Current':'00000000-0000-0000-0000-000000000000','Default':pageId.lower(),'Pages':[]},'Version':'3.0'}
page={'Controllers':[{'Type':'Keypad','Actions':{}}],'Name':'FineTune XL','Icon':''}
for i,(slug,label,settings) in enumerate(slots):
 page['Controllers'][0]['Actions'][f'{i%8},{i//8}']={'ActionID':str(uuid.uuid4()),'LinkedTitle':False,'Name':label,'Plugin':{'Name':'FineTune','UUID':'com.finetune.streamdeck','Version':'0.1.0.0'},'Resources':None,'Settings':settings,'State':0,'States':[{'FontFamily':'','FontSize':12,'FontStyle':'','FontUnderline':False,'OutlineThickness':2,'ShowTitle':True,'TitleAlignment':'middle','TitleColor':'#ffffff'}],'UUID':'com.finetune.streamdeck.'+slug}
package={'AppVersion':'7.6.0','DeviceModel':'20GAT9901','DeviceSettings':None,'FormatVersion':1,'OSType':'macOS','OSVersion':'15.4','RequiredPlugins':['com.finetune.streamdeck']}
with zipfile.ZipFile(root/'profiles/finetune-xl.streamDeckProfile','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('package.json',json.dumps(package));base=f'Profiles/{profileId}.sdProfile/'
 z.writestr(base+'manifest.json',json.dumps(profile));z.writestr(base+f'Profiles/{pageId}/manifest.json',json.dumps(page))
