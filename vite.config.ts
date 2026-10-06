import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

function demoFiles(): Plugin {
	return {
		name: 'bassin-demo-files',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = req.url?.split('?')[0]
				if (path === '/pool/location.json') {
					res.setHeader('Content-Type', 'application/json')
					res.end('null')
					return
				}
				const files: Record<string, string> = {
					'/pool/pool.status': 'pool/pool.status',
					'/users/users.status': 'users/users.status',
					'/users/': 'users/users.status',
					'/users/1BitcoinEaterAddressDontSendf59kuE': 'users/1BitcoinEaterAddressDontSendf59kuE',
					'/ckpool.log': 'ckpool.log',
				}
				if (!path || !files[path]) return next()
				let text = readFileSync(new URL(`./src/demodata/${files[path]}`, import.meta.url), 'utf8')
				const now = Math.floor(Date.now() / 1000)
				if (path === '/pool/pool.status') {
					const records = text
						.trim()
						.split('\n')
						.map((line) => JSON.parse(line))
					records[0].lastupdate = now
					text = records.map((record) => JSON.stringify(record)).join('\n')
				} else if (path === '/users/1BitcoinEaterAddressDontSendf59kuE') {
					const user = JSON.parse(text)
					user.lastshare = now - 12
					user.worker.forEach((worker: {lastshare: number}) => {
						worker.lastshare = now - 12
					})
					text = JSON.stringify(user)
				}
				res.setHeader('Content-Type', path.includes('users.status') || path === '/users/' ? 'text/html' : 'text/plain')
				res.setHeader('Cache-Control', 'no-store')
				res.end(text)
			})
		},
	}
}
export default defineConfig({
	plugins: [svgr(), react(), tailwindcss(), demoFiles()],
	resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
	build: {outDir: 'web', emptyOutDir: true, chunkSizeWarningLimit: 1800},
	server: {host: '127.0.0.1', port: 4174, strictPort: true},
})
