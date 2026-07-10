-- RLS policies alone do not expose tables through the Data API: Supabase's
-- current default (auto_expose_new_tables unset/false) means new tables
-- created in public are NOT auto-granted to anon/authenticated anymore.
-- Without these GRANTs, PostgREST rejects every request for `authenticated`
-- with "permission denied for table ..." before RLS policies are even
-- evaluated. `anon` intentionally gets nothing: these tables are private to
-- signed-in parents.
grant select, insert, update, delete on public.parents to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
