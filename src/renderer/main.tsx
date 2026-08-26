import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// El orden importa: `base.css` define los tokens que los demás consumen.
import './estilos/base.css'
import './estilos/lateral.css'
import './estilos/arbol.css'
import './estilos/sprint.css'
import './estilos/edicion.css'
import './estilos/cierre.css'
import './estilos/pantallas.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el nodo #raiz en index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
