export default function ChildSafetyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gradient mb-1">Pintó</h1>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Estándares de Seguridad Infantil</h2>
        <p className="text-gray-400 text-sm mb-6">Última actualización: 5 de mayo de 2026</p>

        <p className="text-gray-600 text-sm mb-6">
          Pintó se compromete a crear un entorno seguro para todos sus usuarios. Esta página describe nuestros estándares y políticas contra la explotación y el abuso sexual infantil (EASI).
        </p>

        <Section title="1. Política de tolerancia cero">
          <p className="text-sm text-gray-600">
            Pintó tiene una política de <b>tolerancia cero</b> frente a cualquier forma de explotación o abuso sexual infantil. Cualquier contenido, comportamiento o actividad que explote o ponga en riesgo a menores está estrictamente prohibido y será eliminado de inmediato.
          </p>
        </Section>

        <Section title="2. Restricción de edad">
          <p className="text-sm text-gray-600">
            Pintó no está dirigida a menores de 13 años. Los usuarios deben tener al menos 13 años para crear una cuenta. Nos reservamos el derecho de suspender o eliminar cuentas que se identifiquen como pertenecientes a menores de 13 años.
          </p>
        </Section>

        <Section title="3. Contenido prohibido">
          <p className="text-sm text-gray-600 mb-2">Está estrictamente prohibido publicar, compartir o solicitar:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Material de abuso sexual infantil (CSAM) en cualquier formato.</li>
            <li>Contenido que sexualice a menores de edad.</li>
            <li>Comunicaciones inapropiadas dirigidas a menores con intención de explotación (grooming).</li>
            <li>Cualquier contenido que promueva, glorifique o facilite el abuso de menores.</li>
          </ul>
        </Section>

        <Section title="4. Mecanismos de denuncia">
          <p className="text-sm text-gray-600 mb-2">Pintó permite a los usuarios denunciar contenido o comportamientos sospechosos a través de:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>El <b>botón de reporte</b> disponible en perfiles y contenidos dentro de la app.</li>
            <li>Contacto directo por email a <b>soporte@pinto.app</b>.</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            Todas las denuncias son revisadas con prioridad máxima y tratadas con confidencialidad.
          </p>
        </Section>

        <Section title="5. Acciones ante infracciones">
          <p className="text-sm text-gray-600 mb-2">Ante cualquier infracción a estos estándares, Pintó tomará las siguientes medidas:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li><b>Eliminación inmediata</b> del contenido infractor.</li>
            <li><b>Suspensión o eliminación permanente</b> de la cuenta del infractor.</li>
            <li><b>Denuncia a las autoridades competentes</b>, incluyendo el Centro Nacional para Menores Desaparecidos y Explotados (NCMEC) y las fuerzas de seguridad locales en Argentina.</li>
            <li><b>Preservación de evidencia</b> para facilitar las investigaciones de las autoridades.</li>
          </ul>
        </Section>

        <Section title="6. Colaboración con autoridades">
          <p className="text-sm text-gray-600">
            Pintó coopera plenamente con las fuerzas de seguridad y las autoridades nacionales e internacionales en la investigación de casos de explotación y abuso sexual infantil. Cumplimos con todas las leyes aplicables de Argentina y las regulaciones internacionales de protección infantil.
          </p>
        </Section>

        <Section title="7. Contacto">
          <p className="text-sm text-gray-600">Para denunciar contenido o comportamiento relacionado con la seguridad infantil:</p>
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
