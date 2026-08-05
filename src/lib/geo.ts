/**
 * Distância entre coordenadas, para a trava de local dos desafios.
 *
 * Importante: o app NUNCA guarda a coordenada do aluno. Ela é usada no
 * momento do check-in para decidir se a foto vale no local do desafio, e
 * o que fica salvo é só o veredito. O ranking é calculado no navegador
 * de quem abre a tela, então guardar coordenada significaria entregar a
 * localização precisa de todos os alunos para qualquer um que abrisse o
 * ranking. Ver supabase/migracoes/008-local-do-desafio.sql.
 */

export interface Coordenada {
  lat: number
  lng: number
}

/** Haversine. Metros. Boa o bastante nas distâncias de uma quadra. */
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const R = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** "120 m" / "1,4 km" — para dizer o quão longe a pessoa está. */
export function distanciaLegivel(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`
}

export interface PosicaoObtida extends Coordenada {
  /** Raio de incerteza do GPS, em metros (vem do navegador). */
  precisao: number
}

/**
 * Pede a localização ao navegador. `enableHighAccuracy` liga o GPS de
 * verdade — sem isso o celular responde pela torre de celular, com erro
 * de centenas de metros, que reprovaria gente que está no salão.
 */
export function obterPosicao(timeoutMs = 15_000): Promise<PosicaoObtida> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este aparelho não informa localização'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisao: p.coords.accuracy,
        }),
      (err) => {
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Você bloqueou o acesso à localização'
              : err.code === err.TIMEOUT
                ? 'O GPS demorou demais para responder'
                : 'Não foi possível obter sua localização',
          ),
        )
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}
