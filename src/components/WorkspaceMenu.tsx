import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { SignOut, useIdentity } from './Access'
import { useWorkspace } from '../services/analytics'

export const settingsLinks = [
  ['account', 'My account', 'person'],
  ['restaurant', 'Restaurant settings', 'store'],
  ['notifications', 'Notification preferences', 'bell'],
] as const
export function WorkspaceMenu({ closeDrawer }: { closeDrawer: () => void }) {
  const { restaurant } = useWorkspace(), user = useIdentity(), location = useLocation()
  const [open, toggle] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => toggle(false), [location.key])
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('.accountPop a')?.focus()
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) toggle(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggle(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div
      className='accountRoot'
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) toggle(false)
      }}
    >
      <button
        ref={trigger}
        className='restaurant'
        aria-label='Account menu'
        aria-expanded={open}
        aria-controls='account-actions'
        onClick={() => toggle(!open)}
      >
        <span className='avatar'>{restaurant.name.slice(0, 2).toUpperCase()}</span>
        <span className='identityText'>
          <strong>{restaurant.name}</strong>
          <small>Restaurant workspace</small>
        </span>
        <Icon name='chevron' size={14} />
      </button>
      {open && (
        <div id='account-actions' className='accountPop'>
          <strong>{restaurant.name}</strong>
          <small>{user.email}</small>
          {settingsLinks.map(([id, label, icon]) => (
            <Link
              onClick={() => {
                toggle(false)
                closeDrawer()
              }}
              key={id}
              to={'/settings/' + id}
            >
              <Icon name={icon as IconName} size={16} />
              {label}
            </Link>
          ))}
          <div className='logoutRow'>
            <Icon name='logout' size={16} />
            <SignOut />
          </div>
        </div>
      )}
    </div>
  )
}
