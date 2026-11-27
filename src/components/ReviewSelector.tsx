import { useId, useRef, useState } from 'react'
import { normalizeName } from '../services/invoiceMatching'

type Option = { value: string; label: string; note?: string }
type Props = {
  label: string
  selected: string
  options: Option[]
  onSelect: (value: string) => void
  alternative?: Option
  allowNew?: boolean
  disabled?: boolean
}

export function ReviewSelector({ label, selected, options, onSelect, alternative, allowNew, disabled }: Props) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const results = options.filter((option) => normalizeName(option.label).includes(normalizeName(query)))
  const newName = query.trim()
  const canCreate = allowNew && newName &&
    !options.some((option) => option.value.trim().toLowerCase() === newName.toLowerCase())

  function pick(value: string) {
    onSelect(value)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div
      className='reviewSelector'
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
        if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>('.reviewOptions input, .reviewOptions button'),
          ]
          const active = controls.indexOf(document.activeElement as HTMLElement)
          if (active < 0) return
          event.preventDefault()
          const offset = event.key === 'ArrowDown' ? 1 : -1
          controls[Math.max(0, Math.min(controls.length - 1, active + offset))]?.focus()
        }
      }}
    >
      <span id={id + '-label'}>{label}</span>
      <button
        ref={trigger}
        type='button'
        className='reviewSelectTrigger'
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-labelledby={id + '-label ' + id + '-selection'}
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen(!open)
        }}
      >
        <span id={id + '-selection'}>{selected}</span>
        <span aria-hidden='true'>⌄</span>
      </button>
      {open && (
        <div className='reviewOptions' id={id} role='group' aria-labelledby={id + '-label'}>
          <input
            aria-label={'Search ' + label.toLowerCase()}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className='reviewOptionList'>
            {alternative && (
              <button type='button' onClick={() => pick(alternative.value)}>{alternative.label}</button>
            )}
            {results.map((option) => (
              <button key={option.value} type='button' onClick={() => pick(option.value)}>
                {option.label}
                {option.note && <small>{option.note}</small>}
              </button>
            ))}
            {!results.length && (
              <p>{options.length ? 'No matching results.' : 'No existing options in this restaurant.'}</p>
            )}
            {canCreate && (
              <button type='button' onClick={() => pick(newName)}>Use new supplier “{newName}”</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
