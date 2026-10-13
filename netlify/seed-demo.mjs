// Sample data for the Netlify demo (run by build.mjs against a local copy of the CRM).
const BASE = (process.env.BASE || 'http://127.0.0.1:8091') + '/crm/api.php';
class C { constructor(){ this.cookie=''; }
  async call(action, body, params={}) { const u=new URL(BASE); u.searchParams.set('action',action); for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
    const h={'X-MAP-CRM':'1','Content-Type':'application/json'}; if (this.cookie) h.Cookie=this.cookie;
    const r=await fetch(u,{method: body?'POST':'GET', headers:h, body: body?JSON.stringify(body):undefined}); const sc=r.headers.get('set-cookie'); if (sc){const m=sc.match(/map_crm_sid=([^;]*)/); if(m) this.cookie='map_crm_sid='+m[1];}
    const j=await r.json(); if(!j.ok) throw new Error(action+': '+j.message+' '+(j.field||'')); return j; }
  save(entity,data,id=0){ return this.call('save',{entity,id,data}).then(r=>r.record); } }
const d = (n) => { const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
const nc=new C(); await nc.call('login',{username:'newcastle',password:'Map@2025#'});
const adm=new C(); await adm.call('login',{username:'admin',password:'Map@2025#'});
const st=await nc.call('status'); const off={}; st.offices.forEach(o=>off[o.name]=o.id);
const people=[['Sarah Ahmed','sarah.ahmed','adviser','mortgage_protection'],['James Carter','james.carter','adviser','mortgage_protection'],['Priya Patel','priya.patel','administrator','mortgage_protection'],['Mark Lewis','mark.lewis','adviser','mortgage_protection'],['Hannah Reid','hannah.reid','adviser','protection']];
const ids={};
for (const [n,u,r,a] of people) { await new C().call('register',{full_name:n,email:u+'@themaap.co.uk',username:u,password:'Welcome123',advice_type:a}); }
await new C().call('register',{full_name:'Dan Hughes',email:'dan.hughes@themaap.co.uk',username:'dan.hughes',password:'Welcome123',advice_type:'mortgage_protection'});
const users=(await adm.call('adminUsers')).rows;
for (const u of users.filter(x=>x.status==='pending')) { const p=people.find(x=>x[1]===u.username); await adm.call('adminUserApprove',{id:u.id,role:p?p[2]:'sales',office_id:p?off.Newcastle:0,advice_type:u.advice_type}); }
await new C().call('register',{full_name:'Ellie Brooks',email:'ellie.brooks@themaap.co.uk',username:'ellie.brooks',password:'Welcome123',advice_type:'mortgage_protection'});
await new C().call('register',{full_name:'Ben Ford',email:'ben.ford@themaap.co.uk',username:'ben.ford',password:'Welcome123',advice_type:'protection'});
(await adm.call('adminUsers')).rows.forEach(u=>ids[u.username]=u.id);
const intro=await nc.save('introducers',{name:'Rachel Green',company:'Tyneside Homes Estate Agents',type:'estate_agent',phone:'0191 555 0101',email:'rachel@tynesidehomes.example',commission_terms:'£100 per completion',active:true});
const intro2=await nc.save('introducers',{name:'Patel & Co Solicitors',company:'Patel & Co',type:'solicitor',active:true});
const leads=[['Olivia','Bennett','ftb','website','asap',220000,ids['sarah.ahmed']],['Noah','Clarke','remortgage','existing_client','1m',180000,ids['james.carter']],['Amelia','Hughes','btl','introducer','3m',150000,ids['sarah.ahmed'],intro.id],['George','Wilson','protection','phone','6m',0,ids['mark.lewis']],['Isla','Turner','home_mover','social','12m',310000,ids['james.carter']],['Leo','Robinson','ftb','event','browsing',0,null]];
for (const [f,l,t,s,ts,loan,adv,iid] of leads) await nc.save('leads',{first_name:f,last_name:l,enquiry_type:t,source:s,timescale:ts,loan_amount:loan||'',phone:'07700 9'+Math.floor(10000+Math.random()*89999),email:f.toLowerCase()+'@example.com',adviser_id:adv||'',introducer_id:iid||'',administrator_id:ids['priya.patel']});
const clients=[['Emma','Thompson','NE1 4ST',ids['sarah.ahmed']],['Harry','Walker','NE3 2AB',ids['james.carter']],['Sophia','Wright','NE8 1QQ',ids['sarah.ahmed']],['Jack','Hall','DH1 3LE',ids['mark.lewis']],['Grace','Allen','NE11 0JW',ids['james.carter']],['Thomas','Young','SR1 1AA',ids['mark.lewis']],['Chloe','King','NE2 4AA',ids['sarah.ahmed']]];
const cl=[]; for (const [f,l,pc,adv] of clients) cl.push(await nc.save('clients',{first_name:f,last_name:l,postcode:pc,adviser_id:adv,administrator_id:ids['priya.patel'],phone:'07700 9'+Math.floor(10000+Math.random()*89999),email:f.toLowerCase()+'.'+l.toLowerCase()+'@example.com',employment_status:'employed',annual_income:42000,introducer_id:intro.id,existing_plans:'Workplace death in service 4x salary (Royal London).'}));
const cases=[[0,'ftb','application','Halifax',225000,260000],[1,'home_mover','offer','Nationwide',310000,420000],[2,'remortgage','dip','Barclays',160000,280000],[3,'btl','valuation','The Mortgage Works',150000,210000],[4,'ftb','fact_find','',190000,215000],[5,'shared_ownership','conveyancing','Santander',120000,150000],[6,'remortgage','enquiry','',200000,330000]];
const ks=[]; for (const [i,t,stage,lender,loan,val] of cases) ks.push(await nc.save('cases',{client_id:cl[i].id,case_type:t,stage,lender,loan_amount:loan,property_value:val,rate:4.29,rate_type:'fixed',fixed_term_years:5,proc_fee:Math.round(loan*0.0035),broker_fee:395,expected_completion_date:d(i*9-10),adviser_id:clients[i][3],administrator_id:ids['priya.patel']}));
// completed cases for the radar
await nc.save('cases',{client_id:cl[1].id,case_type:'remortgage',stage:'completed',completion_date:'2021-12-01',fixed_rate_end_date:d(95),lender:'HSBC',loan_amount:175000,rate:1.89,rate_type:'fixed',proc_fee:610,adviser_id:ids['james.carter']});
await nc.save('cases',{client_id:cl[3].id,case_type:'ftb',stage:'completed',completion_date:'2023-03-10',fixed_rate_end_date:d(160),lender:'NatWest',loan_amount:198000,rate:4.1,rate_type:'fixed',proc_fee:700,adviser_id:ids['mark.lewis']});
await nc.save('cases',{client_id:cl[5].id,case_type:'home_mover',stage:'completed',completion_date:d(-20),fixed_term_years:5,lender:'Coventry',loan_amount:260000,rate:4.35,rate_type:'fixed',proc_fee:900,broker_fee:495,adviser_id:ids['mark.lewis']});
await nc.save('cases',{client_id:cl[6].id,case_type:'ftb',stage:'completed',completion_date:'2024-05-01',fixed_rate_end_date:d(-12),lender:'Leeds BS',loan_amount:150000,rate:5.1,rate_type:'fixed',adviser_id:ids['sarah.ahmed']});
await nc.save('policies',{client_id:cl[0].id,policy_type:'life',status:'on_risk',provider:'Aviva',premium:24.5,sum_assured:225000,start_date:d(-300),commission:540,adviser_id:ids['sarah.ahmed']});
await nc.save('policies',{client_id:cl[1].id,policy_type:'home',status:'on_risk',provider:'LV=',premium:31.2,renewal_date:d(18),start_date:d(-347)});
await nc.save('policies',{client_id:cl[2].id,policy_type:'ip',status:'quote',provider:'Legal & General',premium:42,sum_assured:2200,quote_date:d(-20)});
await nc.save('policies',{client_id:cl[3].id,policy_type:'landlord',status:'applied',provider:'Direct Line',premium:28});
await nc.call('documentPack',{case_id:ks[0].id}); await nc.call('documentPack',{case_id:ks[1].id});
await nc.call('addActivity',{case_id:ks[0].id,type:'call',outcome:'Spoke to client',summary:'Talked through the Halifax application. Payslips to follow by Friday.',follow_up_date:d(2),follow_up_title:'Chase payslips from Emma'});
await nc.call('addActivity',{client_id:cl[1].id,type:'email',summary:'Sent the mortgage offer summary and solicitor details.'});
await nc.save('tasks',{title:'Send suitability letter to Harry Walker',due_date:d(-2),priority:'high',assigned_to:ids['james.carter'],client_id:cl[1].id,case_id:ks[1].id});
await nc.save('tasks',{title:'Book valuation follow-up',due_date:d(0),assigned_to:ids['newcastle'],case_id:ks[3].id});
await nc.save('tasks',{title:'Weekly pipeline review',due_date:d(3),assigned_to:ids['newcastle']});
// General Sales
const ev=await nc.call('salesEventSave',{name:'Newcastle Home Show 2026',event_date:d(-14),location:'Utilita Arena, Newcastle',organiser:'North East Property Events',sponsorship_cost:1800});
await nc.call('salesImport',{event_id:ev.id,assume_consent:false,rows:[
 {name:'Ava Morgan',phone:'07700 900301',email:'ava@example.com',consent:'Yes',interest:'First home'},{name:'Ethan Price',phone:'07700 900302',consent:'Yes',interest:'Remortgage'},
 {name:'Mia Scott',phone:'07700 900303',consent:'Yes'},{name:'Lucas Green',phone:'07700 900304',consent:'No'},{name:'Ava Morgan',phone:'07700900301',consent:'Yes'},
 {name:'Zara Khan',phone:'07700 900305',consent:'Y',interest:'Life cover'},{name:'Ryan Bell',phone:'07700 900306',consent:'yes',interest:'Buy to let'}]});
// Protection-only adviser's work
await nc.save('leads',{first_name:'Ruby',last_name:'Shaw',enquiry_type:'protection',source:'website',timescale:'asap',phone:'07700 900411',email:'ruby@example.com',adviser_id:ids['hannah.reid']});
await nc.save('leads',{first_name:'Owen',last_name:'Marsh',enquiry_type:'insurance',source:'phone',timescale:'1m',phone:'07700 900412',adviser_id:ids['hannah.reid']});
await nc.save('policies',{client_id:cl[4].id,policy_type:'ci',status:'quote',provider:'Vitality',premium:38,sum_assured:120000,quote_date:d(-6),adviser_id:ids['hannah.reid']});
await nc.save('policies',{client_id:cl[6].id,policy_type:'life',status:'on_risk',provider:'Royal London',premium:19.5,sum_assured:200000,start_date:d(-40),commission:460,adviser_id:ids['hannah.reid']});
await nc.save('tasks',{title:'Call Ruby Shaw about life cover',due_date:d(0),priority:'high',assigned_to:ids['hannah.reid']});

// Two recent completions, so "Completions this month" has something to show.
await nc.save('cases',{client_id:cl[0].id,case_type:'remortgage',stage:'completed',completion_date:d(-2),fixed_term_years:5,lender:'Santander',loan_amount:185000,rate:4.15,rate_type:'fixed',proc_fee:650,broker_fee:395,adviser_id:ids['sarah.ahmed']});
await nc.save('cases',{client_id:cl[4].id,case_type:'ftb',stage:'completed',completion_date:d(-6),fixed_term_years:2,lender:'Skipton',loan_amount:165000,rate:4.6,rate_type:'fixed',proc_fee:580,broker_fee:395,adviser_id:ids['james.carter']});

// Nottingham and London: a little of everything, so every office login has something to show.
for (const [office, people2] of [['nottingham', [['Ellis', 'Ward', 'NG7 2RD'], ['Maya', 'Singh', 'NG5 1AA'], ['Daniel', 'Okafor', 'NG2 3BB']]],
  ['london', [['Olivia', 'Grant', 'SE1 7PB'], ['Kwame', 'Mensah', 'E14 5AB'], ['Lily', 'Chen', 'N1 9GU']]]]) {
  const o = new C(); await o.call('login', { username: office, password: 'Map@2025#' });
  await o.save('leads', { first_name: 'Hassan', last_name: office === 'london' ? 'Ali' : 'Begum', enquiry_type: 'ftb', source: 'website', timescale: 'asap', loan_amount: 240000, phone: '07700 9' + (office === 'london' ? '20101' : '10101'), email: office + '.lead1@example.com' });
  await o.save('leads', { first_name: 'Grace', last_name: office === 'london' ? 'Okoye' : 'Hill', enquiry_type: 'remortgage', source: 'existing_client', timescale: '3m', loan_amount: 175000, phone: '07700 9' + (office === 'london' ? '20102' : '10102') });
  await o.save('leads', { first_name: 'Tom', last_name: office === 'london' ? 'Byrne' : 'Fisher', enquiry_type: 'protection', source: 'phone', timescale: '1m', phone: '07700 9' + (office === 'london' ? '20103' : '10103') });
  const cls = [];
  for (const [f, l, pc] of people2) cls.push(await o.save('clients', { first_name: f, last_name: l, postcode: pc, phone: '07700 9' + Math.floor(10000 + Math.random() * 89999), email: f.toLowerCase() + '.' + l.toLowerCase() + '@example.com', employment_status: 'employed', annual_income: 38000 + Math.floor(Math.random() * 30000) }));
  await o.save('cases', { client_id: cls[0].id, case_type: 'ftb', stage: 'application', lender: 'Halifax', loan_amount: 230000, property_value: 270000, rate: 4.39, rate_type: 'fixed', fixed_term_years: 5, proc_fee: 805, broker_fee: 395, expected_completion_date: d(35) });
  await o.save('cases', { client_id: cls[1].id, case_type: 'remortgage', stage: 'offer', lender: 'Nationwide', loan_amount: 185000, property_value: 320000, rate: 4.05, rate_type: 'fixed', fixed_term_years: 2, proc_fee: 650, expected_completion_date: d(18) });
  await o.save('cases', { client_id: cls[2].id, case_type: 'home_mover', stage: 'completed', completion_date: d(-25), fixed_term_years: 5, lender: 'Barclays', loan_amount: 300000, rate: 4.2, rate_type: 'fixed', proc_fee: 1050, broker_fee: 495 });
  await o.save('policies', { client_id: cls[0].id, policy_type: 'life', status: 'quote', provider: 'Aviva', premium: 22, sum_assured: 230000, quote_date: d(-3) });
  await o.save('policies', { client_id: cls[2].id, policy_type: 'home', status: 'on_risk', provider: 'Aviva', premium: 29.5, start_date: d(-340), renewal_date: d(25) });
  await o.save('tasks', { title: 'Chase valuation report for ' + people2[0][0] + ' ' + people2[0][1], due_date: d(1), priority: 'high', client_id: cls[0].id });
  await o.save('tasks', { title: 'Weekly pipeline review', due_date: d(2) });
}
console.log('seeded', Object.keys(ids).length, 'users');
