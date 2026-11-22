import {Toaster as Sonner, type ToasterProps} from 'sonner'

const Toaster = ({...props}: ToasterProps) => {
	return (
		<Sonner
			theme='dark'
			className='toaster group'
			style={
				{
					'--normal-bg': '#12212b',
					'--normal-text': '#ffffff',
					'--normal-border': 'rgba(255, 255, 255, 0.14)',
				} as React.CSSProperties
			}
			{...props}
		/>
	)
}

export {Toaster}
