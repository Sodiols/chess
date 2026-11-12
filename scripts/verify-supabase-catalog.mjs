import { readdirSync } from "node:fs";
import { createDatabase } from "../tests/db/harness.ts";

const versions = readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file))
  .sort()
  .map((file) => `('${file.slice(0, 14)}')`)
  .join(", ");

const catalog = `
with tables as (
  select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), functions as (
  select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
)
select 'table' as kind, relname as name, jsonb_build_object('rls',relrowsecurity,
  'columns',(select jsonb_object_agg(attname,jsonb_build_array(format_type(atttypid,atttypmod),attnotnull))
    from pg_attribute where attrelid=t.oid and attnum>0 and not attisdropped),
  'grants',(select jsonb_object_agg(role, privileges) from (
    select role, jsonb_object_agg(privilege,has_table_privilege(role,t.oid,privilege)) as privileges
    from unnest(array['anon','authenticated','service_role']) role
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege group by role
  ) grants)) as details from tables t
union all
select 'function', proname || '(' || oidvectortypes(proargtypes) || ')',
  jsonb_build_object('args',coalesce(to_jsonb(proargnames),'[]'), 'defaults',pronargdefaults,
    'security_definer',prosecdef,'configuration',coalesce(to_jsonb(proconfig),'[]'),
    'body',md5(replace(prosrc,chr(13),'')),
    'public_execute',exists (select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE'),
    'anon',has_function_privilege('anon',oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',oid,'EXECUTE')) from functions
union all
select 'constraint',t.relname||'.'||c.conname,to_jsonb(pg_get_constraintdef(c.oid)) from pg_constraint c join tables t on t.oid=c.conrelid
union all
select 'index',t.relname||'.'||idx.relname,to_jsonb(pg_get_indexdef(i.indexrelid))
from pg_index i join tables t on t.oid=i.indrelid join pg_class idx on idx.oid=i.indexrelid
union all
select 'trigger',n.nspname||'.'||c.relname||'.'||g.tgname,jsonb_build_array(g.tgenabled::text,pg_get_triggerdef(g.oid))
from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not g.tgisinternal and (g.tgname like 'gambit_%' or g.tgrelid in (select oid from tables))
union all
select 'rls', 'realtime.messages', to_jsonb(c.relrowsecurity)
from pg_class c where c.oid=to_regclass('realtime.messages')
union all
select 'policy',schemaname||'.'||tablename||'.'||policyname,jsonb_build_array(permissive,roles,cmd,qual,with_check)
from pg_policies where schemaname='public' or (schemaname='realtime' and tablename='messages')
`;

const db = await createDatabase();
try {
  const { rows } = await db.query(catalog);
  const expected = JSON.stringify(rows).replaceAll("'", "''");
  console.log(`-- Gambit diagnostic. Copy the entire script into the Supabase SQL Editor and run it.
-- This SELECT only reads metadata. "recorded" is ledger evidence, separate from catalog matches.
-- A missing ledger entry can occur when SQL was applied manually. Review differences before any repair.

with expected as (
  select * from jsonb_to_recordset('${expected}'::jsonb) as e(kind text,name text,details jsonb)
), actual as (${catalog}), differences as (
select e.kind,e.name,case when a.name is null then 'missing' else 'different' end as status,
  e.details as expected,a.details as actual
from expected e left join actual a using(kind,name)
where (case when e.kind='table' then
  a.details->'rls' = e.details->'rls' and (a.details->'columns') @> (e.details->'columns')
  and a.details->'grants' = e.details->'grants'
  else a.details = e.details end) is distinct from true
union all
select a.kind,a.name,'unexpected',null,a.details
from actual a
where a.kind='policy'
  and (a.name like 'realtime.messages.%' or exists (
    select 1 from expected t
    where t.kind='table' and split_part(a.name,'.',2)=t.name
  ))
  and not exists (select 1 from expected e where e.kind=a.kind and e.name=a.name)
), ledger as materialized (
  select case when to_regclass('supabase_migrations.schema_migrations') is not null
    then query_to_xml('select version from supabase_migrations.schema_migrations', false, false, '')
    end as rows
), cron_catalog as materialized (
  select exists(select 1 from pg_extension where extname='pg_cron') as installed,
    case when to_regclass('cron.job') is not null then query_to_xml(
      'select jobid,schedule,command,database,active from cron.job where jobname = ''gambit-maintenance''',
      false, false, '') end as rows
), jobs as (
  select job.*
  from cron_catalog c cross join lateral xmltable('/table/row' passing c.rows columns
    jobid bigint, schedule text, command text, database text, active boolean) job
)
select * from differences
union all
select 'catalog','Gambit objects','match',null,null
where not exists (select 1 from differences)
union all
select 'migration',v.version,case when l.rows is null then 'ledger unavailable'
    when xpath_exists('/table/row/version[text()="' || v.version || '"]',l.rows) then 'recorded'
    else 'not recorded' end,null,null
from (values ${versions}) v(version) cross join ledger l
union all
select 'maintenance','gambit-maintenance',case
    when not c.installed then 'pg_cron unavailable'
    when c.rows is null then 'cron catalog unavailable'
    when j.jobid is null then 'job missing or not visible'
    when count(j.jobid) over () > 1 then 'multiple jobs visible'
    when not j.active then 'inactive'
    when j.database is distinct from current_database() then 'different database'
    when j.schedule is distinct from '* * * * *' then 'different schedule'
    when regexp_replace(lower(j.command),'[[:space:];]+','','g') is distinct from 'selectpublic.run_maintenance()'
      then 'different command'
    else 'scheduled' end,
  jsonb_build_object('schedule','* * * * *','command','select public.run_maintenance()','active',true),
  case when j.jobid is not null then to_jsonb(j) end
from cron_catalog c left join jobs j on true
order by kind,name;`);
} finally {
  await db.close();
}
