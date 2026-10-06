import type {Config} from 'tailwindcss'

export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,mdx}'],
	theme: {
		extend: {
			fontFamily: {
				dmSans: ['DM Sans Variable', 'sans-serif'],
				outfit: ['Outfit Variable', 'sans-serif'],
			},
			backgroundImage: {
				'card-gradient': 'linear-gradient(to bottom, #101b22, #080e12)',
				'text-gradient': 'linear-gradient(to bottom, hsla(0,0%,100%,1), hsla(0,0%,100%,0.64))',
				'button-gradient': 'linear-gradient(to bottom, #1a2932, #121c23)',
				'dock-gradient': 'linear-gradient(to bottom, #19252d, #0b1217)',
			},
		},
	},
	plugins: [],
} satisfies Config
