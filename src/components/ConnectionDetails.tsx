// Adapted from Umbrel Bitcoin's ConnectionDetails: retain dialog, tabs, QR card, fields, and copy controls.
import {useEffect, useRef, useState} from 'react'
import QrSvg from '@wojtekmaj/react-qr-svg'
import copy from 'copy-to-clipboard'
import {Copy, Plug, X} from 'lucide-react'
import {toast} from 'sonner'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/components/ui/tabs'
import {Button} from '@/components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {GradientBorderFromTop} from '@/components/shared/GradientBorders'
import FadeScrollArea from '@/components/shared/FadeScrollArea'
import {BASSIN_STRATUM_PORT, BASSIN_SV2_JD_PORT, BASSIN_SV2_PORT} from '@/helpers/constants'
import {formatSv2Url} from '@/helpers/sv2'
import {usePoolSv2} from '@/hooks/usePoolSv2'

function Field({label, value}: {label: string; value: string}) {
	const [open, setOpen] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => () => {
		if (timer.current !== null) clearTimeout(timer.current)
	}, [])
	function handleCopy() {
		if (copy(value)) {
			setOpen(true)
			if (timer.current !== null) clearTimeout(timer.current)
			timer.current = setTimeout(() => setOpen(false), 800)
		} else toast.error('Copy unavailable. Select and copy the value manually.')
	}
	return (
		<div className='min-h-[42px] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 text-sm py-2'>
			<span className='shrink-0 text-white'>{label}</span>
			<div className='flex min-w-0 items-center justify-end gap-2'>
				<span
					className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-white/60'
					title={value}
				>
					{value}
				</span>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={handleCopy}
							aria-label={`Copy ${label}`}
							className='h-4 w-4 shrink-0 p-0 hover:bg-transparent'
						>
							<Copy className='scale-75 text-white/70' />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						side='top'
						className='w-auto rounded-md border-white/20 bg-black/90 px-2 py-1 text-[12px] text-white'
					>
						Copied!
					</PopoverContent>
				</Popover>
			</div>
		</div>
	)
}
export default function ConnectionDetails() {
	const host = window.location.hostname
	const uri = `stratum+tcp://${host}:${BASSIN_STRATUM_PORT}`
	const {data: sv2} = usePoolSv2()
	const sv2Uri = formatSv2Url(host, BASSIN_SV2_PORT, sv2?.authorityPubkey)
	const sv2JdUri = formatSv2Url(host, BASSIN_SV2_JD_PORT, sv2?.authorityPubkey)
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className='relative cursor-pointer rounded-full bg-button-gradient backdrop-blur-xl'>
					<GradientBorderFromTop />
					<Plug className='w-5 h-5 text-[#969696]' />
					<span className='text-[13px] text-white/80 font-medium'>Connect</span>
				</Button>
			</DialogTrigger>
			<DialogContent
				className='bg-card-gradient backdrop-blur-2xl border-white/10 border-[0.5px] rounded-2xl max-h-[90vh] flex flex-col sm:max-w-[768px]'
				showCloseButton={false}
			>
				<GradientBorderFromTop />
				<DialogClose asChild>
					<button
						aria-label='Close connection details'
						className='absolute top-4 right-4 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center'
					>
						<X className='w-3 h-3 text-white/70' />
					</button>
				</DialogClose>
				<DialogHeader>
					<DialogTitle className='font-outfit text-white text-[20px] font-normal text-left flex items-center gap-2'>
						<Plug className='w-5 h-5' />
						Connect to Bassin
					</DialogTitle>
					<DialogDescription className='text-white/60 text-left text-[13px]'>
						Connect your miner to your own Bitcoin solo-mining pool.
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue='stratum'>
					<div className='relative w-full after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-white/20'>
						<TabsList className='relative flex bg-transparent rounded-none h-auto p-0 gap-1 z-10 w-max'>
							<TabsTrigger className='bassin-tab' value='stratum'>
								Stratum
							</TabsTrigger>
							<TabsTrigger className='bassin-tab' value='stratum-v2'>
								Stratum V2
							</TabsTrigger>
							<TabsTrigger className='bassin-tab' value='worker'>
								Worker Setup
							</TabsTrigger>
						</TabsList>
					</div>
					<FadeScrollArea className='h-[min(400px,calc(90dvh-200px))]'>
						<TabsContent value='stratum' className='mt-4 min-h-[310px] space-y-4'>
							<div className='flex flex-col sm:flex-row gap-4'>
								<div className='bg-gradient-to-b from-[#18262e] to-[#0b1319] p-5 rounded-xl sm:w-[240px] shrink-0'>
									<h3 className='text-white/60 text-[12px] font-normal mb-3 text-center'>Local Stratum</h3>
									<div className='mx-auto w-[196px] h-[196px] p-2 bg-[#d6f4ff] rounded-md'>
										<QrSvg value={uri} width={180} height={180} level='Q' fgColor='#092632' bgColor='#d6f4ff' />
									</div>
								</div>
								<div className='divide-y divide-white/6 overflow-hidden rounded-xl w-full h-fit bg-gradient-to-b from-[#18262e] to-[#0b1319]'>
									<Field label='URL' value={uri} />
									<Field label='Host' value={host} />
									<Field label='Port' value={String(BASSIN_STRATUM_PORT)} />
									<Field label='Password' value='x' />
								</div>
							</div>
							<p className='text-white/60 text-[13px]'>
								Use your pool server’s reachable LAN address. If you changed the Stratum port or use a proxy to open
								Bassin, enter the actual mining host and port.
							</p>
						</TabsContent>
						<TabsContent value='stratum-v2' className='mt-4 min-h-[310px] space-y-4'>
							{sv2 && !sv2.enabled && (
								<p role='status' className='text-xs text-amber-200 bg-amber-400/10 rounded-lg p-3'>
									Stratum V2 is disabled. Toggle it on in Settings → Stratum V2 — changes save and reload CKPool
									automatically.
								</p>
							)}
							{sv2?.enabled && sv2.ephemeralKeys && (
								<p role='status' className='text-xs text-amber-200 bg-amber-400/10 rounded-lg p-3'>
									The running pool is using ephemeral SV2 keys. Set persistent{' '}
									<code className='font-mono'>/sv2</code> key paths in Settings → Stratum V2 so your authority key
									survives restarts.
								</p>
							)}
							<div className='flex flex-col sm:flex-row gap-4'>
								<div className='bg-gradient-to-b from-[#18262e] to-[#0b1319] p-5 rounded-xl sm:w-[240px] shrink-0'>
									<h3 className='text-white/60 text-[12px] font-normal mb-3 text-center'>Noise-Encrypted SV2</h3>
									{sv2?.authorityPubkey ? (
										<div className='mx-auto w-[196px] h-[196px] p-2 bg-[#d6f4ff] rounded-md'>
											<QrSvg value={sv2Uri} width={180} height={180} level='Q' fgColor='#092632' bgColor='#d6f4ff' />
										</div>
									) : (
										<div className='mx-auto w-[196px] h-[196px] p-4 rounded-md bg-white/5 flex items-center justify-center text-center text-xs text-white/55'>
											{sv2?.enabled
												? 'Waiting for CKPool to log its SV2 authority key.'
												: 'Enable Stratum V2 in Settings to generate your authority key.'}
										</div>
									)}
								</div>
								<div className='divide-y divide-white/6 overflow-hidden rounded-xl w-full h-fit bg-gradient-to-b from-[#18262e] to-[#0b1319]'>
									<Field label='SV2 URL' value={sv2Uri} />
									<Field label='Host' value={host} />
									<Field label='Port' value={String(BASSIN_SV2_PORT)} />
									<Field
										label='Authority Key'
										value={sv2?.authorityPubkey ?? 'Check Settings → Logs after enabling SV2'}
									/>
									{sv2?.jdEnabled && <Field label='JD URL' value={sv2JdUri} />}
								</div>
							</div>
							<p className='text-white/60 text-[13px]'>
								Noise-encrypted Stratum V2 requires the pool’s Base58Check authority public key in the URL path. Solo
								SV2 mining works with both Bitcoin Core and Bitcoin Knots over RPC and ZMQ.
							</p>
						</TabsContent>
						<TabsContent value='worker' className='mt-4 min-h-[310px] space-y-4'>
							<p className='text-[13px] text-white/60'>
								Use a Bitcoin address you control, followed by a dot and a unique worker name for each miner. For
								Stratum V2, use the same format as your channel <code className='font-mono'>user_identity</code>.
							</p>
							<div className='divide-y divide-white/6 rounded-xl bg-white/6'>
								<Field label='Username' value='<bitcoin-address>.<worker-name>' />
								<Field label='Password' value='x' />
							</div>
							<p className='text-[13px] text-white/60'>
								If your miner finds a block, your Bitcoin address receives the full block reward, including transaction
								fees. Bassin charges no pool commission.
							</p>
						</TabsContent>
					</FadeScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
