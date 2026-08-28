import Link from 'next/link'
import TecaLayout from '@/components/TecaLayout'
import { HORARIO_TEXTO, DIRECCION } from '@/lib/horarios'

export const metadata = {
  title: 'Preguntas · Tlacuilo',
  description: 'Cómo funciona el préstamo en Tlacuilo, biblioteca pública en Coyoacán.',
}

/**
 * /preguntas
 * Las dudas formales, resueltas de una vez, para que nadie tenga que
 * escribirnos para saber lo básico. Enlazada desde el pie de todo el sitio.
 */
const PREGUNTAS = [
  {
    q: '¿cómo pido un libro?',
    a: `lo agregas a tu morral desde el catálogo, y cuando ya tengas los que quieres escoges el día y el horario en que vienes por ellos. tu morral es tu lista de deseos: puedes dejar ahí lo que quieras y llevarte solo algunos.`,
  },
  {
    q: '¿por qué mi reserva dice "en espera"?',
    a: `porque todavía no vamos por tus libros. algunos viven en bodega y alguien tiene que ir a buscarlos y dejarlos a la mano. en cuanto están listos te llega un correo con el día, la hora y la dirección. si tarda más de un par de días, escríbenos.`,
  },
  {
    q: '¿cuándo puedo venir?',
    a: `${HORARIO_TEXTO}. no abrimos sábados ni domingos. escoges tu bloque al hacer la reserva, y ese día te esperamos.`,
  },
  {
    q: '¿dónde están?',
    a: `en ${DIRECCION}. la dirección completa va en el correo de tu reserva confirmada.`,
  },
  {
    q: 'no voy a poder ir, ¿qué hago?',
    a: `avísanos, en serio. el correo de tu reserva trae un enlace de un clic para soltarla, y también puedes hacerlo desde mi tlacuilo. tus libros regresan a tu morral tal cual los escogiste y puedes agendar otro día. lo único que nos cuesta es esperar a alguien que no viene.`,
  },
  {
    q: '¿cuánto tiempo me los puedo quedar?',
    a: `30 días desde que te los llevas. el contador vive en mi tlacuilo, en la sección de mis préstamos, y ahí ves cuántos días te quedan.`,
  },
  {
    q: '¿puedo quedármelos más tiempo?',
    a: `sí, y no tienes que pedir permiso: desde mi tlacuilo extiendes tu préstamo con un botón. lo único que te pedimos es que lo hagas ahí, para que sepamos dónde están nuestros libros. si alguien más tiene ese título en su morral, la extensión es más corta, porque te lo está esperando.`,
  },
  {
    q: '¿cómo devuelvo?',
    a: `no necesitas cita. traes tus libros en el horario de siempre y ya. si se te pasó la fecha no hay multa ni regaño, solo tráelos.`,
  },
  {
    q: '¿hay multas?',
    a: `no. nunca. lo que sí hay es un recordatorio cuando se te pasa la fecha, porque estos libros son de todos y hay quien los está esperando.`,
  },
  {
    q: '¿cuántos libros me puedo llevar?',
    a: `depende de cuántos quepan en tu morral en ese momento; el límite lo ves al hacer tu reserva. mientras traigas libros nuestros, esos cuentan: para llevarte más, primero regresa los que tienes.`,
  },
  {
    q: '¿qué pasa si pierdo o maltrato un libro?',
    a: `escríbenos y lo vemos juntos. son libros de arte y algunos no se consiguen fácil, pero preferimos mil veces que nos digas a que desaparezca en silencio.`,
  },
  {
    q: 'tengo otra duda',
    a: `escríbenos a tlacuilo@tlacuilo.org. contestamos nosotras, no un robot.`,
  },
] as const

export default function PreguntasPage() {
  return (
    <TecaLayout>
      <section className="px-10 max-md:px-5 pt-10 pb-20 max-w-3xl mx-auto">
        <p className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-3">
          preguntas
        </p>
        <h1 className="font-sans font-light leading-none mb-4 text-[clamp(32px,3.8vw,52px)] tracking-[-0.01em] text-text">
          Cómo funciona
        </h1>
        <p className="font-mono text-[clamp(13px,1vw,15px)] text-text-dim mb-12 max-w-[52ch] leading-relaxed">
          Tlacuilo es una biblioteca pública en Coyoacán. Los libros se prestan, se leen y regresan. Esto es todo lo que hay que saber.
        </p>

        <div className="flex flex-col">
          {PREGUNTAS.map((p) => (
            <div key={p.q} className="border-t border-rule py-6">
              <h2 className="font-mono text-[clamp(14px,1.2vw,17px)] text-text-bright mb-2 lowercase">
                {p.q}
              </h2>
              <p className="font-mono text-[clamp(12px,1vw,14px)] text-text-dim leading-relaxed max-w-[62ch]">
                {p.a}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-rule pt-8 mt-2">
          <Link
            href="/biblioteca"
            className="font-mono text-[13px] lowercase tracking-wider underline hover:no-underline"
          >
            ir al acervo →
          </Link>
        </div>
      </section>
    </TecaLayout>
  )
}
