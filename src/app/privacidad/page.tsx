export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gradient mb-1">Pintó</h1>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Política de Privacidad</h2>
        <p className="text-gray-400 text-sm mb-6">Última actualización: 4 de mayo de 2026</p>

        <p className="text-gray-600 text-sm mb-6">
          Pintó (&quot;nosotros&quot;, &quot;la app&quot;) es una aplicación de activación social local desarrollada en San Fernando del Valle de Catamarca, Argentina. Esta política describe cómo recopilamos, usamos y protegemos tu información personal.
        </p>

        <Section title="1. Información que recopilamos">
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li><b>Datos de cuenta:</b> nombre, email, año de nacimiento (opcional), género (opcional), foto de perfil (opcional).</li>
            <li><b>Datos de ubicación:</b> coordenadas GPS cuando usás la función &quot;Cerca mío&quot;, solo con tu permiso.</li>
            <li><b>Contenido generado:</b> planes sociales, mensajes de chat grupal, fotos, reseñas y valoraciones.</li>
            <li><b>Datos de uso:</b> interacciones con la app, planes a los que te unís, favoritos.</li>
          </ul>
        </Section>

        <Section title="2. Cómo usamos tu información">
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Para crear y gestionar tu cuenta.</li>
            <li>Para mostrarte planes, promos y negocios cercanos.</li>
            <li>Para facilitar la comunicación entre miembros de un plan.</li>
            <li>Para calcular tu reputación basada en reseñas.</li>
            <li>Para mejorar la experiencia de la app.</li>
          </ul>
        </Section>

        <Section title="3. Compartición de datos">
          <p className="text-sm text-gray-600 mb-2">No vendemos ni compartimos tu información personal con terceros con fines publicitarios. Tu información solo es visible para:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Otros usuarios de Pintó (nombre, foto, zona, según tu configuración).</li>
            <li>Miembros de un plan del que participás (mensajes, fotos).</li>
            <li>Negocios donde realizás reservas (nombre y email).</li>
          </ul>
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
            <li>Notificaciones leídas: se eliminan después de 30 días.</li>
            <li>Datos de cuenta: se conservan hasta que elimines tu cuenta.</li>
          </ul>
        </Section>

        <Section title="6. Tus derechos">
          <p className="text-sm text-gray-600 mb-2">Según la Ley 25.326 de Protección de Datos Personales de Argentina:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li><b>Acceder</b> a tus datos personales.</li>
            <li><b>Rectificar</b> datos incorrectos desde tu perfil.</li>
            <li><b>Eliminar</b> tu cuenta y datos desde Perfil → Eliminar cuenta.</li>
            <li><b>Oponerte</b> al procesamiento contactándonos.</li>
          </ul>
        </Section>

        <Section title="7. Menores de edad">
          <p className="text-sm text-gray-600">
            Pintó no está dirigida a menores de 13 años. No recopilamos conscientemente información de menores. Si descubrimos que un menor ha proporcionado datos, los eliminaremos.
          </p>
        </Section>

        <Section title="8. Ubicación">
          <p className="text-sm text-gray-600">
            La app solicita acceso a tu ubicación únicamente para &quot;Cerca mío&quot;. Podés revocar este permiso desde la configuración de tu dispositivo. La ubicación no se almacena permanentemente.
          </p>
        </Section>

        <Section title="9. Cambios a esta política">
          <p className="text-sm text-gray-600">
            Podemos actualizar esta política periódicamente. Te notificaremos de cambios significativos a través de la app.
          </p>
        </Section>

        <Section title="10. Contacto">
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
