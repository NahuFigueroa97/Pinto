export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gradient mb-1">Pintó</h1>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Política de Privacidad</h2>
        <p className="text-gray-400 text-sm mb-6">Última actualización: 11 de septiembre de 2026</p>

        <p className="text-gray-600 text-sm mb-6">
          Pintó (&quot;nosotros&quot;, &quot;la app&quot;) es una aplicación de activación social local desarrollada en San Fernando del Valle de Catamarca, Argentina. Esta política describe cómo recopilamos, usamos y protegemos tu información personal.
        </p>

        <Section title="1. Información que recopilamos">
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li><b>Datos de cuenta:</b> nombre, email, año de nacimiento (opcional), género (opcional), foto de perfil (opcional).</li>
            <li><b>Datos de ubicación:</b> coordenadas GPS cuando usás la función &quot;Cerca mío&quot;, solo con tu permiso.</li>
            <li><b>Contenido generado:</b> planes sociales, mensajes de chat grupal, fotos, reseñas y valoraciones.</li>
            <li><b>Datos de uso:</b> interacciones con la app, planes a los que te unís, favoritos.</li>
            <li><b>Identificador de notificaciones:</b> el token de Firebase Cloud Messaging de tu dispositivo, si aceptás recibir avisos. Es un identificador del dispositivo, no tuyo, y se borra al cerrar sesión o al eliminar tu cuenta.</li>
          </ul>
        </Section>

        <Section title="2. Cómo usamos tu información">
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Para crear y gestionar tu cuenta.</li>
            <li>Para mostrarte planes, promos y negocios cercanos.</li>
            <li>Para facilitar la comunicación entre miembros de un plan.</li>
            <li>Para calcular tu reputación basada en reseñas.</li>
            <li>Para mejorar la experiencia de la app.</li>
            <li>Para enviarte avisos sobre tus planes, reservas y mensajes.</li>
          </ul>
        </Section>

        <Section title="3. Compartición de datos">
          <p className="text-sm text-gray-600 mb-2">No vendemos ni compartimos tu información personal con terceros con fines publicitarios. Tu información solo es visible para:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Otros usuarios de Pintó (nombre, foto, zona, según tu configuración).</li>
            <li>Miembros de un plan del que participás (mensajes, fotos).</li>
            <li>Negocios donde realizás reservas (nombre y email).</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            Usamos dos proveedores de infraestructura que procesan datos por cuenta nuestra:
            <b> Supabase</b> (base de datos y archivos, sobre AWS) y <b>Google Firebase Cloud Messaging</b>
            (entrega de notificaciones push). Al abrir el mapa de &quot;Cerca mío&quot; se piden
            los mosaicos a <b>OpenStreetMap</b>, que recibe tu dirección IP.
          </p>
        </Section>

        <Section title="4. Almacenamiento y seguridad">
          <p className="text-sm text-gray-600">
            Tus datos se almacenan en servidores de Supabase (AWS) con encriptación en tránsito (TLS) y en reposo. Las contraseñas se hashean y nunca se almacenan en texto plano.
          </p>
        </Section>

        <Section title="5. Retención de datos">
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Mensajes de chat: se eliminan después de 90 días.</li>
            <li>Feed de actividad: se elimina después de 60 días.</li>
            <li>Notificaciones: se eliminan después de 30 días.</li>
            <li>Consultas a negocios: se eliminan a las 24 h de leídas, o a los 7 días si no se leyeron.</li>
            <li>Token de notificaciones: se borra al cerrar sesión.</li>
            <li>Datos de cuenta: se conservan hasta que elimines tu cuenta.</li>
          </ul>
        </Section>

        <Section title="6. Tus derechos">
          <p className="text-sm text-gray-600 mb-2">Según la Ley 25.326 de Protección de Datos Personales de Argentina:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li><b>Acceder</b> a tus datos personales.</li>
            <li><b>Rectificar</b> datos incorrectos desde tu perfil.</li>
            <li><b>Eliminar</b> tu cuenta y datos desde Perfil → Eliminar cuenta. El borrado es inmediato y definitivo: se eliminan tu usuario, tu perfil, tus mensajes, fotos, reseñas, reservas y, si tenías, tu negocio y sus campañas.</li>
            <li><b>Bloquear</b> a otra persona desde su perfil, y denunciar contenido que incumpla las normas.</li>
            <li><b>Oponerte</b> al procesamiento contactándonos.</li>
          </ul>
        </Section>

        <Section title="7. Menores de edad">
          <p className="text-sm text-gray-600">
            Pintó no está dirigida a menores de 13 años. No recopilamos conscientemente información de menores. Si descubrimos que un menor ha proporcionado datos, los eliminaremos.
          </p>
        </Section>

        <Section title="8. Ubicación">
          <p className="text-sm text-gray-600 mb-2">
            La app pide acceso a tu ubicación para dos cosas: mostrarte qué hay cerca tuyo en &quot;Cerca mío&quot;, y ubicar en el mapa los planes que creás. Podés revocar el permiso desde la configuración del dispositivo y seguir usando el resto de la app.
          </p>
          <p className="text-sm text-gray-600">
            Tu ubicación no se guarda en tu perfil. Cuando creás un plan, sus coordenadas se guardan <b>redondeadas a ~100 metros</b>, para que otras personas puedan ver a qué distancia les queda sin exponer un domicilio exacto.
          </p>
        </Section>

        <Section title="9. Notificaciones">
          <p className="text-sm text-gray-600">
            Si aceptás recibir notificaciones, guardamos el token que Firebase le asigna a tu dispositivo para poder avisarte de mensajes nuevos, reservas y novedades de tus planes. Podés desactivarlas desde la configuración de tu teléfono; el token se borra cuando cerrás sesión o eliminás tu cuenta.
          </p>
        </Section>

        <Section title="10. Cambios a esta política">
          <p className="text-sm text-gray-600">
            Podemos actualizar esta política periódicamente. Te notificaremos de cambios significativos a través de la app.
          </p>
        </Section>

        <Section title="11. Contacto">
          <p className="text-sm text-gray-600">Para consultas sobre privacidad:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Email: <b>soporte@pinto.app</b></li>
            <li>Ubicación: San Fernando del Valle de Catamarca, Argentina</li>
          </ul>
        </Section>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-400">
          <p>Pintó — Hecho con ❤️ en Catamarca</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="font-semibold text-gray-900 text-sm mb-2">{title}</h3>
      {children}
    </div>
  );
}
