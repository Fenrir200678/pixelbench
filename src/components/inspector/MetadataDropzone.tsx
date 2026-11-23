import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../ui/Icon.js'
import { Button } from '../../ui/Button.js'

const acceptedImages = 'image/png,image/jpeg,image/webp'

// PNG Info drop field as in Forge: an image dropped here is only read and shown as a thumbnail.
// The canvas keeps the open image until the image is sent to it.
export function MetadataDropzone({
  thumbnail,
  fileName,
  onFile,
  onClear
}: {
  thumbnail?: string
  fileName?: string
  onFile: (file: File) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={'metadata-drop' + (dragging ? ' dragging' : '') + (thumbnail ? ' filled' : '')}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        // The canvas behind the inspector must not open the file as well.
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
          setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <button type="button" className="metadata-drop-target" onClick={() => input.current?.click()}>
        {thumbnail ? (
          <img src={thumbnail} alt={fileName ?? ''} />
        ) : (
          <>
            <Icon name="image" />
            <span>{t('Bild hierher ziehen oder klicken, um seine Generierungsdaten zu lesen')}</span>
          </>
        )}
      </button>
      {thumbnail && (
        <Button
          className="icon metadata-drop-clear"
          icon="close"
          aria-label={t('Bild entfernen')}
          title={t('Bild entfernen')}
          onClick={onClear}
        />
      )}
      <input
        ref={input}
        type="file"
        accept={acceptedImages}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </div>
  )
}
