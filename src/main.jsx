import { render } from 'preact'
import './index.css'
import { App } from './app.jsx'
import { initInstall } from './core/install.js'

initInstall()

render(<App />, document.getElementById('app'))
