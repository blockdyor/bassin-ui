// Adapts upstream SettingsCard/FieldRenderer: same header/search, underlined tabs,
// internal FadeScrollArea, field hierarchy, inset inputs, and bottom actions.
import {useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Download, Search, Info, Github, ExternalLink} from 'lucide-react'
import {toast} from 'sonner'
import {Card, CardHeader, CardTitle, CardContent, CardFooter} from '@/components/ui/card'
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {GradientBorderFromTop} from '@/components/shared/GradientBorders'
import FadeScrollArea from '@/components/shared/FadeScrollArea'
import InfoDialog from '@/components/shared/InfoDialog'
import {useConfig} from '@/hooks/ConfigContext'
import {parseConfig, validateConfig, type Config} from '@/helpers/config'
import {download} from '@/helpers/display'
import InputField from './InputField'
import BitcoinNodeSettings from './BitcoinNodeSettings'
import {BASSIN_GITHUB_URL} from '@/helpers/constants'
import CKPoolLog from './CKPoolLog'
const tabs = [
	{value: 'mining', label: 'Mining'},
	{value: 'node', label: 'Bitcoin Node'},
	{value: 'advanced', label: 'Advanced'},
	{value: 'logs', label: 'Logs'},
]
const fields = [
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
]
export default function SettingsPage() {
	const {raw, setRaw, baseline, setBaseline, source, setSource, dirty} = useConfig()
	const [params, setParams] = useSearchParams()
	const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'mining'
	const [query, setQuery] = useState('')
	const file = useRef<HTMLInputElement>(null)
	let config: Config = {},
		parseError = ''
	try {
		config = parseConfig(raw)
	} catch (e) {
		parseError = e instanceof Error ? e.message : 'Invalid JSON'
	}
	const errors = parseError ? [parseError] : validateConfig(config)
	function change(key: string, value: unknown) {
		const next = {...config}
		if (value === undefined) delete next[key]
		else next[key] = value
		setRaw(JSON.stringify(next, null, 2))
	}
	const search = query.trim().toLowerCase()
	const shown = fields.filter((field) =>
		search ? `${field.label} ${field.key}`.toLowerCase().includes(search) : field.tab === tab,
	)
	const showNode = search
		? search.split(/\s+/).every((word) =>
				'bitcoin core node rpc host port username password btcd auth pass zmq zmqblock hashblock notifications notify polling blockpoll interval'.includes(word),
			)
		: tab === 'node'
	function fieldRow(field: (typeof fields)[number]) {
		const numeric = typeof field.default === 'number'
		return (
			<div key={field.key} className='relative flex flex-col gap-1 border-b border-white/20 pb-6 mb-6 last:border-none'>
				<div className='flex flex-row justify-between items-center gap-4'>
					<div>
						<label htmlFor={`field-${field.key}`} className='text-[14px] font-normal text-white'>
							{field.label}
							{config[field.key] !== undefined &&
								JSON.stringify(config[field.key]) !==
									JSON.stringify(
										(() => {
											try {
												return parseConfig(baseline)[field.key]
											} catch {
												return undefined
											}
										})(),
									) && (
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
						disabled={!!parseError}
						type={numeric ? 'number' : 'text'}
						min={numeric ? field.min : undefined}
						step={numeric ? 1 : undefined}
						unit={field.unit}
						placeholder={String(field.default)}
						value={
							typeof config[field.key] === 'string' || typeof config[field.key] === 'number'
								? (config[field.key] as string | number)
								: ''
						}
						onChange={(e) =>
							change(field.key, e.target.value === '' ? undefined : numeric ? Number(e.target.value) : e.target.value)
						}
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
			setBaseline(text)
			setSource(selected.name)
			toast.success('Configuration imported')
		} catch (e) {
			toast.error(`Could not import: ${e instanceof Error ? e.message : 'Invalid JSON'}`)
		}
	}
	function exportFile() {
		if (errors.length) return
		download(JSON.stringify(config, null, 2) + '\n', 'ckpool.conf', 'application/json')
		setBaseline(raw)
		toast.success('Configuration downloaded. Apply the file and restart Bassin.')
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
							description='Import your existing ckpool.conf, edit its options, and download the updated file. This static UI does not read or write the running configuration. Apply the downloaded file in your config volume and restart Bassin. Credentials stay in this browser tab until you download them.'
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
							{search && !shown.length && !showNode && (
								<p className='text-center text-white/60 text-sm'>No results found for “{query}”</p>
							)}
							{shown.map(fieldRow)}
							{showNode && <BitcoinNodeSettings config={config} disabled={!!parseError} onChange={change} />}
							{!search && (
								<>
									{tab === 'advanced' && (
										<div>
											<h3 className='font-outfit text-lg mb-2'>Custom Configuration</h3>
											<p className='text-[13px] text-white/60 mb-4'>
												Complete pool configuration JSON, including imported credentials and custom options. Changing
												Stratum listeners also requires matching the container’s published ports.
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
									<p className='text-[11px] text-white/40 mt-5 break-all'>
										Editing {source}
										{dirty ? ' · Unexported changes' : ''}. Local configuration, not the running pool.
									</p>
									{errors.length > 0 && (
										<div role='status' className='mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-200'>
											<strong>Before downloading</strong>
											<ul className='list-disc pl-4 mt-2 space-y-1'>
												{errors.map((error) => (
													<li key={error}>{error}</li>
												))}
											</ul>
										</div>
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
				<div className='flex gap-2 w-full sm:w-auto justify-between'>
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
				</div>
			</CardFooter>
		</Card>
	)
}
