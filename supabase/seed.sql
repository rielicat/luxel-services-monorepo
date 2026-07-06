-- Seed data for local dev. Idempotent — safe to re-run.

-- Pricing config (CLP integers)
insert into public.pricing_config (id, value_int, description) values
  ('tools_surcharge_clp', 8000, 'Recargo cuando Luxel aporta los insumos.'),
  ('distance_per_km_clp', 400, 'Recargo por km desde el punto de operación más cercano.'),
  ('subscription_discount_pct_weekly', 15, 'Descuento % para suscripción semanal.'),
  ('subscription_discount_pct_biweekly', 10, 'Descuento % para suscripción quincenal.'),
  ('subscription_discount_pct_monthly', 5, 'Descuento % para suscripción mensual.')
on conflict (id) do update set
  value_int = excluded.value_int,
  description = excluded.description;

-- Service types
insert into public.service_types (slug, name_key, description_key, base_rate_clp, per_m2_rate_clp) values
  ('regular',  'service.regular.name',  'service.regular.desc',  15000, 250),
  ('deep',     'service.deep.name',     'service.deep.desc',     30000, 450)
on conflict (slug) do update set
  base_rate_clp = excluded.base_rate_clp,
  per_m2_rate_clp = excluded.per_m2_rate_clp;

-- Operation point: Santiago Centro + two operators
with op as (
  insert into public.operation_points (name, slug, lat, lng, service_radius_km, active)
  values ('Santiago Centro', 'santiago-centro', -33.4489, -70.6693, 25, true)
  on conflict (slug) do update set name = excluded.name
  returning id
)
insert into public.operators (operation_point_id, name)
select op.id, o.name
from op
cross join (values ('Operador 1'), ('Operador 2')) as o(name)
on conflict do nothing;

-- FAQ entries
insert into public.faq_entries (question_key, answer_key, keywords, priority) values
  ('faq.q.coverage', 'faq.a.coverage', array['cobertura','zona','region','santiago','llegan'], 100),
  ('faq.q.tools',    'faq.a.tools',    array['insumos','productos','herramientas','traer'], 90),
  ('faq.q.payment',  'faq.a.payment',  array['pago','pagar','tarjeta','transferencia','mercadopago','stripe'], 80),
  ('faq.q.cancel',   'faq.a.cancel',   array['cancelar','suscripcion','pausar'], 70)
on conflict do nothing;
