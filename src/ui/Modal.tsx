import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button.js'

export function Modal({
  id,
  className,
  onClose,
  children
}: {
  id: string
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current!
    if (!element.open) element.showModal()
    return () => element.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      id={id}
      className={className}
      aria-labelledby={id + '-title'}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}

export function DialogHeading({
  dialog,
  closeId,
  title,
  onClose
}: {
  dialog: string
  closeId: string
  title: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <header className="dialog-head">
      <h2 id={dialog + '-title'}>{title}</h2>
      <Button id={closeId} className="icon" aria-label={t('Schließen')} icon="close" onClick={onClose} />
    </header>
  )
}
