import { useState } from 'react'
import { useInstalacao } from '../lib/instalacao'

/** Ícone de Compartilhar do iOS — quadrado com seta para cima. */
function IconeCompartilhar({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

/** Botão "···" (Mais) da barra do Safari. */
function IconeMais({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden>
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}

/** Ícone de "+" dentro de um quadrado, como no menu do Safari. */
function IconeAdicionar({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function Passo({
  numero,
  icone,
  children,
}: {
  numero: number
  icone?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brasa-600 text-sm font-extrabold text-white">
        {numero}
      </span>
      <span className="flex-1 text-sm">{children}</span>
      {icone && (
        <span className="shrink-0 rounded-lg bg-preto/5 p-1.5 text-azul-600">
          {icone}
        </span>
      )}
    </li>
  )
}

/**
 * Passo a passo do iPhone. Existe porque a Apple não expõe API de
 * instalação: só a pessoa consegue abrir a bandeja de Compartilhar.
 * Então o melhor que dá para fazer é mostrar exatamente onde tocar.
 */
function GuiaIOS({
  foraDoSafari,
  onFechar,
}: {
  foraDoSafari: boolean
  onFechar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onFechar}
      role="dialog"
      aria-label="Como instalar no iPhone"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-papel p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <h2 className="text-lg font-extrabold">Instalar no iPhone 📲</h2>

        {foraDoSafari ? (
          <>
            <p className="mt-2 text-sm text-tinta-600">
              Este navegador não consegue adicionar o app à tela inicial —
              só o <strong>Safari</strong> faz isso no iPhone.
            </p>
            <ol className="mt-4 space-y-3">
              <Passo numero={1} icone={<IconeMais />}>
                Toque nos <strong>···</strong> deste navegador
              </Passo>
              <Passo numero={2}>
                Escolha <strong>Abrir no Safari</strong>
              </Passo>
              <Passo numero={3}>
                Lá no Safari, toque em <strong>Instalar</strong> de novo
              </Passo>
            </ol>
            <p className="mt-4 rounded-xl bg-azul-500/10 px-3 py-2 text-xs text-azul-700">
              Chegou aqui pelo link do Instagram? É por isso — o navegador
              do Instagram não tem essa opção.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-tinta-600">
              O iPhone não deixa o app fazer isso sozinho, mas é
              rapidinho:
            </p>
            <ol className="mt-4 space-y-3">
              <Passo numero={1} icone={<IconeMais />}>
                Toque nos <strong>···</strong> na barra de baixo do Safari
              </Passo>
              <Passo numero={2} icone={<IconeCompartilhar />}>
                Toque em <strong>Compartilhar</strong>
              </Passo>
              <Passo numero={3} icone={<IconeAdicionar />}>
                Role a lista e toque em{' '}
                <strong>Adicionar à Tela de Início</strong>
              </Passo>
              <Passo numero={4}>
                Confirme em <strong>Adicionar</strong>, no canto de cima
              </Passo>
            </ol>
            <p className="mt-3 text-xs text-tinta-500">
              Em alguns iPhones o ícone de Compartilhar aparece direto na
              barra, sem os <strong>···</strong> — nesse caso, pule o
              passo 1.
            </p>
            <p className="mt-4 rounded-xl bg-verde-500/15 px-3 py-2 text-xs text-verde-800">
              Pronto! O Forró de Segunda vira um ícone na sua tela, junto
              com os outros apps.
            </p>
          </>
        )}

        <button className="btn-primary mt-5 w-full" onClick={onFechar}>
          Entendi
        </button>
      </div>
    </div>
  )
}

/**
 * Botão de instalar. No Android abre o diálogo nativo num toque; no
 * iPhone abre o passo a passo, que é o máximo que a plataforma permite.
 * Some sozinho quando o app já está instalado.
 */
export function BotaoInstalar({
  className = 'btn-primary w-full',
  rotulo = '📲 Instalar na tela inicial',
}: {
  className?: string
  rotulo?: string
}) {
  const { jaInstalado, temPromptNativo, ios, iosForaDoSafari, instalar } =
    useInstalacao()
  const [guiaAberto, setGuiaAberto] = useState(false)

  if (jaInstalado) return null
  // Fora do iOS, sem prompt nativo não há o que oferecer: o navegador
  // ainda não considera o app instalável (ou já foi instalado noutro
  // perfil). Melhor não mostrar um botão que não faz nada.
  if (!ios && !temPromptNativo) return null

  const aoClicar = async () => {
    if (temPromptNativo) {
      await instalar()
      return
    }
    setGuiaAberto(true)
  }

  return (
    <>
      <button className={className} onClick={() => void aoClicar()}>
        {rotulo}
      </button>
      {guiaAberto && (
        <GuiaIOS
          foraDoSafari={iosForaDoSafari}
          onFechar={() => setGuiaAberto(false)}
        />
      )}
    </>
  )
}

/**
 * Versão em cartão, para o perfil: é o lugar fixo onde a pessoa
 * encontra a instalação depois de ter dispensado o convite do feed.
 * Some por completo quando o app já está instalado — quem abriu pelo
 * ícone não precisa de aviso sobre isso.
 */
export function CartaoInstalar() {
  const { jaInstalado, temPromptNativo, ios } = useInstalacao()

  if (jaInstalado) return null
  if (!ios && !temPromptNativo) return null

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1">
          <p className="text-sm font-bold">Instalar na tela inicial</p>
          <p className="text-xs text-tinta-500">
            Abre direto, sem passar pelo navegador
          </p>
        </div>
      </div>
      <BotaoInstalar />
    </div>
  )
}
