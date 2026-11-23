// Adapts upstream SettingsCard/FieldRenderer: same header/search, underlined tabs,
// internal FadeScrollArea, field hierarchy, inset inputs, and bottom actions.
import {useRef, useState, type FormEvent} from 'react'
import {useSearchParams} from 'react-router-dom'
import {CheckCircle2, Download, Search, Info, Github, ExternalLink, Loader2, AlertCircle, Lock, RotateCw, Save} from 'lucide-react'
import {toast} from 'sonner'
import {Card, CardHeader, CardTitle, CardContent, CardFooter} from '@/components/ui/card'
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {GradientBorderFromTop} from '@/components/shared/GradientBorders'
import FadeScrollArea from '@/components/shared/FadeScrollArea'
import InfoDialog from '@/components/shared/InfoDialog'
import {useConfig} from '@/hooks/ConfigContext'
import {usePoolData} from '@/hooks/PoolContext'
import {normalizeUrlList, parseConfig, validateConfig, type Config} from '@/helpers/config'
import {download} from '@/helpers/display'
import InputField from './InputField'
import BitcoinNodeSettings from './BitcoinNodeSettings'
import StratumV2Settings from './StratumV2Settings'
import Toggle from './Toggle'
import {BASSIN_GITHUB_URL} from '@/helpers/constants'
import CKPoolLog from './CKPoolLog'
const tabs = [
	{value: 'mining', label: 'Mining'},
	{value: 'sv2', label: 'Stratum V2'},
	{value: 'node', label: 'Bitcoin Node'},
	{value: 'advanced', label: 'Advanced'},
	{value: 'logs', label: 'Logs'},
]
type FieldSpec = {
	key: string
	label: string
	tab: 'mining' | 'advanced'
	default: number | string
	min?: number
	max?: number
	step?: number
	unit?: string
	description: string
}
const fields: FieldSpec[] = [
	{
		key: 'mindiff',
		label: 'Minimum Difficulty',
		tab: 'mining',
		default: 1,
		min: 1,
		description: 'The lowest share difficulty assigned to your miners.',
	},
	{
		key: 'startdiff',
		label: 'Starting Difficulty',
		tab: 'mining',
		default: 10000,
		min: 1,
		description: 'The initial share difficulty given to a newly connected miner. Bassin’s template starts at 42.',
	},
	{
		key: 'highdiff',
		label: 'High Difficulty Floor',
		tab: 'mining',
		default: 0,
		min: 0,
		description: 'Optional minimum difficulty floor applied on high-difficulty Stratum listeners (0 disables).',
	},
	{
		key: 'maxdiff',
		label: 'Maximum Difficulty',
		tab: 'mining',
		default: 0,
		min: 0,
		description: 'Limit the difficulty assigned to miners. Set to zero for no maximum.',
	},
	{
		key: 'btcsig',
		label: 'Coinbase Signature',
		tab: 'mining',
		default: '',
		description: 'Your message in the coinbase of blocks you find. Maximum 38 UTF-8 bytes.',
	},
	{
		key: 'version_mask',
		label: 'Version Rolling Mask',
		tab: 'mining',
		default: '1fffe000',
		description: 'Hex mask of BIP320/BIP323 version bits miners may roll. Set to 0 to disable Stratum V2 version rolling.',
	},
	{
		key: 'dropidle',
		label: 'Drop Idle Clients',
		tab: 'mining',
		default: 0,
		min: 0,
		unit: 'sec',
		description: 'Disconnect miners after this many idle seconds. Set to 0 to keep idle miners connected.',
	},
	{
		key: 'update_interval',
		label: 'Work Update Interval',
		tab: 'advanced',
		default: 30,
		min: 1,
		unit: 'sec',
		description: 'How often to send updated Stratum work to miners.',
	},
	{
		key: 'logdir',
		label: 'Log Directory',
		tab: 'advanced',
		default: '/www',
		description: 'Keep /www for the standard Bassin deployment so statistics and logs remain available.',
	},
	{
		key: 'nonce1length',
		label: 'Extranonce1 Length',
		tab: 'advanced',
		default: 4,
		min: 2,
		max: 8,
		unit: 'bytes',
		description: 'Length of Stratum extranonce1 in bytes (2 to 8).',
	},
	{
		key: 'nonce2length',
		label: 'Extranonce2 Length',
		tab: 'advanced',
		default: 8,
		min: 2,
		max: 8,
		unit: 'bytes',
		description: 'Length of Stratum extranonce2 in bytes (2 to 8).',
	},
	{
		key: 'maxclients',
		label: 'Maximum Clients',
		tab: 'advanced',
		default: 0,
		min: 0,
		description: 'Upper limit on simultaneous miner connections (0 for unlimited).',
	},
	{
		key: 'maxusers',
		label: 'Maximum Users',
		tab: 'advanced',
		default: 0,
		min: 0,
		description: 'Upper limit on distinct mining addresses tracked by the pool (0 for unlimited).',
	},
	{
		key: 'maxsubclients',
		label: 'Maximum Subclients',
		tab: 'advanced',
		default: 65536,
		min: -1,
		description: 'Maximum downstream subclients per passthrough/proxy parent (-1 disables the limit).',
	},
	{
		key: 'maxsendqueue',
		label: 'Maximum Send Queue',
		tab: 'advanced',
		default: 0,
		min: 0,
		unit: 'bytes',
		description: 'Optional cap on queued outbound bytes per client before disconnecting slow readers (0 uses CKPool default).',
	},
]
export default function SettingsPage() {
	const {
		raw,
		setRaw,
		baseline,
		setBaseline,
		source,
		setSource,
		dirty,
		live,
		authRequired,
		unlocked,
		authError,
		unlock,
		lock,
		discard,
		save,
		passwordsSet,
		saveState,
		saveError,
		pendingRestart,
	} = useConfig()
	const {pool} = usePoolData()
	const [params, setParams] = useSearchParams()
	const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'mining'
	const [query, setQuery] = useState('')
	const [tokenInput, setTokenInput] = useState('')
	const [unlocking, setUnlocking] = useState(false)
	const file = useRef<HTMLInputElement>(null)
	const locked = live && !unlocked
	let config: Config = {},
		baselineConfig: Config = {},
		parseError = ''
	try {
		config = parseConfig(raw)
	} catch (e) {
		parseError = e instanceof Error ? e.message : 'Invalid JSON'
	}
	try {
		baselineConfig = parseConfig(baseline)
	} catch {
		baselineConfig = {}
	}
	const errors = parseError ? [parseError] : validateConfig(config, {passwordsSet})
	function patch(updates: Record<string, unknown>) {
		const next = {...config}
		for (const [key, value] of Object.entries(updates)) {
			if (value === undefined) delete next[key]
			else next[key] = value
		}
		setRaw(JSON.stringify(next, null, 2))
	}
	function change(key: string, value: unknown) {
		patch({[key]: value})
	}
	const search = query.trim().toLowerCase()
	const shown = fields.filter((field) =>
		search ? `${field.label} ${field.key} ${field.description}`.toLowerCase().includes(search) : field.tab === tab,
	)
	const showSv2 = search
		? search.split(/\s+/).every((word) =>
				'stratum v2 sv2 sv2url sv2jdurl noise encryption job declaration jds authority static key keys persistent 3336 3337 3457 3458'.includes(
					word,
				),
			)
		: tab === 'sv2'
	const showNode = search
		? search.split(/\s+/).every((word) =>
				'bitcoin core knots node rpc host port username password btcd auth pass zmq zmqblock hashblock notifications notify polling blockpoll interval ipc ipcmining socket'.includes(
					word,
				),
			)
		: tab === 'node'
	const showAdvancedExtra = search
		? search.split(/\s+/).every((word) => 'serverurl stratum v1 listeners bind port reconnect'.includes(word))
		: tab === 'advanced'
	function fieldRow(field: (typeof fields)[number]) {
		const numeric = typeof field.default === 'number'
		return (
			<div key={field.key} className='relative flex flex-col gap-1 border-b border-white/20 pb-6 mb-6 last:border-none'>
				<div className='flex flex-row justify-between items-center gap-4'>
					<div>
						<label htmlFor={`field-${field.key}`} className='text-[14px] font-normal text-white'>
							{field.label}
							{!parseError && JSON.stringify(config[field.key]) !== JSON.stringify(baselineConfig[field.key]) && (
								<span className='ml-2 text-[#76d9f5]' aria-label='Edited'>
									•
								</span>
							)}
						</label>
						<div className='my-1'>
							<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>{field.key}</span>
						</div>
					</div>
					<InputField
						id={`field-${field.key}`}
						className='max-w-[45%] sm:max-w-[240px]'
						disabled={!!parseError || (live && field.key === 'logdir')}
						type={numeric ? 'number' : 'text'}
						min={numeric ? field.min : undefined}
						max={numeric ? field.max : undefined}
						step={numeric ? (field.step ?? 1) : undefined}
						unit={field.unit}
						placeholder={String(field.default)}
						value={
							typeof config[field.key] === 'string' || typeof config[field.key] === 'number'
								? (config[field.key] as string | number)
								: ''
						}
						onChange={(e) => {
							if (e.target.value === '') {
								change(field.key, undefined)
								return
							}
							if (!numeric) {
								change(field.key, e.target.value)
								return
							}
							const parsed = Number(e.target.value)
							if (Number.isFinite(parsed)) change(field.key, parsed)
						}}
					/>
				</div>
				<p className='text-[13px] text-white/60'>{field.description}</p>
				<p className='text-[12px] text-white/50 mt-2'>default: {String(field.default) || 'none'}</p>
			</div>
		)
	}
	async function importFile(selected: File | undefined) {
		if (!selected) return
		if (selected.size > 1024 * 1024) {
			toast.error('Configuration exceeds 1 MiB.')
			return
		}
		try {
			const text = JSON.stringify(parseConfig(await selected.text()), null, 2)
			setRaw(text)
			if (!live) {
				setBaseline(text)
				setSource(selected.name)
			}
			toast.success(live ? 'Configuration imported — review and click Save to apply' : 'Configuration imported')
		} catch (e) {
			toast.error(`Could not import: ${e instanceof Error ? e.message : 'Invalid JSON'}`)
		}
	}
	async function handleUnlock(event: FormEvent) {
		event.preventDefault()
		setUnlocking(true)
		const ok = await unlock(tokenInput)
		setUnlocking(false)
		if (ok) {
			setTokenInput('')
			toast.success('Settings unlocked for this tab session')
		}
	}
	async function handleSave(restart: boolean) {
		if (restart && pool && pool.Workers > 0) {
			const count = pool.Workers
			const ok = window.confirm(
				`Saving & restarting CKPool will briefly disconnect ${count} active worker${count === 1 ? '' : 's'}. Continue?`,
			)
			if (!ok) return
		}
		const ok = await save({restart})
		if (ok) {
			toast.success(
				restart
					? 'Configuration saved and CKPool restart triggered'
					: 'Configuration saved. Changes will apply on next pool restart.',
			)
		}
	}
	function exportFile() {
		if (errors.length) return
		download(JSON.stringify(config, null, 2) + '\n', 'ckpool.conf', 'application/json')
		if (!live) {
			setBaseline(raw)
			toast.success('Configuration downloaded. Apply the file and restart Bassin.')
		} else {
			toast.success('Backup downloaded. Saved RPC passwords remain on the server unless entered here.')
		}
	}
	return (
		<Card
			data-testid='settings-card'
			className='bg-card-gradient backdrop-blur-2xl border-none rounded-3xl py-4 text-white'
		>
			<GradientBorderFromTop />
			<CardHeader>
				<div className='flex items-center justify-between gap-3'>
					<CardTitle className='font-outfit text-white text-[20px] font-normal pt-2 flex items-center gap-2'>
						Settings
						<InfoDialog
							trigger={<Info className='size-3 text-white/40' />}
							title='Pool configuration'
							description={
								live
									? 'Connected to your running ckpool.conf using your Bassin app password. Edits are never auto-saved — click Save to write without interrupting miners, or Save & Restart Pool to apply immediately. Restricted keys (such as donation, btcaddress, and logdir) cannot be changed through the API.'
									: 'Import your existing ckpool.conf, edit its options, and download the updated file. This static preview does not read or write a running configuration. Apply the downloaded file in your config volume and restart Bassin.'
							}
						/>
					</CardTitle>
					<div className='relative max-w-[50%] sm:max-w-xs mt-2'>
						<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white' />
						<Input
							aria-label='Search settings'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder='Search'
							className='pl-10 border-none bassin-field text-white placeholder:text-white/50 focus-visible:ring-0'
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<Tabs
					value={tab}
					onValueChange={(value) => {
						setQuery('')
						setParams(value === 'mining' ? {} : {tab: value})
					}}
				>
					<div
						className={`relative w-full after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-white/20 ${search ? 'opacity-0 pointer-events-none' : ''}`}
					>
						<FadeScrollArea className='w-full'>
							<TabsList className='relative flex bg-transparent rounded-none h-auto p-0 gap-1 z-10 w-max'>
								{tabs.map((item) => (
									<TabsTrigger key={item.value} value={item.value} className='bassin-tab'>
										{item.label}
									</TabsTrigger>
								))}
							</TabsList>
						</FadeScrollArea>
					</div>
					<FadeScrollArea
						key={search ? 'search' : tab}
						className='h-[calc(100dvh-455px)] md:h-[calc(100dvh-390px)] min-h-[120px] [--fade-top:#101b22] [--fade-bottom:#080e12]'
					>
						<div className='pt-6 px-0.5 pb-6'>
							{locked && tab !== 'logs' ? (
								<div
									data-testid='config-auth-gate'
									className='mx-auto max-w-md rounded-2xl border border-white/15 bg-black/25 p-6 space-y-4'
								>
									<div className='flex items-center gap-2 text-white'>
										<Lock className='size-4 text-[#76d9f5]' />
										<h3 className='font-outfit text-lg'>Unlock pool settings</h3>
									</div>
									{authRequired ? (
										<>
											<p className='text-[13px] text-white/65'>
												Enter your Bassin app password (shown in Umbrel under Bassin’s app credentials, or your{' '}
												<code className='font-mono'>BASSIN_CONFIG_TOKEN</code>) to view and edit live settings. The
												Logs tab remains available without unlocking.
											</p>
											<form onSubmit={(e) => void handleUnlock(e)} className='space-y-3'>
												<Input
													type='password'
													autoComplete='current-password'
													aria-label='Bassin config password'
													placeholder='App password'
													value={tokenInput}
													onChange={(e) => setTokenInput(e.target.value)}
													className='border-none bassin-field text-white placeholder:text-white/50 focus-visible:ring-0'
												/>
												{authError && (
													<p role='alert' className='text-xs text-amber-200'>
														{authError}
													</p>
												)}
												<Button type='submit' disabled={unlocking} className='w-full sm:w-auto'>
													{unlocking ? <Loader2 className='size-4 animate-spin' /> : <Lock className='size-4' />}
													Unlock Settings
												</Button>
											</form>
										</>
									) : (
										<p role='alert' className='text-[13px] text-amber-200'>
											{authError || 'Config API is disabled on this server (BASSIN_CONFIG_TOKEN is not set).'}
										</p>
									)}
								</div>
							) : (
								<>
									{search && !shown.length && !showSv2 && !showNode && !showAdvancedExtra && (
										<p className='text-center text-white/60 text-sm'>No results found for “{query}”</p>
									)}
									{shown.map(fieldRow)}
									{showSv2 && (
										<StratumV2Settings config={config} disabled={!!parseError} onChange={change} onPatch={patch} />
									)}
									{showNode && (
										<BitcoinNodeSettings
											config={config}
											disabled={!!parseError}
											live={live}
											passwordsSet={passwordsSet}
											onChange={change}
										/>
									)}
									{showAdvancedExtra && (
										<div className='space-y-6 border-t border-white/20 pt-6 mb-6'>
											<div className='flex flex-col gap-1 border-b border-white/20 pb-6'>
												<div className='flex flex-row justify-between items-center gap-4'>
													<div>
														<label htmlFor='field-serverurl' className='text-[14px] font-normal text-white'>
															Stratum V1 Listeners
														</label>
														<div className='my-1'>
															<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>serverurl</span>
														</div>
													</div>
													<InputField
														id='field-serverurl'
														className='max-w-[45%] sm:max-w-[240px]'
														disabled={!!parseError}
														placeholder='0.0.0.0:3333'
														value={normalizeUrlList(config.serverurl).join(', ')}
														onChange={(e) => {
															const list = e.target.value
																.split(/[,\n]/)
																.map((part) => part.trim())
																.filter(Boolean)
															change('serverurl', list.length ? list : undefined)
														}}
													/>
												</div>
												<p className='text-[13px] text-white/60'>
													Comma-separated host:port bindings for Stratum V1 (for example 0.0.0.0:3333). Required to keep
													Stratum V1 port 3456 active whenever Stratum V2 is enabled; leaving blank only defaults to port 3333
													when Stratum V2 is off.
												</p>
											</div>
											<div className='flex justify-between items-center gap-4'>
												<div>
													<p className='text-[14px] text-white'>Allow Client Reconnect</p>
													<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>reconnect</span>
													<p className='text-[13px] text-white/60 mt-1'>
														Allow Stratum V1 client.reconnect directives (enabled by default in CKPool).
													</p>
												</div>
												<Toggle
													name='Allow Client Reconnect'
													checked={config.reconnect !== false}
													disabled={!!parseError}
													onToggle={(value) => change('reconnect', value ? undefined : false)}
												/>
											</div>
										</div>
									)}
									{!search && (
										<>
											{tab === 'advanced' && (
												<div>
													<h3 className='font-outfit text-lg mb-2'>Custom Configuration</h3>
													<p className='text-[13px] text-white/60 mb-4'>
														Complete pool configuration JSON. Restricted keys (
														<code className='font-mono'>donation</code>, <code className='font-mono'>btcaddress</code>,{' '}
														<code className='font-mono'>logdir</code>) can only be edited directly on disk.
													</p>
													<textarea
														aria-label='Pool configuration JSON'
														className='w-full min-h-64 rounded-lg bg-black/30 border border-white/10 p-3 font-mono text-xs text-white/75 leading-6 focus:outline-[#76d9f5]'
														value={raw}
														onChange={(e) => setRaw(e.target.value)}
														spellCheck={false}
													/>
												</div>
											)}
											{tab === 'logs' && <CKPoolLog />}
										</>
									)}
									{(tab !== 'logs' || search) && (
										<>
											{live ? (
												<div
													data-testid='live-config-status'
													role='status'
													className='mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/75'
												>
													<span className='flex items-center gap-2'>
														{saveState === 'saving' ? (
															<>
																<Loader2 className='size-3.5 animate-spin text-[#76d9f5]' />
																Saving configuration…
															</>
														) : saveState === 'error' ? (
															<>
																<AlertCircle className='size-3.5 text-amber-300' />
																<span className='text-amber-200'>{saveError || 'Failed to save changes.'}</span>
															</>
														) : dirty ? (
															<>
																<AlertCircle className='size-3.5 text-[#76d9f5]' />
																Unsaved changes · Click Save or Save &amp; Restart Pool
															</>
														) : pendingRestart ? (
															<>
																<CheckCircle2 className='size-3.5 text-amber-200' />
																Saved to ckpool.conf · Click Save &amp; Restart Pool when ready to apply
															</>
														) : saveState === 'saved' ? (
															<>
																<CheckCircle2 className='size-3.5 text-emerald-300' />
																Saved &amp; CKPool restart triggered
															</>
														) : (
															<>
																<CheckCircle2 className='size-3.5 text-[#76d9f5]' />
																Live · Connected to /config/ckpool.conf
															</>
														)}
													</span>
													<Button type='button' size='sm' variant='ghost' onClick={lock} className='h-7 px-2 text-xs text-white/60 hover:text-white'>
														<Lock className='size-3 mr-1' />
														Lock
													</Button>
												</div>
											) : (
												<p className='text-[11px] text-white/40 mt-5 break-all'>
													Editing {source}
													{dirty ? ' · Unexported changes' : ''}. Local configuration, not the running pool.
												</p>
											)}
											{errors.length > 0 && (
												<div role='status' className='mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-200'>
													<strong>{live ? 'Before saving' : 'Before downloading'}</strong>
													<ul className='list-disc pl-4 mt-2 space-y-1'>
														{errors.map((error) => (
															<li key={error}>{error}</li>
														))}
													</ul>
												</div>
											)}
										</>
									)}
								</>
							)}
						</div>
					</FadeScrollArea>
				</Tabs>
			</CardContent>
			<CardFooter className='flex flex-wrap justify-between gap-3'>
				<a
					href={BASSIN_GITHUB_URL}
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-1.5 text-xs text-white/45 hover:text-[#76d9f5] transition-colors mr-auto'
					aria-label='Bassin on GitHub'
				>
					<Github className='size-3.5' />
					Bassin on GitHub
					<ExternalLink className='size-3' />
				</a>
				{!locked && (
					<div className='flex flex-wrap gap-2 w-full sm:w-auto justify-end'>
						<input
							type='file'
							ref={file}
							hidden
							accept='.conf,.json,application/json'
							onChange={(e) => {
								void importFile(e.target.files?.[0])
								e.target.value = ''
							}}
						/>
						{live ? (
							<>
								{dirty && (
									<Button type='button' variant='ghost' onClick={discard} disabled={saveState === 'saving'}>
										Discard
									</Button>
								)}
								<Button
									type='button'
									variant='secondary'
									disabled={errors.length > 0 || !dirty || saveState === 'saving'}
									onClick={() => void handleSave(false)}
								>
									<Save className='size-4' />
									Save
								</Button>
								<Button
									type='button'
									disabled={errors.length > 0 || (!dirty && !pendingRestart) || saveState === 'saving'}
									onClick={() => void handleSave(true)}
								>
									<RotateCw className='size-4' />
									Save &amp; Restart Pool
								</Button>
								<Button
									type='button'
									variant='ghost'
									size='sm'
									disabled={errors.length > 0}
									onClick={exportFile}
									aria-label='Download config'
									title='Download config backup'
								>
									<Download className='size-4' />
								</Button>
							</>
						) : (
							<>
								<Button
									onClick={() => {
										if (!dirty || window.confirm('Replace your unexported edits with an imported configuration?'))
											file.current?.click()
									}}
								>
									Import config
								</Button>
								<Button disabled={errors.length > 0} onClick={exportFile}>
									<Download />
									Download config
								</Button>
							</>
						)}
					</div>
				)}
			</CardFooter>
		</Card>
	)
}
