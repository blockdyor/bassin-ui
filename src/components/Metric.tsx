import './Metric.scss';
import FormattedValue from './FormattedValue';
import { Segment } from '../helpers/convert';

export interface MetricProps {
	label: string;
	headline: Segment[];
}

export default function Metric({ label, headline }: MetricProps) {
	return (
		<section className="metric">
			<span className="metric-label">{label}</span>
			<h3 className="metric-headline font-barlow">
				<FormattedValue segments={headline} />
			</h3>
		</section>
	);
}