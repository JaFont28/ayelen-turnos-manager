-- 1) Fix mutable search_path on all functions
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin new.updated_at = now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.appointments_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  if extract(isodow from new.date) > 5 then
    raise exception 'No se atiende sábados ni domingos';
  end if;
  return new;
end; $function$;

-- 2) Restrict EXECUTE on SECURITY DEFINER / trigger functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appointments_business_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- 3) Public read access for non-sensitive booking data
DROP POLICY IF EXISTS "public read availability" ON public.availability;
CREATE POLICY "public read availability"
ON public.availability
FOR SELECT
TO anon, authenticated
USING (is_active);

GRANT SELECT (id, weekday, start_time, is_active) ON public.availability TO anon, authenticated;

DROP POLICY IF EXISTS "public read blocked slots" ON public.blocked_slots;
CREATE POLICY "public read blocked slots"
ON public.blocked_slots
FOR SELECT
TO anon, authenticated
USING (true);

-- reason may contain private notes: expose only scheduling columns
GRANT SELECT (id, date, start_time) ON public.blocked_slots TO anon, authenticated;

DROP POLICY IF EXISTS "public read site settings" ON public.site_settings;
CREATE POLICY "public read site settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT (id, professional_name, license, whatsapp, email, instagram, address, price_presencial, price_virtual, hold_minutes, updated_at) ON public.site_settings TO anon, authenticated;

GRANT ALL ON public.availability TO service_role;
GRANT ALL ON public.blocked_slots TO service_role;
GRANT ALL ON public.site_settings TO service_role;
