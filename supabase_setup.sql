-- Execute este arquivo no SQL Editor do Supabase.
create table if not exists public.delivery_areas (
  id text primary key,
  name text not null,
  label text not null,
  price numeric(10,2),
  risk boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.delivery_areas enable row level security;

drop policy if exists "public can read delivery areas" on public.delivery_areas;
create policy "public can read delivery areas"
on public.delivery_areas for select
to anon, authenticated
using (true);

drop policy if exists "authenticated users can update delivery areas" on public.delivery_areas;
create policy "authenticated users can update delivery areas"
on public.delivery_areas for update
to authenticated
using (true)
with check (true);

grant select on public.delivery_areas to anon, authenticated;
grant update on public.delivery_areas to authenticated;

insert into public.delivery_areas (id,name,label,price,risk,active)
values
('area-01','R$50,00','nova area',50.0,false,true),
('area-02','R$45,00','Área R$45,00',45.0,false,true),
('area-03','30,00','Área 30,00',30.0,false,true),
('area-04','R$44,00','Área R$44,00',44.0,false,true),
('area-05','R$40,00','Área R$40,00',40.0,false,true),
('area-06','R$40,00','Área R$40,00',40.0,false,true),
('area-07','R$38,00','Área R$38,00',38.0,false,true),
('area-08','R$37,00','Destino casa',37.0,false,true),
('area-09','R$33,00','Região Preta +/- 10 ~ 15 km',33.0,false,true),
('area-10','R$ 30,00','Destino casa',30.0,false,true),
('area-11','R$29,00','Área R$29,00',29.0,false,true),
('area-12','R$28,00','Área R$28,00',28.0,false,true),
('area-13','R$ 26,00','Destino casa',26.0,false,true),
('area-14','R$24,00','Região Oliva 9 Km',24.0,false,true),
('area-15','R$22,00','Região azul 1 7 Km',22.0,false,true),
('area-16','R$20,00','Região Verde Limão 6 5 Km',20.0,false,true),
('area-17','R$18,00','Região Extremo Leste',18.0,false,true),
('area-18','R$18,00','Região verde 5 4 Km',18.0,false,true),
('area-19','R$16,00','Região verde 4 3 Km',16.0,false,true),
('area-20','RS16,00','Região verde 3 2 Km',16.0,false,true),
('area-21','R$14,00','Região verde 2 1.5 Km',14.0,false,true),
('area-22','R$14,00','Região verde 1 1 KM',14.0,false,true),
('area-23','OBS (Área de Risco) 1 não atendemos','OBS (Área de Risco) 1 não atendemos',null,true,true),
('area-24','OBS (Área de Risco) 2 não atendemos','OBS (Área de Risco) 2 não atendemos',null,true,true),
('area-25','OBS (Área de Risco) 3 não atendemos','OBS (Área de Risco) 3 não atendemos',null,true,true),
('area-26','Shirley Karintô','Área Shirley Karintô',null,false,true)
on conflict (id) do update set
  name = excluded.name,
  label = excluded.label,
  price = excluded.price,
  risk = excluded.risk,
  active = excluded.active,
  updated_at = now();

-- Para receber alterações em tempo real:
alter publication supabase_realtime add table public.delivery_areas;
