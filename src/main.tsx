import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorApp } from './EditorApp.js'
import './i18n/index.js'
import './style/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorApp />
  </StrictMode>
)
