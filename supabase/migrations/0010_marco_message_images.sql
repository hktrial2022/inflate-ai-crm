-- ============================================================
-- MARCO — adjuntar imágenes a los mensajes.
-- ------------------------------------------------------------
-- Las imágenes se redimensionan en el cliente (máx. ~1280px, JPEG)
-- antes de subirse, así que un data-URL en un TEXT column es
-- razonable a este volumen — no se creó un bucket de Storage
-- separado para mantener esta fase sin infraestructura nueva. Si
-- el volumen de imágenes crece, migrar a Supabase Storage es el
-- siguiente paso natural sin cambiar el resto del esquema.
-- ============================================================

alter table public.marco_messages add column if not exists image_url text;

-- Done. 🎈
