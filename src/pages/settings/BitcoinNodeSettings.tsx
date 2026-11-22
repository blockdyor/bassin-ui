import {useState} from 'react'
import {Checkbox} from '@/components/ui/checkbox'
import {zmqEndpointError, type Config} from '@/helpers/config'
import InputField from './InputField'
import Toggle from './Toggle'

type Props = {
	config: Config
	disabled: boolean
	live?: boolean
	passwordsSet?: boolean[]
	onChange: (key: string, value: unknown) => void
}

export default function BitcoinNodeSettings({config, disabled, live = false, passwordsSet, onChange}: Props) {
	const [showPassword, setShowPassword] = useState(false)
	const nodes = Array.isArray(config.btcd) ? config.btcd : []
	const node = nodes[0] && typeof nodes[0] === 'object' ? nodes[0] : {}
	const passwordSaved = passwordsSet?.[0] === true
	const polling = node.notify !== true
	const zmqError = zmqEndpointError(config.zmqblock)
	return (
		<div className='space-y-6'>
			<h3 className='font-outfit text-lg'>Bitcoin node connection</h3>
			{[
				{key: 'url', label: 'RPC Host and Port', hint: 'host:8332'},
				{key: 'auth', label: 'RPC Username', hint: 'Username'},
				{
					key: 'pass',
					label: 'RPC Password',
					hint: passwordSaved ? 'Saved on server (leave blank to keep)' : 'Password',
				},
			].map((field) => (
				<div className='border-b border-white/20 pb-3' key={field.key}>
					<div className='flex justify-between gap-4 items-center'>
						<label htmlFor={`node-${field.key}`} className='text-[14px]'>{field.label}</label>
						<InputField
							id={`node-${field.key}`}
							className='max-w-[50%]'
							disabled={disabled}
							autoComplete='off'
							type={field.key === 'pass' && !showPassword ? 'password' : 'text'}
							placeholder={field.hint}
							value={typeof node[field.key] === 'string' ? node[field.key] : ''}
							onChange={(e) => onChange('btcd', [{...node, [field.key]: e.target.value}, ...nodes.slice(1)])}
						/>
					</div>
				</div>
			))}
			<label className='flex gap-2 items-center text-xs text-white/60'>
				<Checkbox checked={showPassword} onCheckedChange={(value) => setShowPassword(value === true)} />
				Show RPC password
			</label>
			<section aria-labelledby='notifications-title' className='space-y-5 border-t border-white/20 pt-6'>
				<div>
					<h3 id='notifications-title' className='font-outfit text-lg'>Block notifications</h3>
					<p className='text-[13px] text-white/60 mt-2'>
						ZMQ delivers new-block notifications from Bitcoin Core. RPC polling checks for new blocks at a regular interval. You can use both together.
					</p>
					<p className='text-[12px] text-white/50 mt-2'>
						These settings describe the file you are editing. Notification delivery is not checked here.
					</p>
				</div>
				<div>
					<label htmlFor='zmq' className='text-[14px]'>ZMQ Block Endpoint</label>
					<p id='zmq-help' className='text-[13px] text-white/60 mt-2 mb-3'>
						Use the node’s reachable address and its hashblock notification port, matching Bitcoin Core’s zmqpubhashblock setting. This is separate from the RPC port.
					</p>
					<InputField
						id='zmq'
						disabled={disabled}
						placeholder='tcp://127.0.0.1:28332'
						aria-invalid={!!zmqError}
						aria-describedby={`zmq-help zmq-default${zmqError ? ' zmq-error' : ''}`}
						value={typeof config.zmqblock === 'string' ? config.zmqblock : ''}
						onChange={(e) => onChange('zmqblock', e.target.value || undefined)}
					/>
					{zmqError && <p id='zmq-error' role='alert' className='text-xs text-amber-200 mb-3'>{zmqError}</p>}
					<p id='zmq-default' className='text-[12px] text-white/50'>
						{live
							? 'Leaving this blank uses tcp://127.0.0.1:28332 inside the pool container; it does not disable ZMQ. Keep the configured Umbrel node address unless connecting to an external node.'
							: 'Leaving this blank uses tcp://127.0.0.1:28332; it does not disable ZMQ. On Umbrel, import your existing configuration to keep the correct node address. Localhost refers to the pool container.'}
					</p>
				</div>
				<div className='border-t border-white/20 pt-5'>
					<div className='flex justify-between items-center gap-4 mb-3'>
						<p className='text-[14px]'>Poll for new blocks</p>
						<Toggle
							name='Poll for new blocks'
							checked={polling}
							disabled={disabled}
							onToggle={(value) => onChange('btcd', [{...node, notify: !value}, ...nodes.slice(1)])}
						/>
					</div>
					<p className='text-[13px] text-white/60'>
						Keep polling enabled to check for blocks independently of ZMQ. Turn it off only when ZMQ or an external block notifier is already delivering notifications to the pool.
					</p>
					{!polling && <p role='status' className='text-xs text-amber-200 mt-3'>
						Polling is disabled for this node in this file. It will not automatically resume if notifications stop.
					</p>}
				</div>
				<div>
					<div className='flex justify-between items-center gap-4'>
						<label htmlFor='blockpoll' className='text-[14px]'>Block Polling Interval</label>
						<InputField
							id='blockpoll'
							className='max-w-[45%] sm:max-w-[240px]'
							disabled={disabled}
							type='number' min={1} step={1} unit='ms' placeholder='100'
							value={typeof config.blockpoll === 'number' ? config.blockpoll : ''}
							onChange={(e) => {
								if (e.target.value === '') {
									onChange('blockpoll', undefined)
									return
								}
								const parsed = Number(e.target.value)
								if (Number.isFinite(parsed)) onChange('blockpoll', parsed)
							}}
						/>
					</div>
					<p className='text-[12px] text-white/50'>
						Default: 100 ms. Shared by all nodes with polling enabled. This does not control ZMQ delivery or periodic work updates to miners.
					</p>
				</div>
				<div className='border-t border-white/20 pt-5'>
					<label htmlFor='ipcmining' className='text-[14px] text-white'>Mining IPC Socket (Optional)</label>
					<div className='my-1'>
						<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>ipcmining</span>
					</div>
					<p className='text-[13px] text-white/60 mt-2 mb-3'>
						Optional Unix socket path for Bitcoin Core v32.x <code className='font-mono'>-ipcbind</code>. Leave blank
						to use standard JSON-RPC and ZMQ (compatible with both Bitcoin Core and Bitcoin Knots).
					</p>
					<InputField
						id='ipcmining'
						disabled={disabled}
						placeholder='/run/bitcoind/mining.sock'
						value={typeof config.ipcmining === 'string' ? config.ipcmining : ''}
						onChange={(e) => onChange('ipcmining', e.target.value.trim() || undefined)}
					/>
				</div>
			</section>
			{nodes.length > 1 && <p className='text-[12px] text-white/50'>
				The polling switch applies to the first node. {nodes.length - 1} additional node connection(s) preserved. Edit them in Advanced.
			</p>}
		</div>
	)
}
