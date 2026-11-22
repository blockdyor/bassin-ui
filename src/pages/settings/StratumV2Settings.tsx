import {Button} from '@/components/ui/button'
import {normalizeUrlList, type Config} from '@/helpers/config'
import {BASSIN_SV2_JD_PORT, BASSIN_SV2_PORT} from '@/helpers/constants'
import InputField from './InputField'
import Toggle from './Toggle'

type Props = {
	config: Config
	disabled: boolean
	onChange: (key: string, value: unknown) => void
	onPatch: (updates: Record<string, unknown>) => void
}

function parseListInput(raw: string): string[] | undefined {
	const items = raw
		.split(/[,\n]/)
		.map((part) => part.trim())
		.filter(Boolean)
	return items.length ? items : undefined
}

export default function StratumV2Settings({config, disabled, onChange, onPatch}: Props) {
	const sv2Urls = normalizeUrlList(config.sv2url)
	const sv2JdUrls = normalizeUrlList(config.sv2jdurl)
	const sv2Enabled = sv2Urls.length > 0
	const jdEnabled = sv2JdUrls.length > 0
	const anySv2 = sv2Enabled || jdEnabled
	const authorityKey = typeof config.sv2_authority_key === 'string' ? config.sv2_authority_key : ''
	const staticKey = typeof config.sv2_static_key === 'string' ? config.sv2_static_key : ''
	const missingPersistentKeys = anySv2 && (!authorityKey.trim() || !staticKey.trim())
	const hasIpc = typeof config.ipcmining === 'string' && config.ipcmining.trim().length > 0

	return (
		<div className='space-y-6'>
			<div>
				<h3 className='font-outfit text-lg'>Stratum V2 (Noise-encrypted)</h3>
				<p className='text-[13px] text-white/60 mt-2'>
					Enable encrypted Stratum V2 mining alongside Stratum V1. Solo SV2 mining works over standard JSON-RPC and ZMQ
					with both Bitcoin Core and Bitcoin Knots 29.3+.
				</p>
			</div>

			<div className='border-t border-white/20 pt-5 space-y-4'>
				<div className='flex justify-between items-center gap-4'>
					<div>
						<p className='text-[14px]'>Enable Stratum V2 Mining</p>
						<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>sv2url</span>
					</div>
					<Toggle
						name='Enable Stratum V2 Mining'
						checked={sv2Enabled}
						disabled={disabled}
						onToggle={(enabled) => {
							if (enabled) {
								const updates: Record<string, unknown> = {sv2url: ['0.0.0.0:3336']}
								if (!authorityKey.trim()) updates.sv2_authority_key = '/sv2/sv2_authority.key'
								if (!staticKey.trim()) updates.sv2_static_key = '/sv2/sv2_static.key'
								onPatch(updates)
							} else {
								onChange('sv2url', undefined)
							}
						}}
					/>
				</div>
				<div>
					<label htmlFor='sv2-url' className='text-[14px] text-white'>
						SV2 Mining Listeners
					</label>
					<p className='text-[12px] text-white/50 mt-1 mb-2'>
						Comma-separated bind addresses (default container port 3336, published on host port {BASSIN_SV2_PORT}).
					</p>
					<InputField
						id='sv2-url'
						disabled={disabled}
						placeholder='0.0.0.0:3336'
						value={sv2Urls.join(', ')}
						onChange={(e) => onChange('sv2url', parseListInput(e.target.value))}
					/>
				</div>
			</div>

			<div className='border-t border-white/20 pt-5 space-y-4'>
				<div className='flex justify-between items-center gap-4'>
					<div>
						<p className='text-[14px]'>Enable Job Declaration (JDS)</p>
						<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>sv2jdurl</span>
					</div>
					<Toggle
						name='Enable Job Declaration (JDS)'
						checked={jdEnabled}
						disabled={disabled}
						onToggle={(enabled) => {
							if (enabled) {
								const updates: Record<string, unknown> = {sv2jdurl: ['0.0.0.0:3337']}
								if (!authorityKey.trim()) updates.sv2_authority_key = '/sv2/sv2_authority.key'
								if (!staticKey.trim()) updates.sv2_static_key = '/sv2/sv2_static.key'
								onPatch(updates)
							} else {
								onChange('sv2jdurl', undefined)
							}
						}}
					/>
				</div>
				<p className='text-[13px] text-white/60'>
					Allows SV2 Job Declaration clients to propose custom block templates (default container port 3337, published
					on host port {BASSIN_SV2_JD_PORT}).
				</p>
				{jdEnabled && !hasIpc && (
					<p role='status' className='text-xs text-amber-200 bg-amber-400/10 rounded-lg p-3'>
						Job Declaration template validation requires Bitcoin Core v32.x Mining IPC (set{' '}
						<code className='font-mono'>ipcmining</code> in Bitcoin Node settings). Without IPC, CKPool rejects declared
						jobs fail-closed while standard SV2 mining continues normally.
					</p>
				)}
				<div>
					<label htmlFor='sv2-jd-url' className='text-[14px] text-white'>
						SV2 Job Declaration Listeners
					</label>
					<p className='text-[12px] text-white/50 mt-1 mb-2'>Comma-separated bind addresses (default port 3337).</p>
					<InputField
						id='sv2-jd-url'
						disabled={disabled}
						placeholder='0.0.0.0:3337'
						value={sv2JdUrls.join(', ')}
						onChange={(e) => onChange('sv2jdurl', parseListInput(e.target.value))}
					/>
				</div>
			</div>

			<div className='border-t border-white/20 pt-5 space-y-4'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<h4 className='font-outfit text-base'>Noise Key Persistence</h4>
					{missingPersistentKeys && (
						<Button
							type='button'
							size='sm'
							disabled={disabled}
							onClick={() =>
								onPatch({
									sv2_authority_key: '/sv2/sv2_authority.key',
									sv2_static_key: '/sv2/sv2_static.key',
								})
							}
						>
							Use persistent /sv2 paths
						</Button>
					)}
				</div>
				<p className='text-[13px] text-white/60'>
					CKPool creates missing Noise keys automatically on first start. Store them in the private{' '}
					<code className='font-mono'>/sv2</code> mount so the authority public key survives container restarts. Never
					place private keys under <code className='font-mono'>/www</code>.
				</p>
				{missingPersistentKeys && (
					<p role='status' className='text-xs text-amber-200 bg-amber-400/10 rounded-lg p-3'>
						Without explicit key paths, CKPool stores keys in <code className='font-mono'>/tmp</code>, which resets on
						restart and invalidates miner SV2 connection URLs.
					</p>
				)}
				<div className='space-y-3'>
					<div className='flex justify-between gap-4 items-center'>
						<div>
							<label htmlFor='sv2-authority-key' className='text-[14px] text-white'>
								Authority Key Path
							</label>
							<div className='my-1'>
								<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>sv2_authority_key</span>
							</div>
						</div>
						<InputField
							id='sv2-authority-key'
							className='max-w-[50%]'
							disabled={disabled}
							placeholder='/sv2/sv2_authority.key'
							value={authorityKey}
							onChange={(e) => onChange('sv2_authority_key', e.target.value.trim() || undefined)}
						/>
					</div>
					<div className='flex justify-between gap-4 items-center'>
						<div>
							<label htmlFor='sv2-static-key' className='text-[14px] text-white'>
								Static Server Key Path
							</label>
							<div className='my-1'>
								<span className='text-[12px] text-white/50 bg-[#26343d] px-1 rounded-sm'>sv2_static_key</span>
							</div>
						</div>
						<InputField
							id='sv2-static-key'
							className='max-w-[50%]'
							disabled={disabled}
							placeholder='/sv2/sv2_static.key'
							value={staticKey}
							onChange={(e) => onChange('sv2_static_key', e.target.value.trim() || undefined)}
						/>
					</div>
				</div>
				<p className='text-[12px] text-white/50'>
					Version rolling for SV2 allows all BIP323 bits (<code className='font-mono'>1fffffe0</code>) unless{' '}
					<code className='font-mono'>version_mask</code> in Mining is set to <code className='font-mono'>0</code>.
				</p>
			</div>
		</div>
	)
}
