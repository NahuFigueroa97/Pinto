-- ============================================================
-- PINTÓ v2 — Seed Demo Data
-- Run AFTER 001_schema.sql
-- These use fixed UUIDs for demo purposes
-- ============================================================

-- Get the first zone IDs
DO $$
DECLARE
  v_city_id uuid := 'c1000000-0000-0000-0000-000000000001';
  v_zone_centro uuid;
  v_zone_solar uuid;
  v_zone_jumeal uuid;
  v_zone_unca uuid;
  v_zone_ferial uuid;
  v_zone_valle uuid;
BEGIN
  SELECT id INTO v_zone_centro FROM public.zones WHERE name = 'Centro' AND city_id = v_city_id LIMIT 1;
  SELECT id INTO v_zone_solar FROM public.zones WHERE name = 'Alto del Solar' AND city_id = v_city_id LIMIT 1;
  SELECT id INTO v_zone_jumeal FROM public.zones WHERE name = 'El Jumeal' AND city_id = v_city_id LIMIT 1;
  SELECT id INTO v_zone_unca FROM public.zones WHERE name = 'UNCA / Zona Universitaria' AND city_id = v_city_id LIMIT 1;
  SELECT id INTO v_zone_ferial FROM public.zones WHERE name = 'Predio Ferial' AND city_id = v_city_id LIMIT 1;
  SELECT id INTO v_zone_valle FROM public.zones WHERE name = 'Valle Viejo' AND city_id = v_city_id LIMIT 1;

  -- ============================================================
  -- DEMO BUSINESSES (using a fake owner — will be reassigned)
  -- We need a profile first, create a demo one
  -- ============================================================

  -- Insert demo profile (admin/owner for demo businesses)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, raw_user_meta_data)
  VALUES (
    'de000000-0000-0000-0000-000000000001',
    'demo@pinto.app',
    crypt('demo123456', gen_salt('bf')),
    now(),
    'authenticated',
    '{"full_name": "Demo Pintó", "role": "admin"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Profile auto-created by trigger, but ensure it exists
  INSERT INTO public.profiles (id, role, full_name) VALUES
    ('de000000-0000-0000-0000-000000000001', 'admin', 'Demo Pintó')
  ON CONFLICT (id) DO NOTHING;

  -- BUSINESSES
  INSERT INTO public.businesses (id, owner_user_id, category_id, city_id, zone_id, name, slug, description, address, phone, instagram, status, is_verified) VALUES
    -- Cafeterías
    ('b1200000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000001', v_city_id, v_zone_centro,
     'Café Central', 'cafe-central',
     'El café más tradicional del centro. Especialidad en tortas caseras y café de especialidad. Ideal para trabajar o estudiar.',
     'Rivadavia 450, Centro', '3834-123456', '@cafecentral_cata',
     'active', true),

    ('b1200000-0000-0000-0000-000000000002', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000001', v_city_id, v_zone_unca,
     'La Esquina UNCA', 'la-esquina-unca',
     'Café y librería frente a la Universidad. Wi-Fi gratis, enchufes en todas las mesas. El punto de encuentro estudiantil.',
     'Av. Belgrano 1100, zona UNCA', '3834-234567', '@laesquinaunca',
     'active', true),

    -- Bares
    ('b1200000-0000-0000-0000-000000000003', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000002', v_city_id, v_zone_centro,
     'Birra & Rock', 'birra-rock',
     'Bar de cerveza artesanal con música en vivo los jueves y viernes. 12 canillas rotativas.',
     'San Martín 820, Centro', '3834-345678', '@birrarock_cata',
     'active', true),

    ('b1200000-0000-0000-0000-000000000004', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000002', v_city_id, v_zone_solar,
     'Alto Bar', 'alto-bar',
     'Rooftop bar con vista panorámica. Cocktails de autor y tapas. El mejor atardecer de Catamarca.',
     'Los Aromos 150, Alto del Solar', '3834-456789', '@altobar.cata',
     'active', false),

    -- Restaurantes
    ('b1200000-0000-0000-0000-000000000005', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000004', v_city_id, v_zone_centro,
     'La Parrilla del Centro', 'la-parrilla-del-centro',
     'Parrilla tradicional argentina. Cortes premium, empanadas catamarqueñas y vinos regionales.',
     'Sarmiento 380, Centro', '3834-567890', '@laparrillacata',
     'active', true),

    ('b1200000-0000-0000-0000-000000000006', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000004', v_city_id, v_zone_valle,
     'Sushi Valle', 'sushi-valle',
     'Sushi fusión con toques catamarqueños. Delivery y take away. Rolls especiales de la casa.',
     'Ruta 4, km 3 Valle Viejo', '3834-678901', '@sushivalle',
     'active', false),

    -- Gimnasio
    ('b1200000-0000-0000-0000-000000000007', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000005', v_city_id, v_zone_centro,
     'Fit Zone', 'fit-zone',
     'Gimnasio funcional y crossfit. Clases grupales todo el día. Primera clase gratis.',
     'Chacabuco 200, Centro', '3834-789012', '@fitzone.cata',
     'active', true),

    -- Cancha
    ('b1200000-0000-0000-0000-000000000008', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000006', v_city_id, v_zone_ferial,
     'Paddle Cata', 'paddle-cata',
     '4 canchas de pádel con iluminación LED. Alquiler de paletas. Torneos mensuales.',
     'Predio Ferial Norte', '3834-890123', '@paddlecata',
     'active', true),

    -- Heladería
    ('b1200000-0000-0000-0000-000000000009', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000003', v_city_id, v_zone_centro,
     'Dulce Catamarca', 'dulce-catamarca',
     'Helados artesanales con frutos regionales. Sabores de nuez, membrillo y dulce de leche casero.',
     'República 510, Centro', '3834-901234', '@dulcecatamarca',
     'active', true),

    -- Bicicletería
    ('b1200000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000007', v_city_id, v_zone_jumeal,
     'Pedal Libre', 'pedal-libre',
     'Bicicletería + comunidad ciclista. Salidas grupales los domingos. Taller y accesorios.',
     'Av. Güemes 1500, El Jumeal', '3834-012345', '@pedallibre.cata',
     'active', true),

    -- Cultural
    ('b1200000-0000-0000-0000-000000000011', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000008', v_city_id, v_zone_centro,
     'Espacio Catamarca', 'espacio-catamarca',
     'Centro cultural independiente. Exposiciones, talleres y ciclo de cine. Entrada libre.',
     'Maipú 750, Centro', '3834-112233', '@espaciocatamarca',
     'active', true),

    -- Experiencia
    ('b1200000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000001',
     'bbc10000-0000-0000-0000-000000000009', v_city_id, v_zone_jumeal,
     'Aventura Catamarca', 'aventura-catamarca',
     'Experiencias outdoor: trekking, rappel, kayak. Guías certificados. Para todos los niveles.',
     'Camino al Jumeal s/n', '3834-223344', '@aventuracata',
     'active', true);

  -- ============================================================
  -- CAMPAIGNS (20 campaignsseed)
  -- ============================================================

  INSERT INTO public.campaigns (id, business_id, type, title, short_description, full_description, starts_at, ends_at, status, max_capacity, min_group_size, price_text, is_free, is_featured, requires_reservation) VALUES
    -- Café Central
    ('ca000000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001',
     'promo', 'Merienda 2x1', '2 cafés con torta al precio de 1. Todos los martes y jueves.',
     'Traé a un amigo y paguen uno. Válido para café con leche, cortado o americano + porción de torta del día. No acumulable con otras promos.',
     now(), now() + interval '30 days', 'active', NULL, NULL, '$3.500 por persona', false, true, false),

    ('ca000000-0000-0000-0000-000000000002', 'b1200000-0000-0000-0000-000000000001',
     'group_promo', 'Mesa Grupal Estudio', 'Vení a estudiar en grupo: 20% off en consumiciones para grupos de 4+',
     'Ideal para época de parciales. Reservá mesa para tu grupo, Wi-Fi premium incluido. Mínimo 4 personas. Aplica de lunes a viernes.',
     now(), now() + interval '45 days', 'active', 20, 4, '20% off', false, false, true),

    -- La Esquina UNCA
    ('ca000000-0000-0000-0000-000000000003', 'b1200000-0000-0000-0000-000000000002',
     'time_slot', 'Happy Hour Universitario', 'Café + medialunas $2.000 de 17 a 19hs',
     'Exclusivo para la franja de 17 a 19hs. Café con leche grande + 3 medialunas de manteca. Mostrá tu libreta universitaria para acceder.',
     now(), now() + interval '60 days', 'active', NULL, NULL, '$2.000', false, true, false),

    ('ca000000-0000-0000-0000-000000000004', 'b1200000-0000-0000-0000-000000000002',
     'event', 'Noche de Trivia', 'Trivia nocturna con premios. Todos los miércoles 21hs.',
     'Armá tu equipo de 3-5 personas. Categorías: cultura general, música, series, historia argentina. El equipo ganador se lleva consumiciones gratis para la próxima semana.',
     now() + interval '2 days', now() + interval '90 days', 'active', 40, 3, 'Gratis + consumición mínima', false, true, true),

    -- Birra & Rock
    ('ca000000-0000-0000-0000-000000000005', 'b1200000-0000-0000-0000-000000000003',
     'promo', 'After Office Birrero', '3 pintas artesanales por $5.000 de lunes a jueves 18-21hs',
     'Elegí entre nuestras 12 canillas rotativas. IPA, Stout, Red Ale, Blonde y más. Solo válido 18 a 21hs de lunes a jueves.',
     now(), now() + interval '30 days', 'active', NULL, NULL, '$5.000 x 3 pintas', false, true, false),

    ('ca000000-0000-0000-0000-000000000006', 'b1200000-0000-0000-0000-000000000003',
     'event', 'Música en Vivo: Rock Nacional', 'Banda en vivo este viernes. Entrada libre.',
     'Este viernes toca "Los Pircas". Rock nacional de primera. Arrancamos a las 22hs. Entrada libre con consumición mínima.',
     now() + interval '3 days', now() + interval '3 days' + interval '6 hours', 'active', 80, NULL, 'Gratis + consumición', true, false, false),

    -- Alto Bar
    ('ca000000-0000-0000-0000-000000000007', 'b1200000-0000-0000-0000-000000000004',
     'event', 'Sunset Session', 'Atardecer con DJ + cocktails 2x1',
     'Todos los sábados de 18 a 21hs. DJ Set de música electrónica suave, cocktails 2x1 y picadas para compartir. El mejor sunset view de la ciudad.',
     now() + interval '4 days', now() + interval '60 days', 'active', 50, NULL, 'Cocktails 2x1', false, true, true),

    -- La Parrilla del Centro
    ('ca000000-0000-0000-0000-000000000008', 'b1200000-0000-0000-0000-000000000005',
     'group_promo', 'Asado para 4', 'Parrillada completa para 4 personas + postre + bebida. $25.000 total',
     'Incluye: vacío, chorizo, morcilla, ensalada mixta, papas, postre del día y jarra de limonada. Válido almuerzo y cena. Reserva obligatoria.',
     now(), now() + interval '30 days', 'active', 30, 4, '$25.000 x 4 personas', false, false, true),

    ('ca000000-0000-0000-0000-000000000009', 'b1200000-0000-0000-0000-000000000005',
     'time_slot', 'Almuerzo Express', 'Menú ejecutivo 12-14hs. Entrada + principal + bebida $4.500',
     'De lunes a viernes. Plato del día que rota semanalmente. Incluye entrada (empanadas o ensalada), principal, bebida y café.',
     now(), now() + interval '60 days', 'active', NULL, NULL, '$4.500', false, false, false),

    -- Sushi Valle
    ('ca000000-0000-0000-0000-000000000010', 'b1200000-0000-0000-0000-000000000006',
     'promo', 'Rolls 30% OFF', '30% en todos los rolls los martes',
     'Aplicable a toda la carta de rolls. No acumulable. Válido take away y en el local. Los martes todo el día.',
     now(), now() + interval '45 days', 'active', NULL, NULL, '30% OFF', false, false, false),

    -- Fit Zone
    ('ca000000-0000-0000-0000-000000000011', 'b1200000-0000-0000-0000-000000000007',
     'promo', 'Primera Clase Gratis', 'Probá cualquier clase sin cargo. Sin compromiso.',
     'Vení a probar funcional, crossfit, yoga o boxeo. Tu primera clase es completamente gratis. Solo reservá tu lugar.',
     now(), now() + interval '90 days', 'active', 15, NULL, 'Gratis', true, true, true),

    ('ca000000-0000-0000-0000-000000000012', 'b1200000-0000-0000-0000-000000000007',
     'group_promo', 'Entrená con Amigos', 'Sumá 2 amigos y los 3 pagan 50% el primer mes',
     'Inscribite con 2 amigos y los tres pagan la mitad durante el primer mes. Válido para cualquier plan. Consultar horarios.',
     now(), now() + interval '30 days', 'active', NULL, 3, '50% primer mes', false, false, true),

    -- Paddle Cata
    ('ca000000-0000-0000-0000-000000000013', 'b1200000-0000-0000-0000-000000000008',
     'time_slot', 'Cancha Off-Peak', 'Cancha libre de 10 a 16hs a mitad de precio',
     'Aprovechá las horas con menos demanda. Cancha de pádel por $3.000 la hora (precio normal $6.000). Incluye iluminación.',
     now(), now() + interval '60 days', 'active', 4, NULL, '$3.000/hora', false, false, true),

    ('ca000000-0000-0000-0000-000000000014', 'b1200000-0000-0000-0000-000000000008',
     'event', 'Torneo Relámpago', 'Torneo de pádel amateur. Anotate solo o en dupla.',
     'Sábado a las 9hs. Formato eliminación directa. Premios: trofeo + horas de cancha gratis para los finalistas. Inscripción $2.000 por persona.',
     now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 'active', 32, 2, '$2.000 inscripción', false, false, true),

    -- Dulce Catamarca
    ('ca000000-0000-0000-0000-000000000015', 'b1200000-0000-0000-0000-000000000009',
     'promo', '3er Gusto Gratis', 'Llevás 1kg y el 3er gusto va por nuestra cuenta',
     'Elegí 3 gustos de helado artesanal, pagás solo 2. Válido todos los días de 14 a 18hs. No acumulable.',
     now(), now() + interval '30 days', 'active', NULL, NULL, '1kg + gusto gratis', false, false, false),

    -- Pedal Libre
    ('ca000000-0000-0000-0000-000000000016', 'b1200000-0000-0000-0000-000000000010',
     'event', 'Salida Grupal: Ruta del Dique', 'Bicicleteada grupal al Dique El Jumeal. Domingos 8am.',
     'Recorrido de 15km, nivel principiante. Salimos desde el local. Traé tu bici, casco obligatorio. Tenemos bicis de alquiler por $1.500.',
     now() + interval '6 days', now() + interval '90 days', 'active', 25, NULL, 'Gratis', true, true, true),

    ('ca000000-0000-0000-0000-000000000017', 'b1200000-0000-0000-0000-000000000010',
     'promo', 'Service Básico Promo', 'Service de bici completo por $4.000 (regular $7.000)',
     'Incluye: frenos, cambios, limpieza de cadena, inflado y chequeo general. Dejala a la mañana, retirala a la tarde.',
     now(), now() + interval '30 days', 'active', NULL, NULL, '$4.000', false, false, false),

    -- Espacio Catamarca
    ('ca000000-0000-0000-0000-000000000018', 'b1200000-0000-0000-0000-000000000011',
     'event', 'Ciclo de Cine Argentino', 'Proyección + debate. Jueves 20hs. Entrada libre.',
     'Este jueves: "Relatos Salvajes". Proyección en pantalla grande + debate posterior con invitado especial. Pochoclos y café a la gorra.',
     now() + interval '1 day', now() + interval '60 days', 'active', 60, NULL, 'Gratis', true, false, false),

    ('ca000000-0000-0000-0000-000000000019', 'b1200000-0000-0000-0000-000000000011',
     'event', 'Taller de Foto Celular', 'Aprendé a sacar fotos pro con tu celular. Sábados 10hs.',
     '3 clases de 2 horas. Composición, iluminación natural, edición con apps gratuitas. Cupos limitados, inscripción previa.',
     now() + interval '7 days', now() + interval '21 days', 'active', 15, NULL, '$5.000 x 3 clases', false, false, true),

    -- Aventura Catamarca
    ('ca000000-0000-0000-0000-000000000020', 'b1200000-0000-0000-0000-000000000012',
     'event', 'Trekking Nocturno', 'Caminata nocturna guiada + fogón + mate. Viernes 20hs.',
     'Recorrido de 5km bajo las estrellas. Incluye guía, seguro, mate y tortas fritas al final. Nivel: fácil. Cupos: 20 personas max.',
     now() + interval '4 days', now() + interval '4 days' + interval '5 hours', 'active', 20, NULL, '$3.500', false, true, true);

END $$;
