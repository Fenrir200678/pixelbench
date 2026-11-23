import { Group, Separator, useDefaultLayout, type GroupProps } from 'react-resizable-panels'

const storage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Resizing still works when browser storage is unavailable.
    }
  }
}

export function ResizableLayout({ id, panelIds, ...props }: GroupProps & { id: string; panelIds: string[] }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, panelIds, storage })
  return <Group {...props} id={id} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} />
}

export function ResizeHandle({ label }: { label: string }) {
  return <Separator className="resize-handle" aria-label={label} title={label} />
}
