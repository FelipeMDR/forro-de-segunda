/** Gera e baixa um CSV (separador ; e BOM para abrir direto no Excel). */
export function downloadCSV(
  nomeArquivo: string,
  cabecalho: string[],
  linhas: string[][],
) {
  const esc = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const conteudo = [cabecalho, ...linhas]
    .map((l) => l.map(esc).join(';'))
    .join('\r\n')
  const bom = String.fromCharCode(0xfeff)
  const blob = new Blob([bom + conteudo], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeArquivo}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
