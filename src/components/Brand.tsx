export function Brand({ dark = false }: { dark?: boolean }) {
  return <div className="brand">
    <img width={720} height={158} src={dark ? '/invoiceeye-brand-dark.webp' : '/invoiceeye-brand-light.webp'} alt="InvoiceEye" />
  </div>
}
