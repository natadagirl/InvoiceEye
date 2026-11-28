export type IngredientOption = { id: string; name: string; specification: string; base_unit: string }

export function normalizeName(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function nameTokens(value: string) {
  return normalizeName(value).split(' ').filter(Boolean).map((word) => {
    if (word.endsWith('toes')) return word.slice(0, -2)
    if (word.length > 4 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
    return word
  }).sort()
}

export function matchIngredient(name: string | null, baseUnit: string | null, catalog: IngredientOption[]) {
  const tokens = nameTokens(name ?? '')
  const key = tokens.join(' ')
  if (!key) return { automatic: undefined, suggested: [] }
  const compatible = catalog.filter((product) => product.base_unit === baseUnit)
  const equivalents = compatible.filter((product) => nameTokens(product.name).join(' ') === key)
  const exact = equivalents.filter((product) => normalizeName(product.name) === normalizeName(name ?? ''))
  // A standard name can have multiple specifications in the same catalog.
  const automatic = equivalents.length === 1 ? exact[0] ?? equivalents[0] : undefined
  const suggested = catalog.filter((product) => {
    if (product.id === automatic?.id || (baseUnit && product.base_unit !== baseUnit)) return false
    const productTokens = nameTokens(product.name)
    return productTokens.every((token) => tokens.includes(token))
  })
  return { automatic, suggested }
}

export function existingSupplier(input: string, suppliers: string[]) {
  const name = input.trim()
  const matches = suppliers.filter((option) => option.trim().toLowerCase() === name.toLowerCase())
  return matches.find((option) => option === name) ?? (matches.length === 1 ? matches[0] : undefined)
}

export function validIngredientName(name: string) {
  return [...name.trim()].length <= 100 && /\p{L}/u.test(name)
}

export function supportedBaseUnit(unit: string | null) {
  return unit === 'kg' || unit === 'L' || unit === 'each'
}

export function proposeIngredient(
  item: { name: string | null; packageUnit: string | null; packageSize: number | null; ingredientKind?: string },
  match: ReturnType<typeof matchIngredient>,
) {
  const name = item.name?.trim()
  if (
    item.ingredientKind !== 'food' || !name || !validIngredientName(name) ||
    !supportedBaseUnit(item.packageUnit) ||
    !item.packageSize || item.packageSize <= 0 || match.automatic || match.suggested.length
  ) return undefined
  if (
    /\b(fee|charge|shipping|delivery|deposit|surcharge|discount|rebate|freight|credit|handling|miscellaneous)\b/i
      .test(name)
  ) return undefined
  return name
}
