// Adapted from Umbrel Bitcoin's ConnectionDetails: retain dialog, tabs, QR card, fields, and copy controls.
import {useState} from 'react'
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
import {BASSIN_STRATUM_PORT} from '@/helpers/constants'

function Field({label, value}: {label: string; value: string}) {
	const [open, setOpen] = useState(false)
	function handleCopy() {
		if (copy(value)) {
			setOpen(true)
			setTimeout(() => setOpen(false), 800)
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
						<TabsContent value='worker' className='mt-4 min-h-[310px] space-y-4'>
							<p className='text-[13px] text-white/60'>
								Use a Bitcoin address you control, followed by a dot and a name for this miner.
							</p>
							<div className='divide-y divide-white/6 rounded-xl bg-white/6'>
								<Field label='Username' value='<bitcoin-address>.<worker-name>' />
								<Field label='Password' value='x' />
							</div>
							<p className='text-[13px] text-white/60'>
								In solo mode, your miner’s Bitcoin address receives the block reward if it finds a block. Use a unique
								worker name for each miner.
							</p>
						</TabsContent>
					</FadeScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
