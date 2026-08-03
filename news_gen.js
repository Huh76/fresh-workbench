// 后端兜底：每 30 分钟抓取一次实时资讯写入 news.json（GitHub Pages 同源托管，前端 fetch 无 CORS）
const https=require('https');
const fs=require('fs');
const API='https://60s.viki.moe/v2/';
function get(url,hops){return new Promise((res,rej)=>{const r=https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},resp=>{if([301,302,307,308].includes(resp.statusCode)&&resp.headers.location&&(hops||0)<3)return res(get(resp.headers.location,(hops||0)+1));let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({s:resp.statusCode,b:d}));});r.on('error',rej);r.setTimeout(10000,()=>r.destroy(new Error('timeout')));});}
function jget(url){return get(url).then(r=>{try{return JSON.parse(r.b);}catch(e){return null;}});}
const CAT_KW={
  '财经':['股','央行','货币','基金','GDP','经济','涨停','跌停','理财','税','财报','上市','融资','房价','楼市','公积','房贷','零售','进出口','外贸','油价','黄金','金融','证券','保险'],
  '科技':['AI','人工智能','芯片','半导','手机','华为','苹果','小米','新能源','电动车','科技','数码','5G','大模型','算力','航天','卫星','量子','机器人','操作系统'],
  '互联网':['互联网','App','平台','直播','短视频','游戏','电商','支付宝','微信','抖音','快手','淘宝','京东','拼多多','外卖','网约车','算法','数据安'],
  '民生':['教育','医疗','养老','社保','物价','食品','安全','天气','高考','就业','工资','租房','民生','疫情','公交','出行','消费者','退休','户籍','婚姻']
};
function classify(t){
  for(const cat in CAT_KW){ if(CAT_KW[cat].some(k=>t.indexOf(k)>=0)) return cat; }
  return '社会';
}
(async()=>{
  const out=[];
  const s=await jget(API+'60s');
  const arr=s&&s.data&&s.data.news;
  if(Array.isArray(arr)) arr.forEach(x=>{const t=String(x).trim(); if(t) out.push({t,url:'',src:'60s每日要闻'});});
  const SRCS=['toutiao','weibo','zhihu','baidu','douyin','bilibili'];
  for(const k of SRCS){
    const j=await jget(API+k);
    const a=j&&j.data&&Array.isArray(j.data)?j.data:(j&&j.data&&j.data.list)?j.data.list:[];
    (a||[]).slice(0,12).forEach(it=>{
      const t=String(it.title||it.t||'').trim();
      const u=it.link||it.url||'';
      if(t) out.push({t,url:u,src:k});
    });
  }
  const items=out.map(x=>({t:x.t,url:x.url,src:x.src,cat:classify(x.t)}));
  const data={updated:new Date().toISOString(), items};
  fs.writeFileSync('news.json', JSON.stringify(data,null,2));
  console.log('news.json written, items=', items.length);
})().catch(e=>{console.error('news_gen error',e.message); process.exit(1);});
