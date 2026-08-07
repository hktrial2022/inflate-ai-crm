-- ============================================================
-- Re-assert the exact sign-up trigger function. Something outside
-- our migrations (possibly the Supabase dashboard's AI assistant,
-- used while debugging the earlier 500 errors) appears to have
-- altered this function — new sign-ups founded a company and a
-- team_members row correctly, but never seeded the 6 default
-- pipeline stages. This restores the intended behavior exactly.
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_role text := 'sales';
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  if lower(new.email) = 'support@evosynapse.ai' then
    insert into public.team_members (id, name, email, role, account_id)
    values (new.id, v_name, new.email, 'super_admin', null)
    on conflict (id) do nothing;
    insert into public.super_admins (user_id) values (new.id) on conflict do nothing;
    return new;
  end if;

  if (new.raw_user_meta_data ->> 'join_account_id') is not null then
    v_account_id := (new.raw_user_meta_data ->> 'join_account_id')::uuid;
    v_role := 'sales';
  else
    insert into public.accounts (name, owner_id)
    values (coalesce(new.raw_user_meta_data ->> 'company_name', v_name || '''s Company'), new.id)
    returning id into v_account_id;
    v_role := 'admin';

    insert into public.stages (account_id, id, name_en, name_es, color, is_won, is_lost, position) values
      (v_account_id, 'new',         'New Lead',      'Lead Nuevo',           '#64748b', false, false, 0),
      (v_account_id, 'qualified',   'Qualified',     'Calificado',           '#0ea5e9', false, false, 1),
      (v_account_id, 'proposal',    'Proposal Sent', 'Propuesta Enviada',    '#a855f7', false, false, 2),
      (v_account_id, 'negotiation', 'Negotiation',   'Negociación',          '#f59e0b', false, false, 3),
      (v_account_id, 'won',         'Closed Won',    'Cerrado Ganado',       '#16a34a', true,  false, 4),
      (v_account_id, 'lost',        'Closed Lost',   'Cerrado Perdido',      '#ef4444', false, true,  5);
  end if;

  insert into public.team_members (id, name, email, role, account_id)
  values (new.id, v_name, new.email, v_role, v_account_id)
  on conflict (id) do update set role = excluded.role, account_id = excluded.account_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Done. Sign-up now founds a company AND seeds its 5-stage pipeline. 🎈
