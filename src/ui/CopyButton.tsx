import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button.js'

// The clipboard API needs a secure context and permission. The selection copy covers the other cases.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  }
}

// An icon-only button that copies text and shows a check mark for a moment.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Button
      className="icon quiet compact copy-button"
      icon={copied ? 'check' : 'copy'}
      title={copied ? t('Kopiert') : label}
      aria-label={label}
      onClick={() => void copyText(text).then(setCopied)}
    />
  )
}
