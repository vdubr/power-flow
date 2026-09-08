import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts – latin + latin-ext subsets only (covers Czech/Slovak, excludes Cyrillic/CJK/Vietnamese)
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-sans/latin-ext-700.css'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/fraunces/latin-700.css'
import '@fontsource/fraunces/latin-ext-600.css'
import '@fontsource/fraunces/latin-ext-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-ext-400.css'
import '@fontsource/ibm-plex-mono/latin-ext-500.css'

import './index.css'
import App from './App.tsx'
import { registerObservatoryTheme } from './theme/echartsTheme'

// Default to dark mode for the solar observatory aesthetic.
document.documentElement.setAttribute('data-theme', 'dark')
registerObservatoryTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
